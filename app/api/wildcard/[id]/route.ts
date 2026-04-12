import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getEntry, getEntryHistory, getPicks, getKitUrl } from "@/lib/fpl-api";
import { buildWildcard } from "@/lib/wildcard";
import { POS_MAP } from "@/lib/types";
import type { Player } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const teamId = parseInt(id);
  const url = new URL(request.url);
  const gwsParam = url.searchParams.get("gws") || "";
  const customGws = gwsParam ? gwsParam.split(",").map(Number).filter((n) => !isNaN(n)) : null;

  try {
    const [{ data: predictions }, { data: gwPredsData }, { data: teamNews }] = await Promise.all([
      getSupabase().from("predictions").select("*"),
      getSupabase().from("gw_predictions").select("*"),
      getSupabase().from("team_news").select("*"),
    ]);

    if (!predictions?.length) {
      return NextResponse.json({ error: "Predictions not available" }, { status: 503 });
    }

    // Fetch user's team
    const [entry, history] = await Promise.all([
      getEntry(teamId),
      getEntryHistory(teamId),
    ]);

    const currentEvents = (history.current || []).filter(
      (e: Record<string, number>) => (e.points ?? 0) > 0,
    );
    const latestGw = Math.max(...currentEvents.map((e: Record<string, number>) => e.event));
    const latestEvent = currentEvents.find((e: Record<string, number>) => e.event === latestGw);
    const currentGw = entry.current_event || latestGw;

    // Fetch picks for current GW
    let picksData;
    try {
      picksData = await getPicks(teamId, currentGw);
    } catch {
      picksData = await getPicks(teamId, latestGw);
    }
    const picks = picksData.picks as Array<{ element: number; selling_price?: number }>;

    // Calculate budget: bank + sum of selling prices
    const bank = latestEvent?.bank ?? 0;
    const selling_total = picks.reduce((s, p) => s + (p.selling_price || 0), 0);
    const budget = bank + selling_total; // in 0.1m units

    // Build news lookup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newsByName = new Map<string, any>();
    for (const n of teamNews || []) {
      newsByName.set((n.player_name as string).toLowerCase(), n);
    }

    // Build team code lookup for kit URLs
    const { data: teamsData } = await getSupabase().from("teams").select("id, code");
    const teamCodeMap: Record<number, number> = {};
    for (const t of (teamsData || [])) {
      teamCodeMap[t.id as number] = t.code as number;
    }

    // Build players with kit URLs
    const allPlayers: Player[] = predictions.map((p) => ({
      ...p,
      position: POS_MAP[p.element_type],
      kit_url: getKitUrl(teamCodeMap[p.team_id] || p.team_code, p.element_type === 1),
    }));

    // Build per-GW predictions lookup
    const gwPredictions: Record<number, Record<number, number>> = {};
    for (const gp of (gwPredsData || [])) {
      const gw = gp.gameweek as number;
      const pid = gp.player_id as number;
      if (!gwPredictions[gw]) gwPredictions[gw] = {};
      gwPredictions[gw][pid] = gp.predicted_pts as number;
    }

    // Default target GWs: next 3 (good for WC + BB planning)
    let targetGws = customGws;
    if (!targetGws || targetGws.length === 0) {
      const { data: pipelineRun } = await getSupabase()
        .from("pipeline_runs")
        .select("next_gw")
        .order("run_at", { ascending: false })
        .limit(1)
        .single();
      const nextGw = pipelineRun?.next_gw ?? latestGw + 1;
      targetGws = [nextGw, nextGw + 1, nextGw + 2];
    }

    const result = buildWildcard(allPlayers, budget, targetGws, gwPredictions, newsByName);

    return NextResponse.json({
      ...result,
      budget: Math.round((budget / 10) * 10) / 10,
      bank: Math.round((bank / 10) * 10) / 10,
      selling_total: Math.round((selling_total / 10) * 10) / 10,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Wildcard API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
