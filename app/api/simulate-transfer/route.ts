import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getEntry, getEntryHistory, getPicks, getKitUrl } from "@/lib/fpl-api";
import { selectStarting11 } from "@/lib/optimizer";
import { findReplacements } from "@/lib/transfers";
import { calculateFreeTransfers } from "@/lib/chips";
import { POS_MAP } from "@/lib/types";
import type { Player, SquadPlayer, Horizon } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json();
  const { team_id: teamId, sell_ids: sellIds, force_buys, horizon = 5 } = body;

  if (!sellIds?.length) {
    return NextResponse.json({ error: "No players selected" }, { status: 400 });
  }

  try {
    const { data: predictions } = await getSupabase().from("predictions").select("*");
    if (!predictions?.length) {
      return NextResponse.json({ error: "Predictions not available" }, { status: 503 });
    }

    const playerMap = new Map<number, Player>();
    for (const p of predictions) {
      playerMap.set(p.player_id, {
        ...p,
        position: POS_MAP[p.element_type],
        kit_url: getKitUrl(p.team_code, p.element_type === 1),
      });
    }

    const [entry, history] = await Promise.all([
      getEntry(teamId),
      getEntryHistory(teamId),
    ]);

    const currentEvents = (history.current || []).filter(
      (e: Record<string, number>) => (e.points ?? 0) > 0
    );
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

    const squad: SquadPlayer[] = [];
    for (const pick of picks) {
      const player = playerMap.get(pick.element);
      if (!player) continue;
      squad.push({
        ...player,
        selling_price: pick.selling_price || player.now_cost,
        is_captain: pick.is_captain,
        multiplier: pick.multiplier,
      });
    }

    const bank = latestEvent?.bank ?? 0;
    const freeTransfers = calculateFreeTransfers(history);
    const h = horizon as Horizon;

    const allPlayers = [...playerMap.values()];
    const result = findReplacements(sellIds, squad, allPlayers, bank, h);

    // Apply force_buys if provided
    if (force_buys?.length) {
      for (let i = 0; i < Math.min(force_buys.length, result.replacements.length); i++) {
        if (force_buys[i]) {
          const opt = result.replacements[i].options.find(
            (o) => o.player_id === force_buys[i]
          );
          if (opt) {
            result.replacements[i].selected = opt as typeof result.replacements[number]["selected"];
          }
        }
      }
    }

    // Build new squad with replacements applied
    const selectedBuyIds = new Set(
      result.replacements.map((r) => r.selected?.player_id).filter(Boolean)
    );
    const remainingSquad = squad.filter((p) => !sellIds.includes(p.player_id));
    const newSquadPlayers: SquadPlayer[] = [...remainingSquad];

    for (const r of result.replacements) {
      if (r.selected) {
        const player = playerMap.get(r.selected.player_id);
        if (player) {
          newSquadPlayers.push({
            ...player,
            selling_price: player.now_cost,
            is_captain: false,
            multiplier: 1,
          });
        }
      }
    }

    let starters: SquadPlayer[] = [];
    let bench: SquadPlayer[] = [];

    if (newSquadPlayers.length === 15) {
      const lineup = selectStarting11(newSquadPlayers, h);
      starters = lineup.starters.map((p) => ({
        ...p,
        role: p.player_id === lineup.captain_id ? "C" : p.player_id === lineup.vice_captain_id ? "VC" : "",
      })) as SquadPlayer[];
      bench = lineup.bench;
    }

    return NextResponse.json({
      replacements: result.replacements,
      starters,
      bench,
      bank_remaining: result.bankRemaining,
      free_transfers: freeTransfers,
      hits: Math.max(0, sellIds.length - freeTransfers),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
