"use client";

import type { Horizon } from "@/lib/types";

interface DifferentialsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  topPlayers: Record<string, any[]>;
  horizon: Horizon;
}

export default function Differentials({ topPlayers, horizon }: DifferentialsProps) {
  // Collect all players across positions, find low ownership + high xPts
  const allPlayers = Object.values(topPlayers).flat();

  const differentials = allPlayers
    .filter((p) => {
      const ownership = p.selected_by_percent ?? p.ownership ?? 0;
      return ownership < 10; // under 10% ownership = differential
    })
    .sort((a, b) => {
      const aVal = horizon === 1 ? a.xpts : (a.xpts_5gw || a.xpts);
      const bVal = horizon === 1 ? b.xpts : (b.xpts_5gw || b.xpts);
      return bVal - aVal;
    })
    .slice(0, 8);

  if (differentials.length === 0) return null;

  const label = horizon === 1 ? "xPts" : "xPts (5GW)";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold uppercase tracking-wider">Differential Picks</h2>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-[rgba(150,60,255,0.15)] text-[var(--purple)]">
          &lt;10% owned
        </span>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {differentials.map((p, i) => {
          const mainXpts = horizon === 1 ? p.xpts : (p.xpts_5gw || p.xpts);
          const ownership = p.selected_by_percent ?? p.ownership ?? 0;
          const posColors: Record<string, string> = {
            GKP: "bg-[#e8b100] text-black",
            DEF: "bg-[#2563eb] text-white",
            MID: "bg-[#16a34a] text-white",
            FWD: "bg-[#dc2626] text-white",
          };

          return (
            <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-[var(--surface2)] transition-colors">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${posColors[p.position] || "bg-gray-500 text-white"}`}>
                  {p.position}
                </span>
                <div>
                  <div className="text-sm font-semibold">
                    {p.name}
                    {p.penalty && <span className="text-[var(--yellow)] text-[10px] ml-1.5">PEN</span>}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {p.team} - {p.cost}m - {ownership.toFixed(1)}% owned
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-[var(--accent)]">{mainXpts}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
