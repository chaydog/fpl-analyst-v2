"use client";

import { useState } from "react";
import type { Horizon } from "@/lib/types";

interface TopPlayer {
  name: string;
  team: string;
  cost: number;
  xpts: number;
  xpts_5gw?: number;
  form: number;
  xgi90: number;
  penalty: boolean;
}

interface TopPlayersProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  topPlayers: Record<string, any[]>;
  horizon: Horizon;
}

const POSITIONS = ["MID", "FWD", "DEF", "GKP"];

export default function TopPlayers({ topPlayers, horizon }: TopPlayersProps) {
  const [activePos, setActivePos] = useState("MID");

  const players = ([...(topPlayers[activePos] || [])] as TopPlayer[])
    .sort((a, b) => {
      const aVal = horizon === 1 ? a.xpts : (a.xpts_5gw || a.xpts);
      const bVal = horizon === 1 ? b.xpts : (b.xpts_5gw || b.xpts);
      return bVal - aVal;
    });

  const mainLabel = horizon === 1 ? "xPts" : "xPts (5GW)";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold uppercase tracking-wider">Top Players by Position</h2>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-[rgba(0,255,135,0.15)] text-[var(--green)]">
          {mainLabel}
        </span>
      </div>

      <div className="flex border-b border-[var(--border)]">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setActivePos(pos)}
            className={`flex-1 py-3 text-center text-[13px] font-semibold border-b-2 transition-all ${
              activePos === pos
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[var(--text-muted)] border-transparent hover:text-[var(--text)] hover:bg-[var(--surface2)]"
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-[11px] uppercase text-[var(--text-muted)] font-semibold tracking-wide px-3.5 py-2.5 text-left">Player</th>
            <th className="text-[11px] uppercase text-[var(--text-muted)] font-semibold tracking-wide px-3.5 py-2.5 text-left">Team</th>
            <th className="text-[11px] uppercase text-[var(--text-muted)] font-semibold tracking-wide px-3.5 py-2.5 text-right">Cost</th>
            <th className="text-[11px] uppercase text-[var(--text-muted)] font-semibold tracking-wide px-3.5 py-2.5 text-right">{mainLabel}</th>
            <th className="text-[11px] uppercase text-[var(--text-muted)] font-semibold tracking-wide px-3.5 py-2.5 text-right">This GW</th>
            <th className="text-[11px] uppercase text-[var(--text-muted)] font-semibold tracking-wide px-3.5 py-2.5 text-right">Form</th>
            <th className="text-[11px] uppercase text-[var(--text-muted)] font-semibold tracking-wide px-3.5 py-2.5 text-right">xGI/90</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => {
            const mainXpts = horizon === 1 ? p.xpts : (p.xpts_5gw || p.xpts);
            return (
              <tr key={i} className="hover:bg-[var(--surface2)] transition-colors">
                <td className="px-3.5 py-2.5 text-[13px] border-t border-[var(--border)]">
                  <span className="font-semibold">{p.name}</span>
                  {p.penalty && <span className="text-[var(--yellow)] text-[10px] ml-1.5">PEN</span>}
                </td>
                <td className="px-3.5 py-2.5 text-[13px] text-[var(--text-muted)] border-t border-[var(--border)]">
                  {p.team}
                </td>
                <td className="px-3.5 py-2.5 text-[13px] text-right border-t border-[var(--border)]">{p.cost}m</td>
                <td className="px-3.5 py-2.5 text-[13px] text-right text-[var(--accent)] font-bold border-t border-[var(--border)]">
                  {mainXpts}
                </td>
                <td className="px-3.5 py-2.5 text-[13px] text-right text-[var(--text-muted)] border-t border-[var(--border)]">
                  {p.xpts}
                </td>
                <td className="px-3.5 py-2.5 text-[13px] text-right border-t border-[var(--border)]">{p.form}</td>
                <td className="px-3.5 py-2.5 text-[13px] text-right border-t border-[var(--border)]">{p.xgi90}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
