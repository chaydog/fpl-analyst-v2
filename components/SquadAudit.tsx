"use client";

import type { Horizon } from "@/lib/types";

interface SquadAuditProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audit: any;
  horizon: Horizon;
}

const VERDICT_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  sell: { label: "Sell", color: "red", icon: "\u2716" },
  upgrade: { label: "Upgrade", color: "red", icon: "\u2191" },
  consider: { label: "Consider", color: "gold", icon: "\u26A0" },
  hold: { label: "Hold", color: "muted", icon: "=" },
  keep: { label: "Keep", color: "accent", icon: "\u2713" },
};

const POS_BG: Record<string, string> = {
  GKP: "bg-[#ca8a04] text-white",
  DEF: "bg-[#1d4ed8] text-white",
  MID: "bg-[#059669] text-white",
  FWD: "bg-[#dc2626] text-white",
};

export default function SquadAudit({ audit, horizon }: SquadAuditProps) {
  if (!audit || !audit.entries) return null;

  const entries = audit.entries as Record<string, unknown>[];
  const label = horizon === 1 ? "xPts" : "xPts (5GW)";

  const byVerdict: Record<string, Record<string, unknown>[]> = {
    sell: [], upgrade: [], consider: [], hold: [], keep: [],
  };
  for (const e of entries) {
    const v = e.verdict as string;
    if (byVerdict[v]) byVerdict[v].push(e);
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold uppercase tracking-wider">Squad Audit</h2>
        <div className="flex gap-3">
          <SummaryBadge label="Weak links" value={audit.weak_links as number} color="red" />
          <SummaryBadge label="Uplift" value={`+${audit.total_upgrade_potential as number}`} color="accent" />
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-5 border-b border-[var(--border)] divide-x divide-[var(--border)]">
        {(["sell", "upgrade", "consider", "hold", "keep"] as const).map((v) => {
          const count = byVerdict[v]?.length || 0;
          const config = VERDICT_CONFIG[v];
          const color =
            config.color === "red" ? "text-[var(--red)]" :
            config.color === "gold" ? "text-[var(--gold)]" :
            config.color === "accent" ? "text-[var(--accent)]" :
            "text-[var(--text-muted)]";
          return (
            <div key={v} className="py-3 text-center">
              <div className={`text-2xl font-bold ${color}`}
                style={{ fontFamily: 'var(--font-display)' }}>
                {count}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}>
                {config.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Player entries */}
      <div className="divide-y divide-[var(--border)]">
        {entries.map((e, i) => {
          const verdict = e.verdict as string;
          const config = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.hold;
          const bestAlt = e.best_alternative as Record<string, unknown> | null;
          const uplift = bestAlt ? (bestAlt.xpts_uplift as number) : 0;
          const newsStatus = e.news_status as string | null;

          const borderColor =
            config.color === "red" ? "border-l-[var(--red)]" :
            config.color === "gold" ? "border-l-[var(--gold)]" :
            config.color === "accent" ? "border-l-[var(--accent)]" :
            "border-l-[var(--border)]";

          return (
            <div key={i} className={`px-5 py-3 border-l-2 ${borderColor}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POS_BG[e.position as string]}`}>
                    {e.position as string}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{e.name as string}</span>
                      <span className="text-xs text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                        {e.team as string} - {e.cost as number}m
                      </span>
                      {newsStatus && (
                        <span className={`text-[9px] font-semibold px-1.5 py-[1px] rounded uppercase ${
                          newsStatus === "ruled_out" || newsStatus === "injured" || newsStatus === "suspended"
                            ? "bg-[var(--red-dim)] text-[var(--red)]"
                            : "bg-[var(--gold-dim)] text-[var(--gold)]"
                        }`}>
                          {newsStatus.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {e.reasoning as string}
                    </div>
                    {bestAlt && uplift > 0 && verdict !== "keep" && verdict !== "hold" && (
                      <div className="text-xs mt-1.5 flex items-center gap-1.5">
                        <span className="text-[var(--text-dim)]">Alternative:</span>
                        <span className="font-semibold">{bestAlt.name as string}</span>
                        <span className="text-[var(--text-muted)]">({bestAlt.team as string}, {bestAlt.cost as number}m)</span>
                        <span className="text-[var(--accent)] font-bold">+{uplift} {label}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                    {e.xpts as number}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {label}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
  const colorClass =
    color === "red" ? "bg-[var(--red-dim)] text-[var(--red)]" :
    color === "accent" ? "bg-[var(--accent-dim)] text-[var(--accent)]" :
    "bg-[var(--surface2)] text-[var(--text-muted)]";
  return (
    <div className={`text-xs px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 ${colorClass}`}
      style={{ fontFamily: 'var(--font-mono)' }}>
      <span className="opacity-60">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
