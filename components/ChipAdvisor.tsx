"use client";

interface ChipAdvisorProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chipsAvailable: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chipRecommendations: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chipThisWeek: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gwSchedule: any[];
  nextGw: number;
}

const CHIP_ICONS: Record<string, string> = {
  wildcard: "\u26A1",
  "3xc": "\uD83D\uDC51",
  bboost: "\uD83D\uDE80",
  freehit: "\uD83C\uDFAF",
};

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  "3xc": "Triple Captain",
  bboost: "Bench Boost",
  freehit: "Free Hit",
  bench_boost: "Bench Boost",
  triple_captain: "Triple Captain",
  free_hit: "Free Hit",
};

export default function ChipAdvisor({
  chipsAvailable, chipRecommendations, chipThisWeek, gwSchedule, nextGw,
}: ChipAdvisorProps) {
  const hasChips = Object.values(chipsAvailable).some((c) => c.available);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold uppercase tracking-wider">Chip Strategy</h2>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-[rgba(255,208,0,0.15)] text-[var(--yellow)]">
          GW{nextGw}
        </span>
      </div>

      {/* Chip cards */}
      <div className="grid grid-cols-4 gap-3 p-5">
        {Object.entries(chipsAvailable).map(([key, chip]) => (
          <div
            key={key}
            className={`p-3.5 rounded-lg bg-[var(--surface2)] border border-[var(--border)] text-center ${
              !chip.available ? "opacity-40" : ""
            }`}
          >
            <div className="text-[28px] mb-1.5">{CHIP_ICONS[key]}</div>
            <div className="text-xs font-bold uppercase tracking-wide mb-1">{chip.name as string}</div>
            {chip.available ? (
              <div className="text-[11px] text-[var(--green)]">Available</div>
            ) : (
              <div className="text-[11px] text-[var(--red)]">Used GW{chip.used_gw as number}</div>
            )}
          </div>
        ))}
      </div>

      {/* This week recommendation */}
      <div className={`px-5 py-4 ${
        !hasChips ? "bg-[var(--surface2)] border-t border-[var(--border)]" :
        chipThisWeek.play_chip ? "bg-[rgba(0,255,135,0.05)] border-t-2 border-t-[var(--accent)]" :
        "bg-[var(--surface2)] border-t border-[var(--border)]"
      }`}>
        {!hasChips ? (
          <>
            <h3 className="text-sm font-bold">All chips used</h3>
            <p className="text-xs text-[var(--text-muted)]">No chips remaining this half</p>
          </>
        ) : chipThisWeek.play_chip ? (
          <>
            <h3 className="text-sm font-bold text-[var(--accent)]">Play {chipThisWeek.play_chip as string} this week</h3>
            <p className="text-xs text-[var(--text-muted)]">{chipThisWeek.reasoning as string}</p>
          </>
        ) : (
          <>
            <h3 className="text-sm font-bold">Hold chips this week</h3>
            <p className="text-xs text-[var(--text-muted)]">{chipThisWeek.reasoning as string}</p>
          </>
        )}
      </div>

      {/* Per-chip recs */}
      {Object.keys(chipRecommendations).length > 0 && (
        <div className="px-5 py-4 border-t border-[var(--border)] space-y-2">
          {Object.entries(chipRecommendations).map(([key, rec]) => (
            <div key={key} className="bg-[var(--surface2)] rounded-lg p-3">
              <div className="flex justify-between items-start">
                <h4 className="text-[13px] font-semibold mb-1">
                  {CHIP_LABELS[key] || key}
                  {rec.best_gw ? ` - Best: GW${rec.best_gw}` : ""}
                </h4>
                {rec.action && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[rgba(0,255,135,0.1)] text-[var(--accent)] whitespace-nowrap ml-2">
                    {rec.action}
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {((rec.reasoning as string[]) || []).join(" | ")}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DGW/BGW schedule */}
      {gwSchedule.length > 0 && (
        <div className="border-t border-[var(--border)]">
          <div className="px-5 pt-3 pb-1">
            <div className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">
              Upcoming Double/Blank Gameweeks
            </div>
          </div>
          {gwSchedule.map((gw) => {
            const type = gw.type as string;
            const badgeClass = type.includes("double") && type.includes("blank")
              ? "bg-[rgba(255,208,0,0.2)] text-[var(--yellow)]"
              : type.includes("double")
              ? "bg-[rgba(150,60,255,0.2)] text-[var(--purple)]"
              : "bg-[rgba(255,70,85,0.2)] text-[var(--red)]";

            return (
              <div key={gw.gw as number} className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border)] last:border-b-0">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md min-w-[50px] text-center ${badgeClass}`}>
                  GW{gw.gw as number}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {type.includes("double") && `${gw.double_teams} teams with double fixtures`}
                  {type.includes("blank") && `${gw.blank_teams} teams without fixtures`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
