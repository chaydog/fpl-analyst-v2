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
          <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">Analysing team...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--red)] text-lg mb-4">{error || "Failed to load"}</p>
          <a href="/" className="text-[var(--accent)] hover:underline">Try another team</a>
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
    <div className="max-w-[1400px] mx-auto px-5 py-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 pb-5 mb-6 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] bg-clip-text text-transparent">
            {d.team_name as string}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-[var(--text-muted)] text-sm">
              FPL Analyst - Gameweek {d.next_gw as number}
            </p>
            <DeadlineCountdown deadlineTime={d.deadline_time} nextGw={d.next_gw} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 lg:gap-6 items-center">
          <HeaderStat label="Rank" value={(d.overall_rank as number).toLocaleString()} />
          <HeaderStat label="Points" value={String(d.total_points)} />
          <HeaderStat label="Bank" value={`${d.bank}m`} />
          <HeaderStat label="Free Transfers" value={String(d.free_transfers)} />
          <div className="w-full sm:w-auto">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Optimise For</div>
            <div className="flex bg-[var(--surface2)] border border-[var(--border)] rounded-lg overflow-hidden">
              <button
                onClick={() => setHorizon(1)}
                className={`flex-1 sm:flex-none px-4 py-2 text-xs font-semibold transition-all ${
                  horizon === 1 ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                This GW
              </button>
              <button
                onClick={() => setHorizon(5)}
                className={`flex-1 sm:flex-none px-4 py-2 text-xs font-semibold transition-all ${
                  horizon === 5 ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                5 GWs
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TransferSimulator
          starters={starters}
          bench={bench}
          horizon={horizon}
          teamId={teamId}
          freeTransfers={d.free_transfers as number}
          bank={d.bank as number}
        />

        <TransferRecs
          transfers={transfers}
          freeTransfers={d.free_transfers as number}
          horizon={horizon}
        />

        <ChipAdvisor
          chipsAvailable={d.chips_available as Record<string, Record<string, unknown>>}
          chipRecommendations={d.chip_recommendations as Record<string, Record<string, unknown>>}
          chipThisWeek={d.chip_this_week as Record<string, unknown>}
          gwSchedule={d.gw_schedule as Record<string, unknown>[]}
          nextGw={d.next_gw as number}
        />

        <CaptainPicker
          starters={starters}
          horizon={horizon}
          nextGw={d.next_gw as number}
        />

        <TopPlayers
          topPlayers={d.top_players}
          horizon={horizon}
        />

        <Differentials
          topPlayers={d.top_players}
          horizon={horizon}
        />
      </div>

      {/* Footer */}
      {d.updated_at && (
        <p className="text-center text-[var(--text-muted)] text-xs mt-6">
          Predictions updated {new Date(d.updated_at as string).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left lg:text-right">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
