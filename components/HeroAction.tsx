"use client";

import type { Horizon } from "@/lib/types";

interface HeroActionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  topTransfer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chipThisWeek: any;
  horizon: Horizon;
  freeTransfers: number;
  onShowTransfers: () => void;
  onShowChips: () => void;
}

export default function HeroAction({
  topTransfer, chipThisWeek, horizon, freeTransfers,
  onShowTransfers, onShowChips,
}: HeroActionProps) {
  const hasChipRec = chipThisWeek?.play_chip;
  const hasTransferRec = topTransfer && (topTransfer.raw_gain > 1 || topTransfer.hits === 0);

  // Determine the primary action
  let actionType: "chip" | "transfer" | "none" = "none";
  if (hasChipRec) actionType = "chip";
  else if (hasTransferRec) actionType = "transfer";

  const ptsLabel = horizon === 1 ? "xPts" : "5GW xPts";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)]"
      style={{
        background: 'linear-gradient(135deg, rgba(52,211,153,0.06) 0%, rgba(34,211,238,0.03) 100%)',
      }}>
      {/* Accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

      <div className="px-5 sm:px-8 py-5 sm:py-6">
        {actionType === "chip" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-dim)] border border-[var(--accent-border)] flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  Recommended This Week
                </div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight"
                  style={{ fontFamily: 'var(--font-display)' }}>
                  Play {chipThisWeek.play_chip}
                </div>
                <div className="text-sm text-[var(--text-muted)] mt-1 max-w-lg">
                  {chipThisWeek.reasoning}
                </div>
              </div>
            </div>
            <button
              onClick={onShowChips}
              className="btn-primary px-6 py-3 rounded-xl shrink-0"
            >
              View strategy
            </button>
          </div>
        )}

        {actionType === "transfer" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-dim)] border border-[var(--accent-border)] flex items-center justify-center text-2xl shrink-0">
                ⇄
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  Recommended This Week
                </div>
                <div className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap"
                  style={{ fontFamily: 'var(--font-display)' }}>
                  <span className="text-[var(--red)]">{topTransfer.out?.[0]?.name}</span>
                  <span className="text-[var(--text-muted)] text-lg">→</span>
                  <span className="text-[var(--accent)]">{topTransfer.in?.[0]?.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent-border)]"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                    +{topTransfer.raw_gain} {ptsLabel}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    topTransfer.hits === 0
                      ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                      : topTransfer.worth_it
                        ? "bg-[var(--gold-dim)] text-[var(--gold)]"
                        : "bg-[var(--red-dim)] text-[var(--red)]"
                  }`} style={{ fontFamily: 'var(--font-mono)' }}>
                    {topTransfer.hits === 0 ? "FREE" : topTransfer.worth_it ? `${topTransfer.hits} hit (+${topTransfer.points_gain} net)` : "Not worth hit"}
                  </span>
                  {topTransfer.reasons?.[0] && (
                    <span className="text-xs text-[var(--text-muted)] truncate">
                      {topTransfer.reasons[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onShowTransfers}
              className="btn-primary px-6 py-3 rounded-xl shrink-0"
            >
              View details
            </button>
          </div>
        )}

        {actionType === "none" && (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--surface2)] border border-[var(--border)] flex items-center justify-center text-2xl">
              ✓
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1"
                style={{ fontFamily: 'var(--font-mono)' }}>
                No Action Required
              </div>
              <div className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                Your team is set up well
              </div>
              <div className="text-sm text-[var(--text-muted)] mt-1">
                Save the {freeTransfers} free transfer{freeTransfers !== 1 ? "s" : ""}. Hold all chips.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
