"use client";

interface FixtureTickerProps {
  fixtures: Array<{
    gw: number;
    opponent: string;
    difficulty: number;
    is_home: boolean;
  }>;
}

const DIFFICULTY_COLORS: Record<number, string> = {
  1: "#00ff87",
  2: "#01d167",
  3: "#999999",
  4: "#ff8c00",
  5: "#ff4655",
};

export default function FixtureTicker({ fixtures }: FixtureTickerProps) {
  if (!fixtures || fixtures.length === 0) return null;

  return (
    <div className="flex gap-1 items-end">
      {fixtures.map((f) => {
        const bg = DIFFICULTY_COLORS[f.difficulty] || DIFFICULTY_COLORS[3];
        const label = f.is_home ? f.opponent.toUpperCase() : f.opponent.toLowerCase();
        // Use dark text on bright backgrounds, white on dark
        const textColor = f.difficulty <= 2 ? "#111" : "#fff";

        return (
          <div key={`${f.gw}-${f.opponent}`} className="flex flex-col items-center gap-0.5">
            <span
              className="text-[10px] leading-none"
              style={{ color: "var(--text-muted)" }}
            >
              {f.gw}
            </span>
            <div
              className="flex items-center justify-center rounded-sm text-[10px] font-semibold leading-none"
              style={{
                width: 40,
                height: 24,
                backgroundColor: bg,
                color: textColor,
              }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
