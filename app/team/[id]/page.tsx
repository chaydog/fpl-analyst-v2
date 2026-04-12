"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Horizon } from "@/lib/types";
import TransferRecs from "@/components/TransferRecs";
import ChipAdvisor from "@/components/ChipAdvisor";
import TopPlayers from "@/components/TopPlayers";
import TransferSimulator from "@/components/TransferSimulator";
import CaptainPicker from "@/components/CaptainPicker";
import Differentials from "@/components/Differentials";
import DeadlineCountdown from "@/components/DeadlineCountdown";
import SquadAudit from "@/components/SquadAudit";
import WildcardDrafter from "@/components/WildcardDrafter";
import ChipPathComparison from "@/components/ChipPathComparison";
import HeroAction from "@/components/HeroAction";
import GWStrip from "@/components/GWStrip";

type Tab = "transfers" | "captain" | "chip";

export default function Dashboard() {
  const params = useParams();
  const teamId = parseInt(params.id as string);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState<Horizon>(5);
  const [activeTab, setActiveTab] = useState<Tab>("transfers");
  const [showPlanAhead, setShowPlanAhead] = useState(false);
  const [showReference, setShowReference] = useState(false);

  useEffect(() => {
    fetch(`/api/team/${teamId}`)
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e)))
      .then(setData)
      .catch((e) => setError(e.error || "Failed to load team"))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-in">
          <div className="relative w-12 h-12 mx-auto mb-6">
            <div className="absolute inset-0 border-2 border-[var(--border)] rounded-full" />
            <div className="absolute inset-0 border-2 border-transparent border-t-[var(--accent)] rounded-full animate-spin" />
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
        <div className="text-center">
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
  const topTransfer = transfers?.[0];

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
            <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]"
              style={{ fontFamily: 'var(--font-mono)' }}>
              {d.team_name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <DeadlineCountdown deadlineTime={d.deadline_time} nextGw={d.next_gw} />
            <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
              {([1, 5] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-all ${
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

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-6">

        {/* Hero action */}
        <div className="animate-in animate-in-1">
          <HeroAction
            topTransfer={topTransfer}
            chipThisWeek={d.chip_this_week}
            horizon={horizon}
            freeTransfers={d.free_transfers}
            onShowTransfers={() => setActiveTab("transfers")}
            onShowChips={() => setActiveTab("chip")}
          />
        </div>

        {/* Context strip */}
        <div className="animate-in animate-in-2 flex flex-wrap items-center justify-between gap-4 px-5 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <div className="flex flex-wrap gap-5 sm:gap-7">
            <Stat label="Rank" value={(d.overall_rank as number).toLocaleString()} />
            <Stat label="Points" value={String(d.total_points)} />
            <Stat label="Bank" value={`£${d.bank}m`} />
            <Stat label="FT" value={String(d.free_transfers)} />
            <Stat label="Chips" value={
              Object.values(d.chips_available || {}).filter((c: unknown) => (c as Record<string, unknown>).available).length + ""
            } />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1"
              style={{ fontFamily: 'var(--font-mono)' }}>
              Next 6 Gameweeks
            </div>
            <GWStrip nextGw={d.next_gw} schedule={d.gw_schedule || []} />
          </div>
        </div>

        {/* Main section: Pitch + Tabs */}
        <div className="animate-in animate-in-3 lg:grid lg:grid-cols-[1fr,460px] lg:gap-6">
          {/* Pitch */}
          <div className="mb-6 lg:mb-0">
            <TransferSimulator
              starters={starters}
              bench={bench}
              horizon={horizon}
              teamId={teamId}
              freeTransfers={d.free_transfers as number}
              bank={d.bank as number}
            />
          </div>

          {/* Tabs */}
          <div>
            <div className="flex border-b border-[var(--border)] sticky top-0 z-20 bg-[var(--bg)]">
              {(["transfers", "captain", "chip"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-center transition-all duration-200 border-b-2 ${
                    activeTab === tab
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)]"
                  }`}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ fontFamily: 'var(--font-display)' }}>
                    {tab}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5">
              {activeTab === "transfers" && (
                <div className="space-y-5 animate-in">
                  <SquadAudit audit={horizon === 1 ? d.audit_1gw : d.audit_5gw} horizon={horizon} />
                  <TransferRecs transfers={transfers} freeTransfers={d.free_transfers as number} horizon={horizon} />
                </div>
              )}
              {activeTab === "captain" && (
                <div className="animate-in">
                  <CaptainPicker starters={starters} horizon={horizon} nextGw={d.next_gw as number} />
                </div>
              )}
              {activeTab === "chip" && (
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
            </div>
          </div>
        </div>

        {/* Collapsible Plan Ahead section */}
        <div className="animate-in animate-in-4">
          <button
            onClick={() => setShowPlanAhead(!showPlanAhead)}
            className="w-full flex items-center justify-between px-5 py-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--border-hover)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">📊</span>
              <div className="text-left">
                <div className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
                  PLAN AHEAD
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  Wildcard drafter + chip path comparison
                </div>
              </div>
            </div>
            <span className="text-[var(--text-muted)]">{showPlanAhead ? "−" : "+"}</span>
          </button>
          {showPlanAhead && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <WildcardDrafter teamId={teamId} nextGw={d.next_gw as number} />
              <ChipPathComparison
                squad={starters}
                horizon_gws={[d.next_gw as number, (d.next_gw as number) + 1, (d.next_gw as number) + 2]}
                chipsAvailable={d.chips_available as Record<string, Record<string, unknown>>}
                nextGw={d.next_gw as number}
              />
            </div>
          )}
        </div>

        {/* Collapsible Reference section */}
        <div className="animate-in animate-in-5">
          <button
            onClick={() => setShowReference(!showReference)}
            className="w-full flex items-center justify-between px-5 py-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--border-hover)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">🔍</span>
              <div className="text-left">
                <div className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
                  PLAYER REFERENCE
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  Top picks by position + differentials
                </div>
              </div>
            </div>
            <span className="text-[var(--text-muted)]">{showReference ? "−" : "+"}</span>
          </button>
          {showReference && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TopPlayers topPlayers={d.top_players} horizon={horizon} />
              <Differentials topPlayers={d.top_players} horizon={horizon} />
            </div>
          )}
        </div>

        {/* Footer */}
        {d.updated_at && (
          <p className="text-center text-[var(--text-muted)] text-[10px] pt-6 tracking-widest opacity-40 uppercase"
            style={{ fontFamily: 'var(--font-mono)' }}>
            Updated {new Date(d.updated_at as string).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      <div className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
    </div>
  );
}
