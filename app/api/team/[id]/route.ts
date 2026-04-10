import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getEntry, getEntryHistory, getPicks, getKitUrl } from "@/lib/fpl-api";
import { selectStarting11 } from "@/lib/optimizer";
import { recommendTransfers } from "@/lib/transfers";
import { getChipsAvailable, calculateFreeTransfers, detectDgwBgw, getChipRecommendation } from "@/lib/chips";
import { POS_MAP } from "@/lib/types";
import type { Player, SquadPlayer, Horizon, ReplacementOption } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const teamId = parseInt(id);

  try {
    // Fetch predictions from Supabase
    const { data: predictions, error: predError } = await getSupabase()
      .from("predictions")
      .select("*");

    if (predError || !predictions?.length) {
      return NextResponse.json(
        { error: "Predictions not available. Pipeline may not have run yet." },
        { status: 503 }
      );
    }

    // Fetch user's team from FPL API
    const [entry, history] = await Promise.all([
      getEntry(teamId),
      getEntryHistory(teamId),
    ]);

    // Find current GW
    const currentEvents = (history.current || []).filter(
      (e: Record<string, number>) => (e.points ?? 0) > 0
    );
    if (currentEvents.length === 0) {
      return NextResponse.json({ error: "No gameweek data found" }, { status: 400 });
    }

    const latestGw = Math.max(...currentEvents.map((e: Record<string, number>) => e.event));
    const latestEvent = currentEvents.find(
      (e: Record<string, number>) => e.event === latestGw
    );

    const picksData = await getPicks(teamId, latestGw);
    const picks = picksData.picks as Array<{
      element: number;
      is_captain: boolean;
      multiplier: number;
      selling_price?: number;
    }>;

    // Build player lookup
    const playerMap = new Map<number, Player>();
    for (const p of predictions) {
      const pos = POS_MAP[p.element_type];
      playerMap.set(p.player_id, {
        ...p,
        position: pos,
        kit_url: getKitUrl(p.team_code, p.element_type === 1),
      });
    }

    // Build squad
    const squadIds = picks.map((p) => p.element);
    const pickInfo = new Map(picks.map((p) => [p.element, p]));
    const squad: SquadPlayer[] = [];

    for (const pid of squadIds) {
      const player = playerMap.get(pid);
      if (!player) continue;
      const pick = pickInfo.get(pid)!;
      squad.push({
        ...player,
        selling_price: pick.selling_price || player.now_cost,
        is_captain: pick.is_captain,
        multiplier: pick.multiplier,
      });
    }

    const bank = latestEvent?.bank ?? 0;
    const freeTransfers = calculateFreeTransfers(history);

    // Next GW
    const { data: pipelineRun } = await getSupabase()
      .from("pipeline_runs")
      .select("next_gw, run_at")
      .order("run_at", { ascending: false })
      .limit(1)
      .single();

    const nextGw = pipelineRun?.next_gw ?? latestGw + 1;
    const updatedAt = pipelineRun?.run_at ?? null;

    // Starting XI
    const lineup1 = selectStarting11(squad, 1);
    const lineup5 = selectStarting11(squad, 5);

    // Transfer recommendations for both horizons
    const allPlayers = [...playerMap.values()];
    const recs1gw = recommendTransfers(squad, allPlayers, freeTransfers, bank, 1);
    const recs5gw = recommendTransfers(squad, allPlayers, freeTransfers, bank, 5);

    // Chips
    const chips = history.chips || [];
    const chipsAvailable = getChipsAvailable(chips, nextGw);

    // Fixtures for DGW/BGW detection
    const { data: fixtures } = await getSupabase().from("fixtures").select("*").eq("finished", false);
    const schedule = detectDgwBgw(
      (fixtures || []).map((f) => ({
        gameweek: f.gameweek,
        team_h: f.team_h,
        team_a: f.team_a,
        finished: f.finished,
      })),
      nextGw
    );

    const chipRecs: Record<string, { best_gw: number | null; score: number; reasoning: string[] }> = {};
    // Simple per-chip recs
    for (const [key, chip] of Object.entries(chipsAvailable)) {
      if (chip.available) {
        const bestDgw = schedule.find((s) => s.type.includes("double"));
        const bestBgw = schedule.find((s) => s.type.includes("blank"));
        if (key === "bboost" && bestDgw) {
          chipRecs[key] = { best_gw: bestDgw.gw, score: 8, reasoning: [`Best in DGW${bestDgw.gw} - ${bestDgw.double_teams} teams doubled`] };
        } else if (key === "3xc" && bestDgw) {
          chipRecs[key] = { best_gw: bestDgw.gw, score: 7, reasoning: [`Captain plays twice in DGW${bestDgw.gw}`] };
        } else if (key === "freehit" && bestBgw) {
          chipRecs[key] = { best_gw: bestBgw.gw, score: 9, reasoning: [`${bestBgw.blank_teams} teams blanking in GW${bestBgw.gw}`] };
        } else if (key === "wildcard") {
          chipRecs[key] = { best_gw: null, score: 3, reasoning: ["Save for fixture swings or squad overhaul"] };
        }
      }
    }

    const chipThisWeek = getChipRecommendation(chipsAvailable, squad, schedule, nextGw);

    // Top players by position
    const topPlayers: Record<string, ReplacementOption[]> = {};
    for (const [posId, posName] of Object.entries(POS_MAP)) {
      const posPlayers = allPlayers
        .filter((p) => p.element_type === parseInt(posId))
        .sort((a, b) => b.predicted_pts_1gw - a.predicted_pts_1gw)
        .slice(0, 10)
        .map((p) => ({
          player_id: p.player_id,
          name: p.web_name,
          team: p.team_name,
          position: posName,
          cost: Math.round((p.now_cost / 10) * 10) / 10,
          xpts: Math.round(p.predicted_pts_1gw * 10) / 10,
          xpts_5gw: Math.round(p.predicted_pts_5gw * 10) / 10,
          form: Math.round((p.form || 0) * 10) / 10,
          xgi90: Math.round((p.xgi_per90 || 0) * 100) / 100,
          penalty: p.is_penalty_taker,
        }));
      topPlayers[posName] = posPlayers;
    }

    // Format starters/bench with roles
    function formatLineup(lineup: ReturnType<typeof selectStarting11>) {
      return {
        starters: lineup.starters.map((p) => ({
          ...p,
          role: p.player_id === lineup.captain_id ? "C" : p.player_id === lineup.vice_captain_id ? "VC" : "",
        })),
        bench: lineup.bench,
      };
    }

    const l1 = formatLineup(lineup1);
    const l5 = formatLineup(lineup5);

    return NextResponse.json({
      team_name: entry.name || "Unknown",
      overall_rank: entry.summary_overall_rank || 0,
      total_points: entry.summary_overall_points || 0,
      bank: Math.round((bank / 10) * 10) / 10,
      free_transfers: freeTransfers,
      next_gw: nextGw,
      starters_1gw: l1.starters,
      bench_1gw: l1.bench,
      starters_5gw: l5.starters,
      bench_5gw: l5.bench,
      captain_id_1gw: lineup1.captain_id,
      vice_captain_id_1gw: lineup1.vice_captain_id,
      captain_id_5gw: lineup5.captain_id,
      vice_captain_id_5gw: lineup5.vice_captain_id,
      transfers_1gw: recs1gw,
      transfers_5gw: recs5gw,
      top_players: topPlayers,
      chips_available: chipsAvailable,
      chip_recommendations: chipRecs,
      chip_this_week: chipThisWeek,
      gw_schedule: schedule,
      updated_at: updatedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Team API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
