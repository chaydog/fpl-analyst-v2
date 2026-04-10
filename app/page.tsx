"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FEATURES = [
  { icon: "\u26BD", title: "Predicted Points", desc: "XGBoost + RF ensemble predicts next-GW expected points per player" },
  { icon: "\uD83C\uDFAF", title: "Optimal Lineup", desc: "Integer programming selects your best starting XI and captain" },
  { icon: "\uD83D\uDD04", title: "Transfer Simulator", desc: "Click to sell, pick replacements, confirm - see the new lineup instantly" },
  { icon: "\uD83D\uDCA1", title: "Chip Planner", desc: "Scans all remaining GWs to find optimal BB, TC, FH, WC timing" },
];

export default function Landing() {
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-40%] left-[-20%] w-[80vw] h-[80vw] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-30%] right-[-15%] w-[60vw] h-[60vw] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, var(--accent2) 0%, transparent 70%)' }} />
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(var(--text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--text-muted) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div className="text-center max-w-lg w-full relative z-10">
        {/* Logo */}
        <div className="animate-in animate-in-1">
          <div className="inline-block mb-6">
            <div className="text-[11px] font-mono tracking-[0.3em] text-[var(--text-muted)] uppercase mb-3"
              style={{ fontFamily: 'var(--font-mono)' }}>
              AI-Powered Analysis
            </div>
            <h1 className="text-6xl sm:text-7xl font-bold tracking-tight leading-none"
              style={{
                fontFamily: 'var(--font-display)',
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 50%, var(--accent) 100%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 0 30px rgba(0,255,135,0.2))',
              }}>
              FPL ANALYST
            </h1>
          </div>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-3 mb-10 animate-in animate-in-2">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="group relative bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl p-4 text-left transition-all duration-300 hover:border-[rgba(0,255,135,0.2)] hover:bg-[rgba(16,21,32,0.9)]"
            >
              <div className="text-2xl mb-2 grayscale group-hover:grayscale-0 transition-all duration-300">{f.icon}</div>
              <div className="text-[13px] font-semibold mb-1" style={{ fontFamily: 'var(--font-display)' }}>{f.title}</div>
              <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="mb-5 animate-in animate-in-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="Enter your FPL Team ID"
              inputMode="numeric"
              className="flex-1 px-5 py-4 text-base bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl text-[var(--text)] outline-none transition-all duration-300 focus:border-[var(--accent)] focus:shadow-[0_0_20px_rgba(0,255,135,0.1)] placeholder:text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-primary px-8 py-4 text-base rounded-xl disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Loading
                </span>
              ) : "Analyse"}
            </button>
          </div>
        </form>

        {error && <p className="text-[var(--red)] text-sm mb-4 font-mono">{error}</p>}

        {/* Help */}
        <div className="animate-in animate-in-4 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl p-5 text-left">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] font-semibold mb-3"
            style={{ fontFamily: 'var(--font-display)' }}>
            How to find your Team ID
          </h3>
          <ol className="list-decimal pl-5 text-sm text-[var(--text-muted)] space-y-1.5">
            <li>
              Go to{" "}
              <a href="https://fantasy.premierleague.com" target="_blank" className="text-[var(--accent)] hover:underline underline-offset-2">
                fantasy.premierleague.com
              </a>
            </li>
            <li>Log in and click <strong className="text-[var(--text)] font-medium">My Team</strong></li>
            <li>
              Look at the URL:
              <code className="text-[var(--accent)] text-xs block mt-1.5 font-mono bg-[var(--accent-dim)] px-3 py-1.5 rounded-md">
                fantasy.premierleague.com/entry/<strong className="text-white">1234567</strong>/event/32
              </code>
            </li>
            <li>The number after <strong className="text-[var(--text)] font-medium">/entry/</strong> is your Team ID</li>
          </ol>
        </div>

        <p className="text-[10px] text-[var(--text-muted)] mt-8 opacity-50 font-mono tracking-wider">
          PREDICTIONS UPDATED DAILY - XGBOOST + RANDOM FOREST ENSEMBLE
        </p>
      </div>
    </div>
  );
}
