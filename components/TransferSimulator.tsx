"use client";

import { useState, useCallback } from "react";
import Pitch from "./Pitch";
import type { Horizon } from "@/lib/types";

interface TransferSimulatorProps {
  starters: Record<string, unknown>[];
  bench: Record<string, unknown>[];
  horizon: Horizon;
  teamId: number;
  freeTransfers: number;
  bank: number;
}

interface ConfirmedTransfer {
  out: { name: string; position: string; team: string; cost: number };
  in: { name: string; position: string; team: string; cost: number; xpts: number };
}

export default function TransferSimulator({
  starters: initialStarters, bench: initialBench, horizon, teamId, freeTransfers, bank: initialBank,
}: TransferSimulatorProps) {
  const [currentStarters, setCurrentStarters] = useState(initialStarters);
  const [currentBench, setCurrentBench] = useState(initialBench);
  const [selectedOut, setSelectedOut] = useState<Set<number>>(new Set());
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);
  const [confirmedTransfers, setConfirmedTransfers] = useState<ConfirmedTransfer[]>([]);
  const [totalTransfersMade, setTotalTransfersMade] = useState(0);
  const [currentBank, setCurrentBank] = useState(initialBank);
  const [loading, setLoading] = useState(false);

  // Update when horizon changes
  const allPlayers = [...currentStarters, ...currentBench] as Record<string, unknown>[];

  const togglePlayer = useCallback((id: number) => {
    if (simResult) return;
    setSelectedOut((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [simResult]);

  async function findReplacements() {
    setLoading(true);
    try {
      const res = await fetch("/api/simulate-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, sell_ids: [...selectedOut], horizon }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSimResult(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error finding replacements");
    } finally {
      setLoading(false);
    }
  }

  async function selectReplacement(slotIdx: number, optIdx: number) {
    if (!simResult) return;
    const replacements = simResult.replacements as Record<string, unknown>[];
    const slot = replacements[slotIdx];
    const options = slot.options as Record<string, unknown>[];
    (slot as Record<string, unknown>).selected = options[optIdx];

    setSimResult({ ...simResult, replacements: [...replacements] });

    // Re-simulate with forced selections
    try {
      const forceBuys = replacements.map((r) => {
        const sel = r.selected as Record<string, unknown> | null;
        return sel?.player_id ?? null;
      }).filter(Boolean);

      const res = await fetch("/api/simulate-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, sell_ids: [...selectedOut], force_buys: forceBuys, horizon }),
      });
      const data = await res.json();
      if (data.starters?.length) {
        setSimResult((prev) => ({
          ...prev!,
          starters: data.starters,
          bench: data.bench,
          bank_remaining: data.bank_remaining,
        }));
      }
    } catch {
      // Keep existing view
    }
  }

  function confirmTransfer() {
    if (!simResult) return;
    const replacements = simResult.replacements as Record<string, unknown>[];

    const newConfirmed = replacements
      .filter((r) => r.selected)
      .map((r) => ({
        out: r.selling as ConfirmedTransfer["out"],
        in: r.selected as ConfirmedTransfer["in"],
      }));

    setConfirmedTransfers((prev) => [...prev, ...newConfirmed]);
    setTotalTransfersMade((prev) => prev + selectedOut.size);

    if (simResult.starters) {
      setCurrentStarters(simResult.starters as Record<string, unknown>[]);
      setCurrentBench(simResult.bench as Record<string, unknown>[]);
    }
    setCurrentBank(simResult.bank_remaining as number);

    setSelectedOut(new Set());
    setSimResult(null);
  }

  function resetAll() {
    if (simResult && confirmedTransfers.length > 0) {
      // Just cancel current in-progress
      setSelectedOut(new Set());
      setSimResult(null);
    } else {
      // Full reset
      setSelectedOut(new Set());
      setSimResult(null);
      setConfirmedTransfers([]);
      setTotalTransfersMade(0);
      setCurrentStarters(initialStarters);
      setCurrentBench(initialBench);
      setCurrentBank(initialBank);
    }
  }

  const pitchStarters = simResult?.starters
    ? (simResult.starters as Record<string, unknown>[])
    : (currentStarters as Record<string, unknown>[]);
  const pitchBench = simResult?.bench
    ? (simResult.bench as Record<string, unknown>[])
    : (currentBench as Record<string, unknown>[]);

  const totalHits = Math.max(0, totalTransfersMade + selectedOut.size - freeTransfers);
  const isSimulating = !!simResult;

  // Title
  let title = "Recommended Starting XI";
  if (confirmedTransfers.length > 0 && !simResult) title = "Updated Starting XI";
  else if (simResult) title = "Simulated Starting XI";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold uppercase tracking-wider">{title}</h2>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-[rgba(0,255,135,0.15)] text-[var(--green)]">
          GW{horizon === 1 ? "" : "s"}
        </span>
      </div>

      <Pitch
        starters={pitchStarters as never[]}
        bench={pitchBench as never[]}
        horizon={horizon}
        clickable={!isSimulating}
        selectedIds={selectedOut}
        onPlayerClick={togglePlayer}
      />

      {/* Transfer bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-[var(--surface2)] border-t border-[var(--border)] min-h-[52px]">
        <div>
          {confirmedTransfers.length > 0 && (
            <span className="text-xs text-[var(--accent)] font-semibold mr-2">
              {confirmedTransfers.length} confirmed |
            </span>
          )}
          {selectedOut.size === 0 && !simResult ? (
            <span className="text-xs text-[var(--text-muted)]">Click a player to transfer them out</span>
          ) : simResult ? (
            <span className="text-xs text-[var(--text-muted)]">
              Selecting replacement{totalHits > 0 ? ` (${totalHits} hit = -${totalHits * 4} pts)` : " (free)"}
            </span>
          ) : (
            <span className="text-xs font-semibold text-[var(--red)]">
              Transferring out: {allPlayers.filter((p) => selectedOut.has(p.player_id as number)).map((p) => p.web_name as string).join(", ")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(selectedOut.size > 0 || confirmedTransfers.length > 0) && (
            <button onClick={resetAll} className="px-4 py-2 text-xs font-semibold text-[var(--text-muted)] border border-[var(--border)] rounded-md hover:text-[var(--text)] hover:border-[var(--text-muted)]">
              {simResult && confirmedTransfers.length > 0 ? "Cancel this" : confirmedTransfers.length > 0 ? "Start over" : "Reset"}
            </button>
          )}
          {selectedOut.size > 0 && !simResult && (
            <button
              onClick={findReplacements}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold bg-[var(--accent)] text-black rounded-md hover:bg-[#00cc6a] disabled:opacity-50"
            >
              {loading ? "Finding..." : "Find replacements"}
            </button>
          )}
        </div>
      </div>

      {/* Replacement panel */}
      {simResult && (
        <div className="border-t-2 border-[var(--accent)] bg-[var(--surface2)]">
          <div className="flex justify-between items-center px-5 py-3.5 border-b border-[var(--border)]">
            <h3 className="text-sm font-semibold text-[var(--accent)]">Select Replacements</h3>
            <span className="text-xs text-[var(--text-muted)]">Click to select, then confirm</span>
          </div>

          {(simResult.replacements as Record<string, unknown>[]).map((slot, slotIdx) => {
            const selling = slot.selling as Record<string, unknown>;
            const options = slot.options as Record<string, unknown>[];
            const selected = slot.selected as Record<string, unknown> | null;

            return (
              <div key={slotIdx} className="px-5 py-3.5 border-b border-[var(--border)] last:border-b-0">
                <h4 className="text-xs text-[var(--red)] font-semibold mb-2">
                  Replacing {selling.name as string} ({selling.position as string} - {selling.team as string} - {selling.cost as number}m)
                </h4>
                <div className="space-y-1">
                  {options.map((opt, optIdx) => {
                    const isSelected = selected?.player_id === opt.player_id;
                    return (
                      <div
                        key={opt.player_id as number}
                        onClick={() => selectReplacement(slotIdx, optIdx)}
                        className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${
                          isSelected ? "bg-[rgba(0,255,135,0.15)] border border-[var(--accent)]" : "hover:bg-[rgba(0,255,135,0.08)]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            (opt.position as string) === "DEF" ? "bg-[#2563eb] text-white" :
                            (opt.position as string) === "MID" ? "bg-[#16a34a] text-white" :
                            (opt.position as string) === "FWD" ? "bg-[#dc2626] text-white" :
                            "bg-[#e8b100] text-black"
                          }`}>
                            {opt.position as string}
                          </span>
                          <div>
                            <div className="text-[13px] font-semibold">
                              {opt.name as string}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              {opt.team as string} - {opt.cost as number}m - Form: {opt.form as number} - xGI/90: {opt.xgi90 as number}
                            </div>
                            {(opt as any).tags?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {((opt as any).tags as string[]).map((tag: string, ti: number) => {
                                  const color =
                                    tag === "Easy fixture" || tag === "In form" || tag === "Nailed" || tag === "Home"
                                      ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent-border)]"
                                    : tag === "DGW" || tag === "High xGI" || tag === "Penalties"
                                      ? "bg-[var(--gold-dim)] text-[var(--gold)] border-[rgba(217,119,6,0.15)]"
                                    : tag.includes("Saves")
                                      ? "bg-[rgba(124,58,237,0.06)] text-[var(--purple)] border-[rgba(124,58,237,0.12)]"
                                    : tag === "Tough fixture" || tag === "Rotation risk" || tag === "Back from injury" || tag === "Yellow card risk"
                                      ? "bg-[var(--red-dim)] text-[var(--red)] border-[rgba(220,38,38,0.1)]"
                                      : "bg-[var(--surface2)] text-[var(--text-muted)] border-[var(--border)]";
                                  return (
                                    <span key={ti} className={`text-[9px] font-medium px-1.5 py-[1px] rounded border ${color}`}
                                      style={{ fontFamily: 'var(--font-mono)' }}>
                                      {tag}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-[var(--accent)]">{opt.xpts as number}</div>
                          <div className="text-[9px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                            {(opt as any).xpts_1gw ?? opt.xpts as number} this GW
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Summary + confirm */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 bg-[var(--surface)] border-t border-[var(--border)]">
            <div className="flex flex-wrap gap-4 sm:gap-6">
              <div>
                <div className="text-[10px] uppercase text-[var(--text-muted)]">Transfers</div>
                <div className="text-base font-bold">{selectedOut.size}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-muted)]">Hits</div>
                <div className={`text-base font-bold ${totalHits > 0 ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
                  {totalHits > 0 ? `-${totalHits * 4} pts` : "Free"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-muted)]">Bank After</div>
                <div className="text-base font-bold">{simResult.bank_remaining as number}m</div>
              </div>
            </div>
            <button
              onClick={confirmTransfer}
              disabled={!(simResult.replacements as Record<string, unknown>[]).every((r) => r.selected)}
              className="px-6 py-2.5 text-sm font-bold bg-[var(--accent)] text-black rounded-lg hover:bg-[#00cc6a] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirm transfer{selectedOut.size > 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {/* Confirmed transfers summary */}
      {confirmedTransfers.length > 0 && !simResult && (
        <div className="border-t-[3px] border-[var(--accent)] bg-gradient-to-b from-[rgba(0,255,135,0.06)] to-[var(--surface)]">
          <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)]">
            <h3 className="text-base font-bold text-[var(--accent)]">
              {confirmedTransfers.length} Transfer{confirmedTransfers.length > 1 ? "s" : ""} Confirmed
            </h3>
            <span className="text-xs text-[var(--text-muted)]">Make these moves on fpl.premierleague.com</span>
          </div>

          {confirmedTransfers.map((t, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-[var(--border)] last:border-b-0">
              <div className="flex-1">
                <div className="font-bold text-[15px] text-[var(--red)]">{t.out.name}</div>
                <div className="text-xs text-[var(--text-muted)]">{t.out.position} - {t.out.team} - {t.out.cost}m</div>
              </div>
              <div className="text-2xl text-[var(--accent)]">&rarr;</div>
              <div className="flex-1">
                <div className="font-bold text-[15px] text-[var(--green)]">{t.in.name}</div>
                <div className="text-xs text-[var(--text-muted)]">{t.in.position} - {t.in.team} - {t.in.cost}m</div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap justify-between items-center gap-4 px-5 py-4 bg-[var(--surface2)] border-t border-[var(--border)]">
            <div className="flex flex-wrap gap-4 sm:gap-6">
              <div>
                <div className="text-[10px] uppercase text-[var(--text-muted)]">Transfers</div>
                <div className="text-base font-bold">{totalTransfersMade}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-muted)]">Cost</div>
                <div className={`text-base font-bold ${Math.max(0, totalTransfersMade - freeTransfers) > 0 ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
                  {Math.max(0, totalTransfersMade - freeTransfers) > 0
                    ? `-${Math.max(0, totalTransfersMade - freeTransfers) * 4} pts`
                    : "Free"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-[var(--text-muted)]">Bank</div>
                <div className="text-base font-bold">{currentBank}m</div>
              </div>
            </div>
            <button onClick={resetAll} className="px-5 py-2 text-sm font-semibold text-[var(--text-muted)] border border-[var(--border)] rounded-lg hover:text-[var(--text)]">
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
