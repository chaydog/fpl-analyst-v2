"use client";

interface ChipPath {
  name: string;
  sequence: string[];
  total_xpts: number;
  per_gw: Record<number, number>;
  description: string;
  pros: string[];
  cons: string[];
}

interface ChipPathComparisonProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  squad: any[];
  horizon_gws: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gwPredictions?: Record<number, Record<number, number>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chipsAvailable: Record<string, any>;
  nextGw: number;
}

export default function ChipPathComparison({
  squad, horizon_gws, chipsAvailable, nextGw,
}: ChipPathComparisonProps) {
  const hasWC = chipsAvailable.wildcard?.available;
  const hasBB = chipsAvailable.bboost?.available;
  const hasFH = chipsAvailable.freehit?.available;
  const hasTC = chipsAvailable["3xc"]?.available;

  // Check which GWs are DGW/BGW
  // We derive simple paths from the user's remaining chips
  // For now just show the three canonical paths with heuristic points
  const paths: ChipPath[] = [];

  if (hasWC && hasBB && hasFH) {
    paths.push({
      name: "WC this GW → BB DGW → FH BGW",
      sequence: [`WC${nextGw}`, `BB${nextGw + 1}`, `FH${nextGw + 2}`],
      total_xpts: 190,
      per_gw: {},
      description: "Rebuild squad now, bench boost doublers, free hit through blank",
      pros: [
        "Loads up on doublers for Bench Boost week",
        "Handles blank cleanly with Free Hit",
        "Consensus choice among top managers",
      ],
      cons: [
        "Sacrifices this GW team strength",
        "Locked into one chip path",
      ],
    });

    paths.push({
      name: "FH DGW → WC later → BB later",
      sequence: [`FH${nextGw + 1}`, `WC${nextGw + 3}`, `BB${nextGw + 4}`],
      total_xpts: 180,
      per_gw: {},
      description: "Attack the double with free hit, wildcard later, save BB for fresh squad",
      pros: [
        "Keep current team for GW32",
        "Maximum DGW coverage via FH",
        "Flexibility - know more when WC played",
      ],
      cons: [
        "Lower DGW returns than dedicated BB",
        "Must navigate BGW with transfers",
      ],
    });
  }

  if (hasTC) {
    paths.push({
      name: "Triple Captain in DGW",
      sequence: [`TC${nextGw + 1}`],
      total_xpts: 0,
      per_gw: {},
      description: "Triple captain Haaland or top DGW pick",
      pros: [
        "Big variance swing",
        "Works with any other chip sequence",
      ],
      cons: [
        "Captain choice must be nailed",
        "Injury risk mid-week",
      ],
    });
  }

  if (paths.length === 0) {
    return null;
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold uppercase tracking-wider">Chip Path Comparison</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Consensus strategies among top FPL managers this run-in
        </p>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {paths.map((path, i) => (
          <div key={i} className="px-5 py-4">
            <div className="flex items-start justify-between mb-2 gap-3">
              <div>
                <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.02em' }}>
                  {path.name}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{path.description}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                {path.sequence.map((s, j) => (
                  <span key={j} className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent-border)]">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  Pros
                </div>
                <ul className="text-xs text-[var(--text-muted)] space-y-0.5">
                  {path.pros.map((p, j) => (
                    <li key={j} className="flex gap-1.5">
                      <span className="text-[var(--accent)]">+</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  Cons
                </div>
                <ul className="text-xs text-[var(--text-muted)] space-y-0.5">
                  {path.cons.map((c, j) => (
                    <li key={j} className="flex gap-1.5">
                      <span className="text-[var(--red)]">-</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 bg-[var(--surface2)] border-t border-[var(--border)]">
        <p className="text-[11px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          Use the Wildcard Drafter to build each path's target squad.
        </p>
      </div>
    </div>
  );
}
