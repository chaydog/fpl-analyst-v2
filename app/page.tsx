"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md w-full">
        <h1 className="text-5xl font-extrabold bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] bg-clip-text text-transparent mb-2">
          FPL Analyst
        </h1>
        <p className="text-[var(--text-muted)] text-lg mb-10">
          AI-powered Fantasy Premier League analysis
        </p>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {[
            { icon: "\u26BD", title: "Predicted Points", desc: "ML model predicts next-GW xPts" },
            { icon: "\uD83D\uDCCB", title: "Optimal Lineup", desc: "Best starting XI and captain" },
            { icon: "\uD83D\uDD04", title: "Transfer Advice", desc: "Who to sell, who to buy, hit analysis" },
            { icon: "\uD83C\uDFAF", title: "Chip Strategy", desc: "When to play BB, TC, FH, WC" },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3.5 text-left"
            >
              <div className="text-xl mb-1">{f.icon}</div>
              <div className="text-sm font-semibold">{f.title}</div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">{f.desc}</div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mb-5">
          <div className="flex gap-3">
            <input
              type="text"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="Enter your FPL Team ID"
              inputMode="numeric"
              className="flex-1 px-4 py-3.5 text-base bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--text)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-7 py-3.5 text-base font-bold bg-[var(--accent)] text-black rounded-xl hover:bg-[#00cc6a] disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? "Loading..." : "Analyse"}
            </button>
          </div>
        </form>

        {error && <p className="text-[var(--red)] text-sm mb-4">{error}</p>}

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-left">
          <h3 className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-3">
            How to find your Team ID
          </h3>
          <ol className="list-decimal pl-5 text-sm text-[var(--text-muted)] space-y-1">
            <li>
              Go to{" "}
              <a href="https://fantasy.premierleague.com" target="_blank" className="text-[var(--accent)] hover:underline">
                fantasy.premierleague.com
              </a>
            </li>
            <li>Log in and click <strong className="text-[var(--text)]">My Team</strong></li>
            <li>
              Look at the URL:
              <code className="text-[var(--accent)] text-xs block mt-1">
                fantasy.premierleague.com/entry/<strong>1234567</strong>/event/32
              </code>
            </li>
            <li>The number after <strong className="text-[var(--text)]">/entry/</strong> is your Team ID</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
