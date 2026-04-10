import type { SquadPlayer, Horizon } from "./types";

function getXpts(p: SquadPlayer, horizon: Horizon): number {
  return horizon === 1 ? p.predicted_pts_1gw : p.predicted_pts_5gw;
}

export function selectStarting11(
  squad: SquadPlayer[],
  horizon: Horizon
): { starters: SquadPlayer[]; bench: SquadPlayer[]; captain_id: number; vice_captain_id: number } {
  // Brute-force: enumerate valid 11s from 15 players
  // Constraints: exactly 1 GKP, at least 3 DEF, at least 1 FWD, exactly 11 total
  const gkps = squad.filter((p) => p.element_type === 1);
  const outfield = squad.filter((p) => p.element_type !== 1);

  // Pick the better GK
  const sortedGkps = [...gkps].sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon));
  const startingGk = sortedGkps[0];
  const benchGk = sortedGkps[1];

  // Pick best 10 from outfield with constraints
  const defs = outfield.filter((p) => p.element_type === 2);
  const mids = outfield.filter((p) => p.element_type === 3);
  const fwds = outfield.filter((p) => p.element_type === 4);

  let bestScore = -1;
  let bestCombo: SquadPlayer[] = [];

  // Try all valid formations: d DEF, m MID, f FWD where d+m+f=10, d>=3, f>=1
  for (let d = 3; d <= Math.min(5, defs.length); d++) {
    for (let f = 1; f <= Math.min(3, fwds.length); f++) {
      const m = 10 - d - f;
      if (m < 0 || m > mids.length) continue;

      const topDefs = [...defs].sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon)).slice(0, d);
      const topMids = [...mids].sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon)).slice(0, m);
      const topFwds = [...fwds].sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon)).slice(0, f);

      const combo = [...topDefs, ...topMids, ...topFwds];
      const score = combo.reduce((s, p) => s + getXpts(p, horizon), 0);

      if (score > bestScore) {
        bestScore = score;
        bestCombo = combo;
      }
    }
  }

  const starters = [startingGk, ...bestCombo];
  const starterIds = new Set(starters.map((p) => p.player_id));

  // Bench: GK first, then outfield by xPts
  const benchOutfield = outfield
    .filter((p) => !starterIds.has(p.player_id))
    .sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon));
  const bench = benchGk ? [benchGk, ...benchOutfield] : benchOutfield;

  // Captain = highest xPts starter, vice = second highest
  const sortedStarters = [...starters].sort((a, b) => getXpts(b, horizon) - getXpts(a, horizon));
  const captain_id = sortedStarters[0].player_id;
  const vice_captain_id = sortedStarters[1].player_id;

  // Sort starters by position for display
  starters.sort((a, b) => a.element_type - b.element_type);

  return { starters, bench, captain_id, vice_captain_id };
}
