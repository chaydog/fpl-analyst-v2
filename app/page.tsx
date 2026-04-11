"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Landing() {
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = teamId.trim();
    if (!id || !/^\d+$/.test(id)) {
      setError("Please enter a valid numeric Team ID");
      return;
    }
    setError("");
    setLoading(true);
    router.push(`/team/${id}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Radial gradient orbs */}
        <div className="absolute top-[-30%] left-[-10%] w-[70vw] h-[70vw] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 65%)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, var(--accent2) 0%, transparent 65%)' }} />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, var(--text-dim) 0.8px, transparent 0.8px)',
            backgroundSize: '28px 28px',
          }} />
      </div>

      <div className={`max-w-xl w-full relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>

        {/* Title block */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-glass)] backdrop-blur-sm mb-6"
            style={{ fontFamily: 'var(--font-mono)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-[10px] text-[var(--text-muted)] tracking-wider uppercase">
              ML-powered predictions
            </span>
          </div>

          <h1 className="text-[80px] sm:text-[110px] lg:text-[130px] leading-[0.85] tracking-tight mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text)',
            }}>
            FPL
            <br />
            <span style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              ANALYST
            </span>
          </h1>

          <p className="text-[var(--text-muted)] text-base sm:text-lg max-w-sm mx-auto leading-relaxed"
            style={{ fontFamily: 'var(--font-body)' }}>
            Predicted lineups, transfer advice, and chip strategy for your FPL team
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {[
            { label: "xPts Predictions", color: "var(--accent)" },
            { label: "Transfer Simulator", color: "var(--accent2)" },
            { label: "Chip Planner", color: "var(--gold)" },
            { label: "5GW Lookahead", color: "var(--purple)" },
          ].map((f) => (
            <div key={f.label}
              className="px-3.5 py-1.5 rounded-full text-[11px] font-medium border"
              style={{
                fontFamily: 'var(--font-body)',
                color: f.color,
                borderColor: `color-mix(in srgb, ${f.color} 20%, transparent)`,
                background: `color-mix(in srgb, ${f.color} 5%, transparent)`,
              }}>
              {f.label}
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="mb-5">
          <div className="relative">
            <input
              type="text"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="Enter your Team ID"
              inputMode="numeric"
              className="w-full px-6 py-5 text-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl text-[var(--text)] outline-none transition-all duration-300 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_rgba(52,211,153,0.08)] placeholder:text-[var(--text-dim)] pr-32"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', letterSpacing: '0.05em' }}
            />
            <button
              type="submit"
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary px-6 py-3 rounded-xl disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black/80 rounded-full animate-spin" />
                </span>
              ) : "GO"}
            </button>
          </div>
        </form>

        {error && (
          <p className="text-center text-[var(--red)] text-sm mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
            {error}
          </p>
        )}

        {/* How to find ID - collapsible feel */}
        <details className="group">
          <summary className="text-center text-[var(--text-dim)] text-xs cursor-pointer hover:text-[var(--text-muted)] transition-colors list-none"
            style={{ fontFamily: 'var(--font-mono)' }}>
            Where do I find my Team ID?
          </summary>
          <div className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-left animate-in">
            <ol className="space-y-2 text-sm text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
              <li className="flex gap-3">
                <span className="text-[var(--text-dim)] font-mono text-xs mt-0.5 shrink-0">01</span>
                <span>
                  Go to{" "}
                  <a href="https://fantasy.premierleague.com" target="_blank"
                    className="text-[var(--accent)] hover:underline underline-offset-2">
                    fantasy.premierleague.com
                  </a>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-[var(--text-dim)] font-mono text-xs mt-0.5 shrink-0">02</span>
                <span>Log in and click <strong className="text-[var(--text)] font-medium">My Team</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="text-[var(--text-dim)] font-mono text-xs mt-0.5 shrink-0">03</span>
                <span>
                  Copy the number from the URL:
                  <code className="block mt-1.5 text-xs px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--border)]"
                    style={{ fontFamily: 'var(--font-mono)' }}>
                    <span className="text-[var(--text-dim)]">fantasy.premierleague.com/entry/</span>
                    <span className="text-[var(--accent)] font-semibold">1234567</span>
                    <span className="text-[var(--text-dim)]">/event/32</span>
                  </code>
                </span>
              </li>
            </ol>
          </div>
        </details>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 py-4 text-center">
        <p className="text-[9px] text-[var(--text-dim)] tracking-[0.2em] uppercase"
          style={{ fontFamily: 'var(--font-mono)' }}>
          XGBoost + Random Forest Ensemble / Updated Daily
        </p>
      </div>
    </div>
  );
}
