import type { Player, SquadPlayer, Horizon } from "./types";
import { POS_MAP } from "./types";

export interface AuditEntry {
  player_id: number;
  name: string;
  team: string;
  position: string;
  cost: number;
  selling_price: number;
  xpts: number;
  xpts_5gw: number;
  verdict: "keep" | "hold" | "consider" | "upgrade" | "sell";
  reasoning: string;
  news_status: string | null;
  news_context: string | null;
  best_alternative: {
    player_id: number;
    name: string;
    team: string;
    cost: number;
    xpts: number;
    xpts_uplift: number;
  } | null;
  kit_url: string;
}

export interface AuditResult {
  entries: AuditEntry[];
  squad_value: number;
  squad_xpts: number;
  total_upgrade_potential: number;
  weak_links: number; // count of sell/upgrade verdicts
}

function getXpts(p: { predicted_pts_1gw: number; predicted_pts_5gw: number }, h: Horizon): number {
  return h === 1 ? p.predicted_pts_1gw : p.predicted_pts_5gw;
}

export function auditSquad(
  squad: SquadPlayer[],
  allPlayers: Player[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newsByName: Map<string, any>,
  horizon: Horizon,
  bank: number,
): AuditResult {
  const teamCounts: Record<number, number> = {};
  for (const p of squad) {
    teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1;
  }

  const squadIds = new Set(squad.map((p) => p.player_id));
  const entries: AuditEntry[] = [];

  let squadXpts = 0;
  let totalUplift = 0;
  let weakLinks = 0;

  for (const p of squad) {
    const xpts = Math.round(getXpts(p, horizon) * 10) / 10;
    const xpts5 = Math.round(p.predicted_pts_5gw * 10) / 10;
    squadXpts += xpts;

    const news = newsByName.get(p.web_name.toLowerCase());
    const newsStatus = news?.primary_status || null;

    // Find best alternative at this position
    const sellValue = p.selling_price || p.now_cost;
    const budget = bank + sellValue;
    const teamCountsExceptThis = { ...teamCounts };
    teamCountsExceptThis[p.team_id] = (teamCountsExceptThis[p.team_id] || 1) - 1;

    const alternatives = allPlayers
      .filter(
        (alt) =>
          alt.element_type === p.element_type &&
          !squadIds.has(alt.player_id) &&
          alt.now_cost <= budget &&
          getXpts(alt, horizon) > 0 &&
          (teamCountsExceptThis[alt.team_id] || 0) < 3 &&
          (alt.form || 0) >= 1
      )
      .sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon));

    const bestAlt = alternatives[0];
    const altXpts = bestAlt ? getXpts(bestAlt, horizon) : 0;
    const uplift = bestAlt ? Math.round((altXpts - xpts) * 10) / 10 : 0;

    // Determine verdict
    let verdict: AuditEntry["verdict"] = "hold";
    let reasoning = "";

    if (newsStatus === "ruled_out" || newsStatus === "suspended") {
      verdict = "sell";
      reasoning = `Unavailable (${newsStatus.replace("_", " ")}). Sell immediately.`;
      weakLinks++;
    } else if (newsStatus === "injured") {
      verdict = "sell";
      reasoning = `Injured. Move on unless minor knock.`;
      weakLinks++;
    } else if (xpts < 2.0 && p.element_type !== 1) {
      verdict = "sell";
      reasoning = `Very low projection (${xpts} xPts). Not returning value.`;
      weakLinks++;
    } else if (uplift >= 1.5) {
      verdict = "upgrade";
      reasoning = `${bestAlt.web_name} offers +${uplift} xPts at same/lower price.`;
      weakLinks++;
    } else if (newsStatus === "doubtful") {
      verdict = "consider";
      reasoning = `Fitness doubt. Monitor before deadline.`;
    } else if (uplift >= 0.5) {
      verdict = "consider";
      reasoning = `Slight upgrade available (${bestAlt.web_name}, +${uplift} xPts).`;
    } else if (xpts >= 5 && horizon === 1) {
      verdict = "keep";
      reasoning = `Strong pick (${xpts} xPts). No better option.`;
    } else if (xpts >= 20 && horizon === 5) {
      verdict = "keep";
      reasoning = `Premium asset. Hold through.`;
    } else {
      verdict = "hold";
      reasoning = `Solid pick. No obvious upgrade.`;
    }

    if (uplift > 0) {
      totalUplift += Math.max(0, uplift);
    }

    const pos = POS_MAP[p.element_type];
    entries.push({
      player_id: p.player_id,
      name: p.web_name,
      team: p.team_name,
      position: pos,
      cost: Math.round((p.now_cost / 10) * 10) / 10,
      selling_price: Math.round((sellValue / 10) * 10) / 10,
      xpts,
      xpts_5gw: xpts5,
      verdict,
      reasoning,
      news_status: newsStatus,
      news_context: news?.context || null,
      best_alternative: bestAlt
        ? {
            player_id: bestAlt.player_id,
            name: bestAlt.web_name,
            team: bestAlt.team_name,
            cost: Math.round((bestAlt.now_cost / 10) * 10) / 10,
            xpts: Math.round(altXpts * 10) / 10,
            xpts_uplift: uplift,
          }
        : null,
      kit_url: p.kit_url,
    });
  }

  // Sort by verdict priority, then by uplift
  const verdictPriority = { sell: 0, upgrade: 1, consider: 2, hold: 3, keep: 4 };
  entries.sort((a, b) => {
    const pDiff = verdictPriority[a.verdict] - verdictPriority[b.verdict];
    if (pDiff !== 0) return pDiff;
    const upliftA = a.best_alternative?.xpts_uplift || 0;
    const upliftB = b.best_alternative?.xpts_uplift || 0;
    return upliftB - upliftA;
  });

  return {
    entries,
    squad_value: squad.reduce((s, p) => s + p.now_cost, 0) / 10,
    squad_xpts: Math.round(squadXpts * 10) / 10,
    total_upgrade_potential: Math.round(totalUplift * 10) / 10,
    weak_links: weakLinks,
  };
}
