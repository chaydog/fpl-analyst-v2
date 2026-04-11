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
  starters, bench, horizon,
  onPlayerClick, selectedIds, clickable = false,
}: PitchProps) {
  const rows: Record<string, PitchPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of starters) {
    const pos = p.position || (p.element_type === 1 ? "GKP" : p.element_type === 2 ? "DEF" : p.element_type === 3 ? "MID" : "FWD");
    rows[pos]?.push(p);
  }

  const label = horizon === 1 ? "xPts" : "5GW";

  return (
    <div>
      {/* Pitch */}
      <div className="p-3 sm:p-4">
        <div className="relative rounded-xl overflow-hidden min-h-[440px] sm:min-h-[480px]"
          style={{
            background: `repeating-linear-gradient(to bottom, #2d8a4e 0px, #2d8a4e 60px, #339956 60px, #339956 120px)`,
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.12)',
          }}
        >
          {/* Pitch markings */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100px] h-[100px] sm:w-[130px] sm:h-[130px] border-2 border-white/20 rounded-full" />
          <div className="absolute top-1/2 left-[4%] right-[4%] h-[2px] bg-white/15" />
          {/* Penalty areas */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[50%] h-[18%] border-b-2 border-l-2 border-r-2 border-white/12 rounded-b-sm" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[50%] h-[18%] border-t-2 border-l-2 border-r-2 border-white/12 rounded-t-sm" />

          {/* Player rows - spread across full width */}
          <div className="relative z-10 flex flex-col justify-between h-full py-5 sm:py-7 px-2 sm:px-4" style={{ minHeight: '440px' }}>
            {(["GKP", "DEF", "MID", "FWD"] as const).map((pos) => (
              <div key={pos} className="flex justify-around items-center w-full px-2 sm:px-6">
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
      </div>

      {/* Bench */}
      <div className="flex flex-wrap justify-center gap-3 sm:gap-5 py-3 px-4 bg-[var(--surface2)] border-t border-[var(--border)]">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] flex items-center mr-1 font-medium"
          style={{ fontFamily: 'var(--font-mono)' }}>
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
      className={`flex flex-col items-center ${small ? "w-[60px] sm:w-[70px]" : "w-[60px] sm:w-[80px]"} ${
        clickable ? "cursor-pointer group" : ""
      } ${selected ? "" : ""} transition-all duration-200`}
      onClick={clickable ? onClick : undefined}
    >
      {/* Kit image - squarer proportions */}
      <div
        className={`relative flex items-center justify-center transition-all duration-200 ${
          small ? "w-[44px] h-[44px] sm:w-[50px] sm:h-[50px]" : "w-[54px] h-[54px] sm:w-[68px] sm:h-[68px]"
        } ${clickable ? "group-hover:scale-115 group-hover:-translate-y-1" : ""} ${
          selected ? "grayscale scale-90 opacity-40" : ""
        }`}
        style={clickable ? {
          filter: selected ? 'grayscale(1) brightness(0.5)' : undefined,
          transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        } : undefined}
      >
        <img
          src={p.kit_url}
          alt={p.web_name}
          className="w-full h-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
          style={{ objectPosition: 'center top' }}
        />
        {p.role && (
          <div className={`absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full text-[9px] font-bold flex items-center justify-center shadow-sm ${
            p.role === 'C'
              ? 'bg-[var(--gold)] text-white'
              : 'bg-white/90 text-[var(--text)]'
          }`}>
            {p.role}
          </div>
        )}
      </div>
      {/* Name pill */}
      <div className={`font-semibold text-center px-2 py-[2px] rounded-md max-w-full overflow-hidden text-ellipsis whitespace-nowrap mt-0.5 ${
        small ? "text-[9px]" : "text-[9px] sm:text-[10px]"
      } ${selected ? "bg-[var(--red)] text-white" : "bg-[var(--text)] text-[var(--bg)]"}`}
        style={{ fontFamily: 'var(--font-body)' }}>
        {p.web_name}
      </div>
      {/* xPts */}
      <div className={`text-[9px] sm:text-[10px] font-bold mt-[2px] px-1.5 py-[1px] rounded ${
        small
          ? "text-[var(--text-muted)]"
          : "text-white bg-black/50 backdrop-blur-sm"
      }`}
        style={{ fontFamily: 'var(--font-mono)' }}>
        {xpts} {!small && label}
      </div>
    </div>
  );
}
