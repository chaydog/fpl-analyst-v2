import type { Player, SquadPlayer, Horizon } from "./types";
import { POS_MAP } from "./types";

export interface WildcardPlayer {
  player_id: number;
  name: string;
  team: string;
  team_id: number;
  position: string;
  cost: number;
  xpts_target: number; // sum of predicted points over target GW range
  xpts_per_gw: Record<number, number>; // per-GW breakdown
  kit_url: string;
  news_status?: string | null;
}

export interface WildcardResult {
  squad: WildcardPlayer[];
  starters: WildcardPlayer[];
  bench: WildcardPlayer[];
  captain_id: number;
  vice_captain_id: number;
  total_cost: number;
  total_xpts: number;
  target_gws: number[];
  by_position: Record<string, WildcardPlayer[]>;
}

interface PlayerScore {
  player: Player;
  score: number;
  per_gw: Record<number, number>;
}

/**
 * Build an optimal 15-man squad using a greedy + local search approach.
 *
 * Constraints:
 * - 2 GKP, 5 DEF, 5 MID, 3 FWD
 * - Total cost <= budget (in 0.1m units)
 * - Max 3 players per team
 * - Maximizes sum of predicted points over target_gws
 */
export function buildWildcard(
  allPlayers: Player[],
  budget: number,
  targetGws: number[],
  gwPredictions: Record<number, Record<number, number>>, // gw -> player_id -> pts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newsByName?: Map<string, any>,
  forcedPlayers: Set<number> = new Set(),
): WildcardResult {
  // Score each player = sum of predicted points over target GWs
  const scored: PlayerScore[] = allPlayers
    .map((p) => {
      const perGw: Record<number, number> = {};
      let score = 0;
      for (const gw of targetGws) {
        const pts = gwPredictions[gw]?.[p.player_id] ?? 0;
        perGw[gw] = pts;
        score += pts;
      }
      return { player: p, score, per_gw: perGw };
    })
    .filter((s) => s.score > 0 || forcedPlayers.has(s.player.player_id))
    .sort((a, b) => b.score - a.score);

  // Greedy initial selection with budget/team constraints
  const POSITION_LIMITS: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };
  const selected: PlayerScore[] = [];
  const positionCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const teamCounts: Record<number, number> = {};
  let remainingBudget = budget;

  // Step 1: Force in required players
  for (const id of forcedPlayers) {
    const p = scored.find((s) => s.player.player_id === id);
    if (!p) continue;
    selected.push(p);
    positionCounts[p.player.element_type]++;
    teamCounts[p.player.team_id] = (teamCounts[p.player.team_id] || 0) + 1;
    remainingBudget -= p.player.now_cost;
  }

  // Step 2: Greedy fill. Sort by score desc, take if satisfies constraints.
  for (const s of scored) {
    if (selected.some((sel) => sel.player.player_id === s.player.player_id)) continue;

    const pos = s.player.element_type;
    const team = s.player.team_id;

    if (positionCounts[pos] >= POSITION_LIMITS[pos]) continue;
    if ((teamCounts[team] || 0) >= 3) continue;
    if (s.player.now_cost > remainingBudget) continue;

    // Ensure we leave enough budget for remaining slots
    const slotsLeft = 15 - selected.length - 1;
    const minCostPerSlot = 39; // 3.9m minimum (budget GKP/DEF)
    if (remainingBudget - s.player.now_cost < slotsLeft * minCostPerSlot) continue;

    selected.push(s);
    positionCounts[pos]++;
    teamCounts[team] = (teamCounts[team] || 0) + 1;
    remainingBudget -= s.player.now_cost;

    if (selected.length === 15) break;
  }

  // Step 3: Fill remaining slots with cheapest available (if greedy didn't complete)
  if (selected.length < 15) {
    const cheap = [...scored]
      .filter((s) => !selected.some((sel) => sel.player.player_id === s.player.player_id))
      .sort((a, b) => a.player.now_cost - b.player.now_cost);

    for (const s of cheap) {
      if (selected.length === 15) break;
      const pos = s.player.element_type;
      const team = s.player.team_id;

      if (positionCounts[pos] >= POSITION_LIMITS[pos]) continue;
      if ((teamCounts[team] || 0) >= 3) continue;
      if (s.player.now_cost > remainingBudget) continue;

      selected.push(s);
      positionCounts[pos]++;
      teamCounts[team] = (teamCounts[team] || 0) + 1;
      remainingBudget -= s.player.now_cost;
    }
  }

  // Step 4: Local search - try swapping any selected player for a better one
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 100) {
    improved = false;
    iterations++;

    for (let i = 0; i < selected.length; i++) {
      const current = selected[i];
      const availBudget = remainingBudget + current.player.now_cost;
      const posTeamCounts = { ...teamCounts };
      posTeamCounts[current.player.team_id]--;

      // Find best candidate at same position that fits
      const candidates = scored.filter(
        (s) =>
          s.player.element_type === current.player.element_type &&
          !selected.some((sel) => sel.player.player_id === s.player.player_id) &&
          s.player.now_cost <= availBudget &&
          (posTeamCounts[s.player.team_id] || 0) < 3 &&
          s.score > current.score,
      );

      if (candidates.length === 0) continue;

      const best = candidates[0]; // already sorted by score
      // Replace
      teamCounts[current.player.team_id]--;
      teamCounts[best.player.team_id] = (teamCounts[best.player.team_id] || 0) + 1;
      remainingBudget = remainingBudget + current.player.now_cost - best.player.now_cost;
      selected[i] = best;
      improved = true;
    }
  }

  // Format result
  const formatPlayer = (s: PlayerScore): WildcardPlayer => {
    const p = s.player;
    const news = newsByName?.get(p.web_name.toLowerCase());
    return {
      player_id: p.player_id,
      name: p.web_name,
      team: p.team_name,
      team_id: p.team_id,
      position: POS_MAP[p.element_type],
      cost: Math.round((p.now_cost / 10) * 10) / 10,
      xpts_target: Math.round(s.score * 10) / 10,
      xpts_per_gw: Object.fromEntries(
        Object.entries(s.per_gw).map(([gw, pts]) => [gw, Math.round(pts * 10) / 10]),
      ),
      kit_url: p.kit_url || "",
      news_status: news?.primary_status || null,
    };
  };

  const squad = selected.map(formatPlayer);
  const byPosition: Record<string, WildcardPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of squad) {
    byPosition[p.position].push(p);
  }
  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].sort((a, b) => b.xpts_target - a.xpts_target);
  }

  // Select starters: best 11 respecting formation rules
  const starters = selectBestXI(squad);
  const benchIds = new Set(squad.map((p) => p.player_id).filter((id) => !starters.some((s) => s.player_id === id)));
  const bench = squad.filter((p) => benchIds.has(p.player_id));
  // Bench: GK first, then outfield by xpts
  bench.sort((a, b) => {
    if (a.position === "GKP" && b.position !== "GKP") return -1;
    if (b.position === "GKP" && a.position !== "GKP") return 1;
    return b.xpts_target - a.xpts_target;
  });

  // Captain = best xpts in starters
  const sortedStarters = [...starters].sort((a, b) => b.xpts_target - a.xpts_target);
  const captain_id = sortedStarters[0]?.player_id || 0;
  const vice_captain_id = sortedStarters[1]?.player_id || 0;

  const total_cost = Math.round(squad.reduce((s, p) => s + p.cost * 10, 0)) / 10;
  const total_xpts = Math.round(squad.reduce((s, p) => s + p.xpts_target, 0) * 10) / 10;

  return {
    squad,
    starters,
    bench,
    captain_id,
    vice_captain_id,
    total_cost,
    total_xpts,
    target_gws: targetGws,
    by_position: byPosition,
  };
}

function selectBestXI(squad: WildcardPlayer[]): WildcardPlayer[] {
  const gkps = squad.filter((p) => p.position === "GKP");
  const defs = squad.filter((p) => p.position === "DEF");
  const mids = squad.filter((p) => p.position === "MID");
  const fwds = squad.filter((p) => p.position === "FWD");

  const topGk = gkps.sort((a, b) => b.xpts_target - a.xpts_target)[0];

  // Try each valid formation, pick the one with highest xpts
  const formations = [
    [3, 4, 3], [3, 5, 2], [4, 3, 3], [4, 4, 2], [4, 5, 1], [5, 3, 2], [5, 4, 1],
  ];

  let best: WildcardPlayer[] = [];
  let bestScore = -1;

  for (const [d, m, f] of formations) {
    if (defs.length < d || mids.length < m || fwds.length < f) continue;
    const top = [
      topGk,
      ...defs.sort((a, b) => b.xpts_target - a.xpts_target).slice(0, d),
      ...mids.sort((a, b) => b.xpts_target - a.xpts_target).slice(0, m),
      ...fwds.sort((a, b) => b.xpts_target - a.xpts_target).slice(0, f),
    ];
    const score = top.reduce((s, p) => s + p.xpts_target, 0);
    if (score > bestScore) {
      bestScore = score;
      best = top;
    }
  }

  return best.sort((a, b) => {
    const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
    return order[a.position as keyof typeof order] - order[b.position as keyof typeof order];
  });
}
