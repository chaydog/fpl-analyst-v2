"use client";

interface CaptainPickerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  starters: any[];
  horizon: 1 | 5;
  nextGw: number;
}

function difficultyColor(difficulty: number): string {
  if (difficulty <= 2) return "var(--green)";
  if (difficulty === 3) return "var(--yellow)";
  if (difficulty === 4) return "var(--red)";
  return "var(--purple)";
}

function difficultyLabel(difficulty: number): string {
  if (difficulty <= 2) return "Easy";
  if (difficulty === 3) return "Mid";
  if (difficulty === 4) return "Hard";
  return "Brutal";
}

function buildReasoning(player: Record<string, unknown>): string[] {
  const tags: string[] = [];
  if ((player.n_fixtures_in_gw as number) >= 2) tags.push("DGW");
  if (player.is_home) tags.push("Home");
  if (player.is_penalty_taker) tags.push("Penalties");
  return tags;
}

export default function CaptainPicker({ starters, horizon, nextGw }: CaptainPickerProps) {
  const key = horizon === 1 ? "predicted_pts_1gw" : "predicted_pts_5gw";

  const sorted = [...starters]
    .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
    .slice(0, 5);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[15px] font-semibold uppercase tracking-wider">
          Captain Picks
        </h2>
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-[rgba(255,208,0,0.15)] text-[var(--yellow)]">
          GW{nextGw}
        </span>
      </div>

      {/* Player list */}
      <div className="flex flex-col gap-2 p-4">
        {sorted.map((player, idx) => {
          const xPts = player[key] ?? 0;
          const tags = buildReasoning(player);
          const difficulty = player.opponent_difficulty as number;

          return (
            <div
              key={player.web_name ?? idx}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                idx === 0
                  ? "border-[var(--yellow)] bg-[rgba(255,208,0,0.06)]"
                  : idx === 1
                  ? "border-[var(--border)] bg-[var(--surface2)]"
                  : "border-transparent bg-[var(--surface2)]"
              }`}
            >
              {/* Rank */}
              <span className="text-[var(--text-muted)] text-xs font-mono w-4 shrink-0 text-center">
                {idx + 1}
              </span>

              {/* Kit image */}
              {player.kit_url && (
                <img
                  src={player.kit_url}
                  alt={player.web_name}
                  className="w-9 h-9 object-contain shrink-0"
                />
              )}

              {/* Name / team */}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-[var(--text)] truncate">
                  {player.web_name}
                </span>
                <span className="text-xs text-[var(--text-muted)] truncate">
                  {player.team_name}
                </span>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {idx === 0 && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[rgba(255,208,0,0.2)] text-[var(--yellow)]">
                    Captain
                  </span>
                )}
                {idx === 1 && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[rgba(192,192,192,0.15)] text-[#c0c0c0]">
                    Vice
                  </span>
                )}
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[rgba(0,255,135,0.1)] text-[var(--accent)]"
                  >
                    {tag}
                  </span>
                ))}
                {difficulty != null && (
                  <span
                    className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${difficultyColor(difficulty)} 15%, transparent)`,
                      color: difficultyColor(difficulty),
                    }}
                  >
                    {difficultyLabel(difficulty)}
                  </span>
                )}
              </div>

              {/* xPts */}
              <span className="text-sm font-bold text-[var(--accent)] tabular-nums shrink-0 w-12 text-right">
                {Number(xPts).toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
