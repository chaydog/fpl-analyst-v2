"use client";

interface GWStripProps {
  nextGw: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schedule: any[];
}

export default function GWStrip({ nextGw, schedule }: GWStripProps) {
  const gws = Array.from({ length: 6 }, (_, i) => nextGw + i);
  const scheduleMap = new Map();
  for (const s of schedule) {
    scheduleMap.set(s.gw, s);
  }

  return (
    <div className="flex items-center gap-1">
      {gws.map((gw, i) => {
        const info = scheduleMap.get(gw);
        const type = info?.type || "normal";
        const isNext = i === 0;
        const isDouble = type.includes("double");
        const isBlank = type.includes("blank");

        return (
          <div
            key={gw}
            className={`relative flex flex-col items-center justify-center px-2 py-1 rounded min-w-[42px] transition-all ${
              isNext ? "bg-[var(--accent-dim)] border border-[var(--accent-border)]" : "bg-[var(--surface2)] border border-[var(--border)]"
            }`}
            title={type !== "normal" ? `${type.replace("+", " + ")} GW` : ""}
          >
            <div className={`text-[10px] font-mono ${isNext ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
              GW{gw}
            </div>
            <div className="flex gap-0.5 mt-0.5">
              {isDouble && (
                <span className="text-[8px] px-1 py-[1px] rounded font-bold bg-[var(--purple)] text-white" title="Double">
                  D
                </span>
              )}
              {isBlank && (
                <span className="text-[8px] px-1 py-[1px] rounded font-bold bg-[var(--red)] text-white" title="Blank">
                  B
                </span>
              )}
              {!isDouble && !isBlank && (
                <span className="text-[8px] text-[var(--text-dim)]">-</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
