const BASE = "https://fantasy.premierleague.com/api";

export async function getEntry(teamId: number) {
  const res = await fetch(`${BASE}/entry/${teamId}/`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Team ${teamId} not found`);
  return res.json();
}

export async function getEntryHistory(teamId: number) {
  const res = await fetch(`${BASE}/entry/${teamId}/history/`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`History for team ${teamId} not found`);
  return res.json();
}

export async function getPicks(teamId: number, gw: number) {
  const res = await fetch(`${BASE}/entry/${teamId}/event/${gw}/picks/`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Picks for team ${teamId} GW${gw} not found`);
  return res.json();
}

export async function getBootstrap() {
  const res = await fetch(`${BASE}/bootstrap-static/`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error("Failed to fetch FPL bootstrap data");
  return res.json();
}

export function getKitUrl(teamCode: number, isGk: boolean): string {
  const suffix = isGk ? "_1" : "";
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}${suffix}-110.webp`;
}
