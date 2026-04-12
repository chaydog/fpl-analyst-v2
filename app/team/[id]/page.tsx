"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Horizon } from "@/lib/types";
import TransferRecs from "@/components/TransferRecs";
import SquadAudit from "@/components/SquadAudit";
import ChipAdvisor from "@/components/ChipAdvisor";
import TopPlayers from "@/components/TopPlayers";
import TransferSimulator from "@/components/TransferSimulator";
import CaptainPicker from "@/components/CaptainPicker";
import Differentials from "@/components/Differentials";
import DeadlineCountdown from "@/components/DeadlineCountdown";

type Tab = "transfers" | "captain" | "chips" | "players";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "transfers", label: "Transfers", icon: "\u21C4" },
  { id: "captain", label: "Captain", icon: "\u00A9" },
  { id: "chips", label: "Chips", icon: "\u26A1" },
  { id: "players", label: "Players", icon: "\u2606" },
];

export default function Dashboard() {
  const params = useParams();
  const teamId = parseInt(params.id as string);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState<Horizon>(5);
  const [activeTab, setActiveTab] = useState<Tab>("transfers");

  useEffect(() => {
    fetch(`/api/team/${teamId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load team");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-in">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 border-2 border-[var(--border)] rounded-full" />
            <div className="absolute inset-0 border-2 border-transparent border-t-[var(--accent)] rounded-full animate-spin"
              style={{ boxShadow: 'var(--glow-accent)' }} />
          </div>
          <p className="text-[var(--text-muted)] text-xs tracking-[0.3em] uppercase"
            style={{ fontFamily: 'var(--font-display)' }}>
            Analysing team
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-in">
          <div className="text-5xl mb-4 opacity-30">&#9888;</div>
          <p className="text-[var(--red)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            {error || "Failed to load"}
          </p>
          <a href="/" className="text-[var(--accent)] hover:underline underline-offset-4 text-sm"
            style={{ fontFamily: 'var(--font-mono)' }}>
            Try another team
          </a>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const starters = (horizon === 1 ? d.starters_1gw : d.starters_5gw) as Record<string, unknown>[];
  const bench = (horizon === 1 ? d.bench_1gw : d.bench_5gw) as Record<string, unknown>[];
  const transfers = (horizon === 1 ? d.transfers_1gw : d.transfers_5gw) as Record<string, unknown>[];

  // Determine the hero action
  const topTransfer = transfers?.[0] as any;
  const chipRec = d.chip_this_week;

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="border-b border-[var(--border)] bg-[var(--bg2)]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-4">
            <a href="/" className="text-xs tracking-[0.25em] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors uppercase"
              style={{ fontFamily: 'var(--font-display)' }}>
              FPL Analyst
            </a>
            <div className="w-px h-4 bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              GW{d.next_gw}
            </span>
            <DeadlineCountdown deadlineTime={d.deadline_time} nextGw={d.next_gw} />
          </div>

          {/* Horizon toggle */}
          <div className="flex items-center gap-3">
            <span className="text-[9px] tracking-[0.15em] text-[var(--text-muted)] uppercase"
              style={{ fontFamily: 'var(--font-mono)' }}>
              Optimise
            </span>
            <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
              {([1, 5] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`px-4 py-1.5 text-[11px] font-semibold transition-all duration-200 ${
                    horizon === h
                      ? "bg-[var(--accent)] text-black"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
                >
                  {h === 1 ? "1 GW" : "5 GW"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        {/* Hero header */}
        <div className="animate-in animate-in-1 py-6 sm:py-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.9]"
                style={{ fontFamily: 'var(--font-display)' }}>
                {d.team_name as string}
              </h1>
            </div>
            <div className="flex gap-6 sm:gap-8 items-end">
              <StatPill label="Rank" value={(d.overall_rank as number).toLocaleString()} accent />
              <StatPill label="Points" value={String(d.total_points)} />
              <StatPill label="Bank" value={`\u00A3${d.bank}m`} />
              <StatPill label="FT" value={String(d.free_transfers)} />
            </div>
          </div>
        </div>

        {/* Hero action - the #1 thing to do */}
        {(topTransfer || chipRec?.play_chip) && (
          <div className="animate-in animate-in-2 mb-6">
            <div className="relative overflow-hidden rounded-xl border border-[var(--border)]"
              style={{ background: 'linear-gradient(135deg, rgba(0,255,135,0.04) 0%, rgba(4,245,255,0.02) 100%)' }}>
              <div className="absolute top-0 left-0 w-full h-[1px]"
                style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />
              <div className="px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[var(--accent-dim)] border border-[rgba(0,255,135,0.15)] flex items-center justify-center text-[var(--accent)] text-sm">
                    {chipRec?.play_chip ? "\u26A1" : "\u21C4"}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-0.5"
                      style={{ fontFamily: 'var(--font-mono)' }}>
                      Recommended action
                    </div>
                    <div className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                      {chipRec?.play_chip
                        ? `Play ${chipRec.play_chip} this week`
                        : topTransfer
                          ? `Transfer ${topTransfer.out?.[0]?.name} \u2192 ${topTransfer.in?.[0]?.name}`
                          : "No changes needed"
                      }
                    </div>
                  </div>
                </div>
                {topTransfer && !chipRec?.play_chip && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-3 py-1 rounded-md font-semibold"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: 'rgba(0,255,135,0.1)',
                        color: 'var(--accent)',
                        border: '1px solid rgba(0,255,135,0.15)',
                      }}>
                      +{topTransfer.raw_gain} {horizon === 1 ? "xPts" : "xPts (5GW)"}
                    </span>
                    {topTransfer.hits === 0 && (
                      <span className="text-[10px] px-2 py-1 rounded-md bg-[var(--surface2)] text-[var(--text-muted)]"
                        style={{ fontFamily: 'var(--font-mono)' }}>
                        FREE
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main content: Pitch + Tabs */}
        <div className="lg:grid lg:grid-cols-[1fr,420px] lg:gap-6 mb-8">
          {/* Pitch - always visible */}
          <div className="animate-in animate-in-3 mb-6 lg:mb-0">
            <TransferSimulator
              starters={starters}
              bench={bench}
              horizon={horizon}
              teamId={teamId}
              freeTransfers={d.free_transfers as number}
              bank={d.bank as number}
            />
          </div>

          {/* Right panel - tabbed */}
          <div className="animate-in animate-in-4">
            {/* Tab navigation */}
            <div className="flex border-b border-[var(--border)] mb-0 sticky top-0 z-20 bg-[var(--bg)]">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-3 text-center transition-all duration-200 border-b-2 ${
                    activeTab === tab.id
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)]"
                  }`}
                >
                  <span className="text-base mr-1.5">{tab.icon}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ fontFamily: 'var(--font-display)' }}>
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="mt-5">
              {activeTab === "transfers" && (
                <div className="space-y-5 animate-in">
                  <SquadAudit
                    audit={horizon === 1 ? d.audit_1gw : d.audit_5gw}
                    horizon={horizon}
                  />
                  <TransferRecs
                    transfers={transfers}
                    freeTransfers={d.free_transfers as number}
                    horizon={horizon}
                  />
                  <Differentials
                    topPlayers={d.top_players}
                    horizon={horizon}
                  />
                </div>
              )}

              {activeTab === "captain" && (
                <div className="animate-in">
                  <CaptainPicker
                    starters={starters}
                    horizon={horizon}
                    nextGw={d.next_gw as number}
                  />
                </div>
              )}

              {activeTab === "chips" && (
                <div className="animate-in">
                  <ChipAdvisor
                    chipsAvailable={d.chips_available as Record<string, Record<string, unknown>>}
                    chipRecommendations={d.chip_recommendations as Record<string, Record<string, unknown>>}
                    chipThisWeek={d.chip_this_week as Record<string, unknown>}
                    gwSchedule={d.gw_schedule as Record<string, unknown>[]}
                    nextGw={d.next_gw as number}
                    postponedFixtures={d.postponed_fixtures as Array<{ home: string; away: string }>}
                  />
                </div>
              )}

              {activeTab === "players" && (
                <div className="animate-in">
                  <TopPlayers
                    topPlayers={d.top_players}
                    horizon={horizon}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      {d.updated_at && (
        <div className="border-t border-[var(--border)] mt-4">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <p className="text-[var(--text-muted)] text-[10px] tracking-widest opacity-40 uppercase"
              style={{ fontFamily: 'var(--font-mono)' }}>
              Updated {new Date(d.updated_at as string).toLocaleString()}
            </p>
            <p className="text-[var(--text-muted)] text-[10px] tracking-widest opacity-40 uppercase"
              style={{ fontFamily: 'var(--font-mono)' }}>
              XGBoost + RF Ensemble
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-0.5"
        style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      <div className={`text-xl sm:text-2xl font-bold tracking-tight ${accent ? "text-[var(--accent)]" : ""}`}
        style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
    </div>
  );
}
