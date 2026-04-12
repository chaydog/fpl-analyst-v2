"use client";

import { useEffect, useState } from "react";

interface WildcardDrafterProps {
  teamId: number;
  nextGw: number;
}

const POS_BG: Record<string, string> = {
  GKP: "bg-[#ca8a04] text-white",
  DEF: "bg-[#1d4ed8] text-white",
  MID: "bg-[#059669] text-white",
  FWD: "bg-[#dc2626] text-white",
};

export default function WildcardDrafter({ teamId, nextGw }: WildcardDrafterProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [horizon, setHorizon] = useState<"3gw" | "5gw" | "dgw33">("3gw");

  useEffect(() => {
    const gwMap: Record<string, string> = {
      "3gw": `${nextGw},${nextGw + 1},${nextGw + 2}`,
      "5gw": `${nextGw},${nextGw + 1},${nextGw + 2},${nextGw + 3},${nextGw + 4}`,
      "dgw33": "33",
    };
    setLoading(true);
    setError("");
    fetch(`/api/wildcard/${teamId}?gws=${gwMap[horizon]}`)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e))))
      .then(setData)
      .catch((e) => setError(e.error || "Failed to load"))
      .finally(() => setLoading(false));
  }, [teamId, horizon, nextGw]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold uppercase tracking-wider">Wildcard Drafter</h2>
        <div className="flex bg-[var(--surface2)] border border-[var(--border)] rounded-md overflow-hidden">
          {(["3gw", "5gw", "dgw33"] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`px-3 py-1 text-[11px] font-semibold transition-all ${
                horizon === h
                  ? "bg-[var(--accent)] text-black"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
            >
              {h === "3gw" ? "Next 3" : h === "5gw" ? "Next 5" : "DGW33 only"}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="p-10 text-center text-[var(--text-muted)] text-sm">
          Building optimal squad...
        </div>
      )}

      {error && (
        <div className="p-5 text-center text-[var(--red)] text-sm">{error}</div>
      )}

      {data && !loading && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 border-b border-[var(--border)] divide-x divide-[var(--border)]">
            <div className="py-3 text-center">
              <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                {data.total_cost}m
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}>
                Squad Cost
              </div>
              <div className="text-[9px] text-[var(--text-dim)] mt-0.5">Budget: {data.budget}m</div>
            </div>
            <div className="py-3 text-center">
              <div className="text-2xl font-bold text-[var(--accent)]" style={{ fontFamily: 'var(--font-display)' }}>
                {data.total_xpts}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}>
                Total xPts
              </div>
              <div className="text-[9px] text-[var(--text-dim)] mt-0.5">GWs: {data.target_gws.join(", ")}</div>
            </div>
            <div className="py-3 text-center">
              <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                {data.starters.reduce((s: number, p: { xpts_target: number }) => s + p.xpts_target, 0).toFixed(1)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}>
                Starting XI
              </div>
              <div className="text-[9px] text-[var(--text-dim)] mt-0.5">Captain {data.starters.find((p: { player_id: number }) => p.player_id === data.captain_id)?.name}</div>
            </div>
          </div>

          {/* Squad by position */}
          <div className="divide-y divide-[var(--border)]">
            {(["GKP", "DEF", "MID", "FWD"] as const).map((pos) => {
              const players = data.by_position[pos] || [];
              if (!players.length) return null;
              return (
                <div key={pos} className="px-5 py-3">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2 font-semibold"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                    {pos} ({players.length})
                  </div>
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {players.map((p: any) => {
                      const isStarter = data.starters.some((s: { player_id: number }) => s.player_id === p.player_id);
                      const isCaptain = p.player_id === data.captain_id;
                      const isVice = p.player_id === data.vice_captain_id;
                      return (
                        <div
                          key={p.player_id}
                          className={`flex items-center justify-between px-3 py-2 rounded-md ${
                            isStarter ? "bg-[var(--surface2)]" : "bg-transparent opacity-60"
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${POS_BG[pos] || ""}`}>
                              {pos}
                            </span>
                            {isCaptain && <span className="text-[9px] font-bold px-1.5 rounded bg-[var(--gold)] text-black">C</span>}
                            {isVice && <span className="text-[9px] font-bold px-1.5 rounded bg-white text-black">VC</span>}
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-semibold truncate">
                                {p.name}
                                {p.news_status && ["ruled_out", "injured", "suspended"].includes(p.news_status) && (
                                  <span className="ml-1.5 text-[9px] text-[var(--red)]">!</span>
                                )}
                              </div>
                              <div className="text-[10px] text-[var(--text-muted)]"
                                style={{ fontFamily: 'var(--font-mono)' }}>
                                {p.team} - {p.cost}m
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 items-center shrink-0">
                            {Object.entries(p.xpts_per_gw || {}).map(([gw, pts]) => (
                              <div key={gw} className="text-center" style={{ minWidth: '30px' }}>
                                <div className="text-[10px] font-bold"
                                  style={{ fontFamily: 'var(--font-mono)', color: (pts as number) > 0 ? 'var(--text)' : 'var(--red)' }}>
                                  {pts as number}
                                </div>
                                <div className="text-[8px] text-[var(--text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
                                  GW{gw}
                                </div>
                              </div>
                            ))}
                            <div className="text-center ml-2 pl-2 border-l border-[var(--border)]" style={{ minWidth: '35px' }}>
                              <div className="text-sm font-bold text-[var(--accent)]"
                                style={{ fontFamily: 'var(--font-display)' }}>
                                {p.xpts_target}
                              </div>
                              <div className="text-[8px] text-[var(--text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
                                total
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
