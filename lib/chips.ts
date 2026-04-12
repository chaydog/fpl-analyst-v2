import type { ChipStatus, ChipRec, GWScheduleItem, SquadPlayer, Horizon } from "./types";

const MID_GW = 19; // chips refresh at GW20
const TOTAL_GWS = 38;

interface ChipUse {
  name: string;
  event: number;
}

interface GWEvent {
  event: number;
  points?: number;
}

interface Fixture {
  gameweek: number | null;
  team_h: number;
  team_a: number;
  finished: boolean;
}

interface GWFixtureInfo {
  type: "normal" | "blank" | "double" | "double+blank";
  doubleTeams: Set<number>;
  blankTeams: Set<number>;
  totalFixtures: number;
}

export function getChipsAvailable(
  chips: ChipUse[],
  currentGw: number
): Record<string, ChipStatus> {
  const inSecondHalf = currentGw > MID_GW;
  const currentHalf = inSecondHalf ? "second" : "first";

  const chipNames: Record<string, string> = {
    wildcard: "Wildcard",
    "3xc": "Triple Captain",
    bboost: "Bench Boost",
    freehit: "Free Hit",
  };

  const result: Record<string, ChipStatus> = {};

  for (const [key, label] of Object.entries(chipNames)) {
    const uses = chips.filter((c) => c.name === key);
    const usedThisHalf = uses.filter((u) =>
      currentHalf === "second" ? u.event > MID_GW : u.event <= MID_GW
    );

    result[key] = usedThisHalf.length > 0
      ? { name: label, available: false, used_gw: usedThisHalf[usedThisHalf.length - 1].event }
      : { name: label, available: true, used_gw: null };
  }

  return result;
}

export function calculateFreeTransfers(history: { current: GWEvent[]; chips: ChipUse[] }): number {
  const events = [...(history.current || [])].sort((a, b) => a.event - b.event);
  const chips: Record<number, string> = {};
  for (const c of history.chips || []) {
    chips[c.event] = c.name;
  }

  let free = 1;
  for (const event of events) {
    const gw = event.event;
    const transfers = (event as unknown as Record<string, number>).event_transfers ?? 0;

    if (chips[gw] && ["wildcard", "freehit"].includes(chips[gw])) {
      free = 1;
      continue;
    }

    const used = Math.min(transfers, free);
    free = Math.min(free - used + 1, 5);
  }

  return free;
}

function analyseGWFixtures(fixtures: Fixture[], gw: number): GWFixtureInfo {
  const gwFixtures = fixtures.filter((f) => f.gameweek === gw);
  const teamFixtureCounts: Record<number, number> = {};

  for (const f of gwFixtures) {
    teamFixtureCounts[f.team_h] = (teamFixtureCounts[f.team_h] || 0) + 1;
    teamFixtureCounts[f.team_a] = (teamFixtureCounts[f.team_a] || 0) + 1;
  }

  const allTeams = new Set(Array.from({ length: 20 }, (_, i) => i + 1));
  const teamsWithFixtures = new Set(Object.keys(teamFixtureCounts).map(Number));
  const blankTeams = new Set([...allTeams].filter((t) => !teamsWithFixtures.has(t)));
  const doubleTeams = new Set(
    Object.entries(teamFixtureCounts).filter(([, c]) => c >= 2).map(([t]) => Number(t))
  );

  let type: GWFixtureInfo["type"] = "normal";
  if (blankTeams.size > 0) type = "blank";
  if (doubleTeams.size > 0) type = type === "blank" ? "double+blank" : "double";

  return { type, doubleTeams, blankTeams, totalFixtures: gwFixtures.length };
}

export function detectPostponedFixtures(
  fixtures: Array<{ gameweek: number | null; team_h: number; team_a: number; finished: boolean }>,
  teamLookup: Record<number, string>
): Array<{ home: string; away: string }> {
  return fixtures
    .filter((f) => f.gameweek === null && !f.finished)
    .map((f) => ({
      home: teamLookup[f.team_h] || `T${f.team_h}`,
      away: teamLookup[f.team_a] || `T${f.team_a}`,
    }));
}

export function detectDgwBgw(fixtures: Fixture[], nextGw: number, count: number = 8): GWScheduleItem[] {
  const result: GWScheduleItem[] = [];
  for (let gw = nextGw; gw < Math.min(nextGw + count, TOTAL_GWS + 1); gw++) {
    const info = analyseGWFixtures(fixtures, gw);
    if (info.type !== "normal") {
      result.push({
        gw,
        type: info.type,
        double_teams: info.doubleTeams.size,
        blank_teams: info.blankTeams.size,
      });
    }
  }
  return result;
}

// ---- Chip planner ----

interface ChipPlan {
  chip: string;
  label: string;
  best_gw: number | null;
  score: number;
  reasoning: string[];
  action: string; // what the user should do to prepare
}

export function planChips(
  chipsAvailable: Record<string, ChipStatus>,
  squad: SquadPlayer[],
  allPlayers: SquadPlayer[],
  fixtures: Fixture[],
  nextGw: number,
  horizon: Horizon
): { plans: Record<string, ChipPlan>; this_week: { play_chip: string | null; reasoning: string } } {
  const plans: Record<string, ChipPlan> = {};
  const gwsLeft = TOTAL_GWS - nextGw + 1;

  // Analyse all remaining GWs
  const gwInfo: Record<number, GWFixtureInfo> = {};
  for (let gw = nextGw; gw <= TOTAL_GWS; gw++) {
    gwInfo[gw] = analyseGWFixtures(fixtures, gw);
  }

  const squadTeamIds = new Set(squad.map((p) => p.team_id));
  const benchPlayers = squad.slice(-4); // rough: last 4 by order
  const getXpts = (p: SquadPlayer) => horizon === 1 ? p.predicted_pts_1gw : p.predicted_pts_5gw;
  const captain = squad.reduce((best, p) => getXpts(p) > getXpts(best) ? p : best, squad[0]);

  // ---- BENCH BOOST ----
  if (chipsAvailable.bboost?.available) {
    let bestGw: number | null = null;
    let bestScore = 0;
    const reasoning: string[] = [];

    const benchTotal = benchPlayers.reduce((s, p) => s + getXpts(p), 0);

    for (let gw = nextGw; gw <= TOTAL_GWS; gw++) {
      const info = gwInfo[gw];
      if (!info) continue;

      let score = benchTotal;

      if (info.type.includes("double")) {
        // How many bench players have DGW?
        const benchDgw = benchPlayers.filter((p) => info.doubleTeams.has(p.team_id)).length;
        score *= (1 + benchDgw * 0.4); // big bonus for bench players in DGW
      }

      if (info.type.includes("blank")) {
        const benchBlank = benchPlayers.filter((p) => info.blankTeams.has(p.team_id)).length;
        score *= (1 - benchBlank * 0.3); // penalty for blank bench players
      }

      if (score > bestScore) {
        bestScore = score;
        bestGw = gw;
      }
    }

    if (benchTotal < 8) {
      reasoning.push("Bench is weak - strengthen via transfers before using BB");
    } else {
      reasoning.push(`Bench total xPts: ${benchTotal.toFixed(1)}`);
    }

    if (bestGw && gwInfo[bestGw]?.type.includes("double")) {
      reasoning.push(`GW${bestGw} is a DGW - best opportunity`);
    }

    const action = benchTotal < 8
      ? "Upgrade bench players first, then deploy BB in a DGW"
      : bestGw ? `Save for GW${bestGw}` : "Use in next DGW";

    plans.bench_boost = {
      chip: "bboost", label: "Bench Boost", best_gw: bestGw,
      score: bestScore, reasoning, action,
    };
  }

  // ---- TRIPLE CAPTAIN ----
  if (chipsAvailable["3xc"]?.available) {
    let bestGw: number | null = null;
    let bestScore = 0;
    const reasoning: string[] = [];

    for (let gw = nextGw; gw <= TOTAL_GWS; gw++) {
      const info = gwInfo[gw];
      if (!info) continue;

      let score = getXpts(captain);

      // TC is worth 1x extra captain points (3x instead of 2x)
      if (info.type.includes("double") && info.doubleTeams.has(captain.team_id)) {
        score *= 1.85; // captain plays twice
        if (gw === nextGw) {
          reasoning.push(`${captain.web_name} has DGW this week`);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestGw = gw;
      }
    }

    if (bestGw && gwInfo[bestGw]?.type.includes("double")) {
      reasoning.push(`Best: GW${bestGw} when ${captain.web_name} has DGW`);
    } else {
      reasoning.push(`${captain.web_name} is your best captain option`);
    }

    // Check if there's a better premium to captain in a future DGW
    const futureDgws = Object.entries(gwInfo).filter(([, info]) => info.type.includes("double"));
    if (futureDgws.length === 0 && gwsLeft <= 5) {
      reasoning.push("No DGWs remaining - use on best single-GW fixture");
    }

    plans.triple_captain = {
      chip: "3xc", label: "Triple Captain", best_gw: bestGw,
      score: bestScore, reasoning,
      action: bestGw && bestGw !== nextGw ? `Save for GW${bestGw}` : "Consider using this week",
    };
  }

  // ---- FREE HIT ----
  if (chipsAvailable.freehit?.available) {
    let bestGw: number | null = null;
    let bestScore = 0;
    const reasoning: string[] = [];

    for (let gw = nextGw; gw <= TOTAL_GWS; gw++) {
      const info = gwInfo[gw];
      if (!info) continue;

      let score = 0;

      if (info.type.includes("blank")) {
        // How many of your squad are blanking?
        const squadBlanks = [...squadTeamIds].filter((t) => info.blankTeams.has(t)).length;
        score = squadBlanks * 3; // 3 points value per blank player avoided

        if (gw === nextGw && squadBlanks >= 3) {
          reasoning.push(`${squadBlanks} of your players have no fixture this week`);
        }
      }

      // FH also good in DGW if squad doesn't align
      if (info.type.includes("double")) {
        const squadDoubles = [...squadTeamIds].filter((t) => info.doubleTeams.has(t)).length;
        const missingDoubles = info.doubleTeams.size - squadDoubles;
        score += missingDoubles * 1.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestGw = gw;
      }
    }

    if (bestGw && gwInfo[bestGw]?.type.includes("blank")) {
      reasoning.push(`GW${bestGw} has ${gwInfo[bestGw].blankTeams.size} teams blanking - ideal for FH`);
    }

    if (bestScore === 0) {
      reasoning.push("No significant blank GWs upcoming - hold");
    }

    plans.free_hit = {
      chip: "freehit", label: "Free Hit", best_gw: bestGw,
      score: bestScore, reasoning,
      action: bestScore > 0 && bestGw ? `Save for GW${bestGw}` : "Hold for a blank GW",
    };
  }

  // ---- WILDCARD ----
  if (chipsAvailable.wildcard?.available) {
    const reasoning: string[] = [];

    // How far is current squad from optimal?
    const optimalIds = new Set(
      [...allPlayers].sort((a, b) => getXpts(b) - getXpts(a)).slice(0, 15).map((p) => p.player_id)
    );
    const currentIds = new Set(squad.map((p) => p.player_id));
    const transfersNeeded = [...currentIds].filter((id) => !optimalIds.has(id)).length;

    let score = 0;
    let bestGw: number | null = null;

    if (transfersNeeded >= 6) {
      score = transfersNeeded * 2;
      reasoning.push(`Squad needs ${transfersNeeded} changes to reach optimal - strong WC case`);
    } else if (transfersNeeded >= 4) {
      score = transfersNeeded;
      reasoning.push(`Squad needs ${transfersNeeded} changes - WC could help`);
    } else {
      score = transfersNeeded * 0.5;
      reasoning.push(`Only ${transfersNeeded} changes needed - probably don't need WC`);
    }

    // Look for fixture swing points
    for (let gw = nextGw; gw <= Math.min(nextGw + 6, TOTAL_GWS); gw++) {
      if (gwInfo[gw]?.type.includes("double")) {
        bestGw = gw;
        score += 2;
        reasoning.push(`WC before GW${gw} (DGW) to build optimal squad`);
        break;
      }
    }

    if (gwsLeft <= 5) {
      score *= 0.5;
      reasoning.push(`Only ${gwsLeft} GWs left - limited WC value`);
    }

    // If you have BB and there's a DGW, WC to build bench for BB
    if (chipsAvailable.bboost?.available) {
      const futureDgw = Object.entries(gwInfo).find(([, info]) => info.type.includes("double"));
      if (futureDgw) {
        reasoning.push(`Consider WC before GW${futureDgw[0]} to build bench for BB`);
        score += 3;
        if (!bestGw) bestGw = parseInt(futureDgw[0]) - 1;
      }
    }

    plans.wildcard = {
      chip: "wildcard", label: "Wildcard", best_gw: bestGw,
      score, reasoning,
      action: score > 5 ? (bestGw ? `Use in GW${bestGw}` : "Use soon") : "Hold for now",
    };
  }

  // ---- This week recommendation ----
  const thisWeekPlans = Object.values(plans)
    .filter((p) => p.best_gw === nextGw)
    .sort((a, b) => b.score - a.score);

  let thisWeek: { play_chip: string | null; reasoning: string };

  if (thisWeekPlans.length > 0 && thisWeekPlans[0].score > 5) {
    thisWeek = {
      play_chip: thisWeekPlans[0].label,
      reasoning: thisWeekPlans[0].reasoning.join(". "),
    };
  } else {
    // Check if any chip's best GW is very soon and we should warn
    const urgentPlans = Object.values(plans).filter(
      (p) => p.best_gw && p.best_gw <= nextGw + 2 && p.score > 5
    );
    if (urgentPlans.length > 0) {
      thisWeek = {
        play_chip: null,
        reasoning: `Prepare for ${urgentPlans[0].label} in GW${urgentPlans[0].best_gw}: ${urgentPlans[0].action}`,
      };
    } else if (Object.keys(plans).length === 0) {
      thisWeek = { play_chip: null, reasoning: "All chips used this half" };
    } else {
      thisWeek = { play_chip: null, reasoning: "Hold all chips - no strong trigger this week" };
    }
  }

  return { plans, this_week: thisWeek };
}
