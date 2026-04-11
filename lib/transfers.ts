import type { Player, SquadPlayer, TransferRec, TransferPlayer, Horizon } from "./types";
import { POS_MAP } from "./types";

function getXpts(p: { predicted_pts_1gw: number; predicted_pts_5gw: number }, horizon: Horizon): number {
  return horizon === 1 ? p.predicted_pts_1gw : p.predicted_pts_5gw;
}

function toTransferPlayer(p: Player | SquadPlayer, horizon: Horizon): TransferPlayer {
  return {
    player_id: p.player_id,
    name: p.web_name,
    team: p.team_name,
    position: POS_MAP[p.element_type],
    cost: Math.round((p.now_cost / 10) * 10) / 10,
    xpts: Math.round(getXpts(p, horizon) * 10) / 10,
  };
}

function buildReason(sell: SquadPlayer, buy: Player, horizon: Horizon): string {
  const parts: string[] = [];
  const diff = getXpts(buy, horizon) - getXpts(sell, horizon);
  const label = horizon === 1 ? "xPts" : "xPts (5GW)";
  parts.push(`+${diff.toFixed(1)} ${label} uplift`);

  if (buy.xgi_per90 > sell.xgi_per90 + 0.05) {
    parts.push(`higher xGI/90 (${buy.xgi_per90.toFixed(2)} vs ${sell.xgi_per90.toFixed(2)})`);
  }

  const sellForm = sell.form || 0;
  const buyForm = buy.form || 0;
  if (buyForm > sellForm + 0.5) {
    parts.push(`better form (${buyForm.toFixed(1)} vs ${sellForm.toFixed(1)})`);
  } else if (sellForm > buyForm + 0.5) {
    parts.push("lower form but model expects reversion");
  }

  if (buy.opponent_difficulty < sell.opponent_difficulty) {
    parts.push(`easier fixture (difficulty ${buy.opponent_difficulty} vs ${sell.opponent_difficulty})`);
  }

  if (buy.is_penalty_taker && !sell.is_penalty_taker) {
    parts.push("on penalties");
  }

  const costDiff = sell.now_cost - buy.now_cost;
  if (costDiff > 5) {
    parts.push(`saves ${(costDiff / 10).toFixed(1)}m`);
  }

  return parts.join("; ");
}

export function recommendTransfers(
  squad: SquadPlayer[],
  allPlayers: Player[],
  freeTransfers: number,
  bank: number,
  horizon: Horizon,
  maxTransfers: number = 2
): TransferRec[] {
  const recommendations: TransferRec[] = [];

  for (let n = 1; n <= maxTransfers; n++) {
    const hits = Math.max(0, n - freeTransfers);
    const hitCost = hits * 4;

    const sellPoolSize = Math.min(squad.length, n * 3);
    const sellCandidates = [...squad]
      .sort((a, b) => getXpts(a, horizon) - getXpts(b, horizon))
      .slice(0, sellPoolSize);

    let bestRec: TransferRec | null = null;
    let bestGain = -999;

    // For single transfer, try each candidate
    if (n === 1) {
      for (const sell of sellCandidates) {
        const remainingIds = new Set(squad.map((p) => p.player_id));
        remainingIds.delete(sell.player_id);
        const teamCounts: Record<number, number> = {};
        for (const p of squad) {
          if (p.player_id !== sell.player_id) {
            teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1;
          }
        }

        const sellValue = sell.selling_price || sell.now_cost;
        const budget = bank + sellValue;

        const candidates = allPlayers.filter(
          (p) =>
            p.element_type === sell.element_type &&
            !remainingIds.has(p.player_id) &&
            p.now_cost <= budget &&
            getXpts(p, horizon) > 0 &&
            (teamCounts[p.team_id] || 0) < 3 &&
            (p.form || 0) >= 1 &&
            (p.start_rate_5 || 0) >= 0.4
        );

        if (candidates.length === 0) continue;
        candidates.sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon));
        const best = candidates[0];

        const gain = getXpts(best, horizon) - getXpts(sell, horizon) - hitCost;
        if (gain > bestGain) {
          bestGain = gain;
          bestRec = {
            n_transfers: 1,
            hits,
            hit_cost: hitCost,
            points_gain: Math.round(gain * 100) / 100,
            bank_after: Math.round((bank + sellValue - best.now_cost) / 10 * 10) / 10,
            raw_gain: Math.round((gain + hitCost) * 10) / 10,
            worth_it: gain > 0,
            out: [toTransferPlayer(sell, horizon)],
            in: [toTransferPlayer(best, horizon)],
            reasons: [buildReason(sell, best, horizon)],
          };
        }
      }
    }

    // For 2 transfers, try pairs
    if (n === 2) {
      for (let i = 0; i < sellCandidates.length; i++) {
        for (let j = i + 1; j < sellCandidates.length; j++) {
          const sells = [sellCandidates[i], sellCandidates[j]];
          const remainingIds = new Set(squad.map((p) => p.player_id));
          sells.forEach((s) => remainingIds.delete(s.player_id));

          const teamCounts: Record<number, number> = {};
          for (const p of squad) {
            if (remainingIds.has(p.player_id)) {
              teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1;
            }
          }

          const sellValue = sells.reduce((s, p) => s + (p.selling_price || p.now_cost), 0);
          let budgetLeft = bank + sellValue;
          const bought: Player[] = [];
          const boughtIds = new Set<number>();
          let valid = true;

          for (const sell of sells) {
            const candidates = allPlayers.filter(
              (p) =>
                p.element_type === sell.element_type &&
                !remainingIds.has(p.player_id) &&
                !boughtIds.has(p.player_id) &&
                p.now_cost <= budgetLeft &&
                getXpts(p, horizon) > 0 &&
                (teamCounts[p.team_id] || 0) < 3 &&
                (p.form || 0) >= 1 &&
                (p.start_rate_5 || 0) >= 0.4
            );

            if (candidates.length === 0) { valid = false; break; }
            candidates.sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon));
            const best = candidates[0];
            bought.push(best);
            boughtIds.add(best.player_id);
            budgetLeft -= best.now_cost;
            teamCounts[best.team_id] = (teamCounts[best.team_id] || 0) + 1;
          }

          if (!valid || bought.length !== 2) continue;

          const sellPts = sells.reduce((s, p) => s + getXpts(p, horizon), 0);
          const buyPts = bought.reduce((s, p) => s + getXpts(p, horizon), 0);
          const gain = buyPts - sellPts - hitCost;

          if (gain > bestGain) {
            bestGain = gain;
            bestRec = {
              n_transfers: 2,
              hits,
              hit_cost: hitCost,
              points_gain: Math.round(gain * 100) / 100,
              bank_after: Math.round(budgetLeft / 10 * 10) / 10,
              raw_gain: Math.round((gain + hitCost) * 10) / 10,
              worth_it: gain > 0,
              out: sells.map((s) => toTransferPlayer(s, horizon)),
              in: bought.map((b) => toTransferPlayer(b, horizon)),
              reasons: sells.map((s, idx) => buildReason(s, bought[idx], horizon)),
            };
          }
        }
      }
    }

    if (bestRec) recommendations.push(bestRec);
  }

  return recommendations;
}

export function findReplacements(
  sellIds: number[],
  squad: SquadPlayer[],
  allPlayers: Player[],
  bank: number,
  horizon: Horizon
): { replacements: ReplacementResult[]; bankRemaining: number } {
  const sellPlayers = squad.filter((p) => sellIds.includes(p.player_id));
  const remaining = squad.filter((p) => !sellIds.includes(p.player_id));

  const teamCounts: Record<number, number> = {};
  for (const p of remaining) {
    teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1;
  }

  const remainingIds = new Set(remaining.map((p) => p.player_id));
  const sellValue = sellPlayers.reduce((s, p) => s + (p.selling_price || p.now_cost), 0);
  let budgetLeft = bank + sellValue;
  const boughtIds = new Set<number>();

  const replacements: ReplacementResult[] = [];

  for (const sell of sellPlayers) {
    const candidates = allPlayers
      .filter(
        (p) =>
          p.element_type === sell.element_type &&
          !remainingIds.has(p.player_id) &&
          !boughtIds.has(p.player_id) &&
          getXpts(p, horizon) > 0 &&
          p.now_cost <= budgetLeft &&
          (teamCounts[p.team_id] || 0) < 3 &&
          (p.form || 0) >= 1 && // exclude players with no recent returns
          (p.start_rate_5 || 0) >= 0.4 // exclude players barely playing
      )
      .sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon))
      .slice(0, 5);

    const options = candidates.map((p) => {
      // Build reasoning tags explaining why the model rates this player
      const tags: string[] = [];

      if (p.opponent_difficulty <= 2) tags.push("Easy fixture");
      else if (p.opponent_difficulty >= 4) tags.push("Tough fixture");

      if (p.is_home) tags.push("Home");
      if ((p as any).n_fixtures_in_gw >= 2) tags.push("DGW");
      if (p.is_penalty_taker) tags.push("Penalties");

      if (p.form >= 5) tags.push("In form");
      else if (p.form >= 3) tags.push("Decent form");

      if (p.xgi_per90 >= 0.4) tags.push("High xGI");
      if (p.start_rate_5 >= 0.9) tags.push("Nailed");
      else if (p.start_rate_5 < 0.6) tags.push("Rotation risk");

      if ((p as any).returning_from_injury) tags.push("Back from injury");
      if ((p as any).suspension_risk) tags.push("Yellow card risk");

      // Cost comparison
      const sellCost = sell.now_cost;
      const saving = sellCost - p.now_cost;
      if (saving > 5) tags.push(`Saves ${(saving / 10).toFixed(1)}m`);

      return {
        player_id: p.player_id,
        name: p.web_name,
        team: p.team_name,
        position: POS_MAP[p.element_type],
        cost: Math.round((p.now_cost / 10) * 10) / 10,
        xpts: Math.round(getXpts(p, horizon) * 10) / 10,
        xpts_1gw: Math.round(p.predicted_pts_1gw * 10) / 10,
        form: Math.round((p.form || 0) * 10) / 10,
        xgi90: Math.round((p.xgi_per90 || 0) * 100) / 100,
        penalty: p.is_penalty_taker,
        difficulty: p.opponent_difficulty,
        is_home: p.is_home,
        tags,
      };
    });

    const selected = options.length > 0 ? options[0] : null;

    if (selected) {
      const selectedPlayer = candidates[0];
      budgetLeft -= selectedPlayer.now_cost;
      remainingIds.add(selectedPlayer.player_id);
      boughtIds.add(selectedPlayer.player_id);
      teamCounts[selectedPlayer.team_id] = (teamCounts[selectedPlayer.team_id] || 0) + 1;
    }

    replacements.push({
      selling: toTransferPlayer(sell, horizon),
      selected: selected
        ? { ...selected, position: POS_MAP[sell.element_type] } as any
        : null,
      options,
    });
  }

  return { replacements, bankRemaining: Math.round((budgetLeft / 10) * 10) / 10 };
}

interface ReplacementResult {
  selling: TransferPlayer;
  selected: TransferPlayer & { form?: number; xgi90?: number; penalty?: boolean } | null;
  options: Array<{
    player_id: number;
    name: string;
    team: string;
    position: string;
    cost: number;
    xpts: number;
    form: number;
    xgi90: number;
    penalty: boolean;
  }>;
}
