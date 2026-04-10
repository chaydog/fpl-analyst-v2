import type { ChipStatus, ChipRec, GWScheduleItem, SquadPlayer, Horizon } from "./types";

const MID_GW = 19; // chips refresh at GW20

interface ChipUse {
  name: string;
  event: number;
}

interface GWEvent {
  event: number;
  points?: number;
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

    if (usedThisHalf.length > 0) {
      result[key] = {
        name: label,
        available: false,
        used_gw: usedThisHalf[usedThisHalf.length - 1].event,
      };
    } else {
      result[key] = { name: label, available: true, used_gw: null };
    }
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

export function detectDgwBgw(
  fixtures: Array<{ gameweek: number | null; team_h: number; team_a: number; finished: boolean }>,
  nextGw: number,
  count: number = 8
): GWScheduleItem[] {
  const result: GWScheduleItem[] = [];
  const allTeams = new Set(Array.from({ length: 20 }, (_, i) => i + 1));

  for (let gw = nextGw; gw < nextGw + count; gw++) {
    const gwFixtures = fixtures.filter((f) => f.gameweek === gw);
    const teamFixtureCounts: Record<number, number> = {};

    for (const f of gwFixtures) {
      teamFixtureCounts[f.team_h] = (teamFixtureCounts[f.team_h] || 0) + 1;
      teamFixtureCounts[f.team_a] = (teamFixtureCounts[f.team_a] || 0) + 1;
    }

    const teamsWithFixtures = new Set(Object.keys(teamFixtureCounts).map(Number));
    const blankTeams = [...allTeams].filter((t) => !teamsWithFixtures.has(t));
    const doubleTeams = Object.entries(teamFixtureCounts)
      .filter(([, c]) => c >= 2)
      .map(([t]) => Number(t));

    let type = "normal";
    if (blankTeams.length > 0) type = "blank";
    if (doubleTeams.length > 0) type = type === "blank" ? "double+blank" : "double";

    if (type !== "normal") {
      result.push({
        gw,
        type,
        double_teams: doubleTeams.length,
        blank_teams: blankTeams.length,
      });
    }
  }

  return result;
}

export function getChipRecommendation(
  chipsAvailable: Record<string, ChipStatus>,
  squad: SquadPlayer[],
  schedule: GWScheduleItem[],
  nextGw: number
): { play_chip: string | null; reasoning: string } {
  const hasChips = Object.values(chipsAvailable).some((c) => c.available);
  if (!hasChips) {
    return { play_chip: null, reasoning: "All chips used this half" };
  }

  const thisGwSchedule = schedule.find((s) => s.gw === nextGw);

  // Check for DGW triggers
  if (thisGwSchedule?.type.includes("double")) {
    if (chipsAvailable.bboost?.available) {
      return {
        play_chip: "Bench Boost",
        reasoning: `Double gameweek - ${thisGwSchedule.double_teams} teams with two fixtures`,
      };
    }
    if (chipsAvailable["3xc"]?.available) {
      return {
        play_chip: "Triple Captain",
        reasoning: `Double gameweek - captain plays twice`,
      };
    }
  }

  // Check for BGW triggers
  if (thisGwSchedule?.type.includes("blank") && chipsAvailable.freehit?.available) {
    const squadTeams = new Set(squad.map((p) => p.team_id));
    // Rough check: would need fixture data to know which teams are blank
    return {
      play_chip: null,
      reasoning: `Blank gameweek - consider Free Hit if many of your players are missing`,
    };
  }

  return { play_chip: null, reasoning: "Hold all chips - no strong trigger this week" };
}
