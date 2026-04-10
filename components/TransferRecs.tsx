"use client";

import type { Horizon } from "@/lib/types";

interface TransferRecsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transfers: any[];
  freeTransfers: number;
  horizon: Horizon;
}

export default function TransferRecs({ transfers, freeTransfers, horizon }: TransferRecsProps) {
  const label = horizon === 1 ? "xPts" : "xPts (5GW)";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold uppercase tracking-wider">Transfer Recommendations</h2>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-[rgba(150,60,255,0.15)] text-[var(--purple)]">
          {freeTransfers} FT
        </span>
      </div>

      {transfers.length === 0 ? (
        <div className="p-10 text-center text-[var(--text-muted)]">No beneficial transfers found.</div>
      ) : (
        transfers.map((r, idx) => {
          const outs = r.out || [];
          const ins = r.in || [];
          const reasons = r.reasons || [];
          const hits = r.hits || 0;
          const worthIt = r.worth_it;
          const gain = r.points_gain || 0;
          const rawGain = r.raw_gain || 0;

          return (
            <div key={idx} className="p-5 border-b border-[var(--border)] last:border-b-0">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold">
                  Option {idx + 1}: {r.n_transfers} transfer{(r.n_transfers as number) > 1 ? "s" : ""}
                </h3>
                {hits > 0 ? (
                  worthIt ? (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-md bg-[rgba(0,255,135,0.1)] text-[var(--green)]">
                      Worth the hit: +{gain.toFixed(1)} net {label}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-md bg-[rgba(255,70,85,0.1)] text-[var(--red)]">
                      Not worth the hit
                    </span>
                  )
                ) : (
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-md bg-[rgba(0,255,135,0.1)] text-[var(--green)]">
                    FREE +{rawGain} {label}
                  </span>
                )}
              </div>

              <div className="space-y-2.5 mb-3">
                {outs.map((out: any, i: number) => {
                  const inp = ins[i];
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-3 bg-[var(--surface2)] p-3 rounded-lg">
                        <div className="flex items-center gap-2 flex-1">
                          <PosBadge pos={out.position as string} />
                          <div>
                            <div className="font-semibold text-sm text-[var(--red)]">{out.name as string}</div>
                            <div className="text-xs text-[var(--text-muted)]">
                              {out.team as string} - {out.cost as number}m - {out.xpts as number} {label}
                            </div>
                          </div>
                        </div>
                        <div className="text-xl text-[var(--accent)]">&rarr;</div>
                        <div className="flex items-center gap-2 flex-1">
                          <PosBadge pos={inp.position as string} />
                          <div>
                            <div className="font-semibold text-sm text-[var(--green)]">{inp.name as string}</div>
                            <div className="text-xs text-[var(--text-muted)]">
                              {inp.team as string} - {inp.cost as number}m - {inp.xpts as number} {label}
                            </div>
                          </div>
                        </div>
                      </div>
                      {reasons[i] && (
                        <div className="text-xs text-[var(--text-muted)] mt-1 px-3 py-2 bg-[rgba(0,255,135,0.05)] border-l-[3px] border-[var(--accent)] rounded-r-md">
                          {reasons[i]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="text-xs text-[var(--text-muted)]">
                {hits > 0
                  ? `Raw uplift: +${rawGain} ${label} | Hit: -${r.hit_cost} | Net: +${gain.toFixed(1)} | Bank after: ${r.bank_after}m`
                  : `Bank after: ${r.bank_after}m`}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function PosBadge({ pos }: { pos: string }) {
  const colors: Record<string, string> = {
    GKP: "bg-[#e8b100] text-black",
    DEF: "bg-[#2563eb] text-white",
    MID: "bg-[#16a34a] text-white",
    FWD: "bg-[#dc2626] text-white",
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors[pos] || "bg-gray-500 text-white"}`}>
      {pos}
    </span>
  );
}
