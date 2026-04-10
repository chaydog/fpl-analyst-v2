"use client";

import type { Horizon } from "@/lib/types";

interface PitchPlayer {
  player_id: number;
  web_name: string;
  element_type: number;
  position: string;
  kit_url: string;
  predicted_pts_1gw: number;
  predicted_pts_5gw: number;
  role?: string;
}

interface PitchProps {
  starters: PitchPlayer[];
  bench: PitchPlayer[];
  horizon: Horizon;
  title?: string;
  onPlayerClick?: (id: number) => void;
  selectedIds?: Set<number>;
  clickable?: boolean;
}

function getXpts(p: PitchPlayer, h: Horizon) {
  return h === 1 ? p.predicted_pts_1gw : p.predicted_pts_5gw;
}

export default function Pitch({
  starters, bench, horizon, title = "Recommended Starting XI",
  onPlayerClick, selectedIds, clickable = false,
}: PitchProps) {
  const rows: Record<string, PitchPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of starters) {
    const pos = p.position || (p.element_type === 1 ? "GKP" : p.element_type === 2 ? "DEF" : p.element_type === 3 ? "MID" : "FWD");
    rows[pos]?.push(p);
  }

  const label = horizon === 1 ? "xPts" : "xPts (5GW)";

  return (
    <div>
      {/* Pitch */}
      <div className="p-4 sm:p-5">
        <div className="relative rounded-lg p-4 sm:p-7 pb-5 min-h-[420px] overflow-hidden"
          style={{
            background: `repeating-linear-gradient(to bottom, #1a5e2a 0px, #1a5e2a 60px, #1f6e32 60px, #1f6e32 120px)`,
          }}
        >
          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120px] h-[120px] border-2 border-white/25 rounded-full" />
          <div className="absolute top-1/2 left-[5%] right-[5%] h-[2px] bg-white/25" />

          {(["GKP", "DEF", "MID", "FWD"] as const).map((pos) => (
            <div key={pos} className="flex justify-center gap-3 relative z-10 mb-4 last:mb-0">
              {rows[pos].map((p) => (
                <PlayerCard
                  key={p.player_id}
                  player={p}
                  horizon={horizon}
                  label={label}
                  clickable={clickable}
                  selected={selectedIds?.has(p.player_id) ?? false}
                  onClick={() => onPlayerClick?.(p.player_id)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Bench */}
      <div className="flex flex-wrap justify-center gap-4 py-4 px-5 bg-[var(--surface2)] border-t border-[var(--border)]">
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] flex items-center mr-2">
          Bench
        </span>
        {bench.map((p) => (
          <PlayerCard
            key={p.player_id}
            player={p}
            horizon={horizon}
            label=""
            small
            clickable={clickable}
            selected={selectedIds?.has(p.player_id) ?? false}
            onClick={() => onPlayerClick?.(p.player_id)}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerCard({
  player: p, horizon, label, small = false, clickable = false, selected = false, onClick,
}: {
  player: PitchPlayer; horizon: Horizon; label: string; small?: boolean;
  clickable?: boolean; selected?: boolean; onClick?: () => void;
}) {
  const xpts = Math.round(getXpts(p, horizon) * 10) / 10;

  return (
    <div
      className={`flex flex-col items-center ${small ? "w-[70px]" : "w-[70px] sm:w-[90px]"} ${
        clickable ? "cursor-pointer group" : ""
      } ${selected ? "opacity-50" : ""}`}
      onClick={clickable ? onClick : undefined}
    >
      <div
        className={`relative flex items-center justify-center mb-0.5 ${
          small ? "w-[44px] h-[50px]" : "w-[42px] h-[48px] sm:w-[58px] sm:h-[66px]"
        } ${clickable ? "group-hover:drop-shadow-[0_0_12px_rgba(255,70,85,0.4)]" : ""} ${
          selected ? "brightness-50" : ""
        }`}
      >
        <img src={p.kit_url} alt={p.web_name} className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />
        {p.role && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--yellow)] text-black text-[10px] font-extrabold flex items-center justify-center">
            {p.role}
          </div>
        )}
      </div>
      <div className={`font-semibold text-center text-white bg-black/70 px-2 py-0.5 rounded max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${
        small ? "text-[10px]" : "text-[9px] sm:text-[11px]"
      } ${selected ? "!bg-[var(--red)]" : ""}`}>
        {p.web_name}
      </div>
      <div className="text-[10px] text-[var(--accent)] font-bold mt-0.5">
        {xpts} {!small && label}
      </div>
    </div>
  );
}
