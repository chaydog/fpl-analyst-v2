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

export default function Dashboard() {
  const params = useParams();
  const teamId = parseInt(params.id as string);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState<Horizon>(5);

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
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4"
            style={{ boxShadow: 'var(--glow-accent)' }} />
          <p className="text-[var(--text-muted)] font-mono text-sm tracking-wider">ANALYSING TEAM...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--red)] text-lg mb-4 font-mono">{error || "Failed to load"}</p>
          <a href="/" className="text-[var(--accent)] hover:underline underline-offset-4 font-mono text-sm">
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

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5">
      {/* Header */}
      <div className="animate-in animate-in-1 flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 pb-5 mb-6 border-b border-[var(--border)]">
        <div>
          <a href="/" className="text-[10px] font-mono tracking-[0.2em] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors uppercase mb-2 block">
            FPL Analyst
          </a>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-none"
            style={{
              fontFamily: 'var(--font-display)',
              background: 'linear-gradient(135deg, var(--text) 0%, var(--text-muted) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
            {d.team_name as string}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[11px] font-mono text-[var(--text-muted)] tracking-wider">
              GW{d.next_gw as number}
            </span>
            <DeadlineCountdown deadlineTime={d.deadline_time} nextGw={d.next_gw} />
          </div>
        </div>

        <div className="flex flex-wrap gap-5 lg:gap-7 items-end">
          <HeaderStat label="Rank" value={(d.overall_rank as number).toLocaleString()} accent />
          <HeaderStat label="Points" value={String(d.total_points)} />
          <HeaderStat label="Bank" value={`${d.bank}m`} />
          <HeaderStat label="Free Transfers" value={String(d.free_transfers)} />

          <div className="w-full sm:w-auto">
            <div className="text-[9px] font-mono uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1.5">
              Optimise For
            </div>
            <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
              <button
                onClick={() => setHorizon(1)}
                className={`flex-1 sm:flex-none px-5 py-2.5 text-xs font-semibold transition-all duration-200 ${
                  horizon === 1
                    ? "bg-[var(--accent)] text-black shadow-[var(--glow-accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)]"
                }`}
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
              >
                This GW
              </button>
              <button
                onClick={() => setHorizon(5)}
                className={`flex-1 sm:flex-none px-5 py-2.5 text-xs font-semibold transition-all duration-200 ${
                  horizon === 5
                    ? "bg-[var(--accent)] text-black shadow-[var(--glow-accent)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface2)]"
                }`}
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
              >
                5 GWs
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="animate-in animate-in-1">
          <TransferSimulator
            starters={starters}
            bench={bench}
            horizon={horizon}
            teamId={teamId}
            freeTransfers={d.free_transfers as number}
            bank={d.bank as number}
          />
        </div>

        <div className="animate-in animate-in-2">
          <TransferRecs
            transfers={transfers}
            freeTransfers={d.free_transfers as number}
            horizon={horizon}
          />
        </div>

        <div className="animate-in animate-in-3">
          <ChipAdvisor
            chipsAvailable={d.chips_available as Record<string, Record<string, unknown>>}
            chipRecommendations={d.chip_recommendations as Record<string, Record<string, unknown>>}
            chipThisWeek={d.chip_this_week as Record<string, unknown>}
            gwSchedule={d.gw_schedule as Record<string, unknown>[]}
            nextGw={d.next_gw as number}
          />
        </div>

        <div className="animate-in animate-in-4">
          <CaptainPicker
            starters={starters}
            horizon={horizon}
            nextGw={d.next_gw as number}
          />
        </div>

        <div className="animate-in animate-in-5">
          <TopPlayers
            topPlayers={d.top_players}
            horizon={horizon}
          />
        </div>

        <div className="animate-in animate-in-6">
          <Differentials
            topPlayers={d.top_players}
            horizon={horizon}
          />
        </div>
      </div>

      {/* Footer */}
      {d.updated_at && (
        <p className="text-center text-[var(--text-muted)] text-[10px] mt-8 font-mono tracking-widest opacity-40 uppercase">
          Predictions updated {new Date(d.updated_at as string).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function HeaderStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-left lg:text-right">
      <div className="text-[9px] font-mono uppercase tracking-[0.15em] text-[var(--text-muted)]">{label}</div>
      <div className={`text-2xl stat-value ${accent ? 'text-[var(--accent)]' : ''}`}
        style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
    </div>
  );
}
