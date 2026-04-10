"use client";

import { useState, useEffect } from "react";

interface DeadlineCountdownProps {
  deadlineTime: string | null; // ISO string
  nextGw: number;
}

export default function DeadlineCountdown({ deadlineTime, nextGw }: DeadlineCountdownProps) {
  const [timeLeft, setTimeLeft] = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!deadlineTime) return;

    function update() {
      const now = new Date().getTime();
      const deadline = new Date(deadlineTime!).getTime();
      const diff = deadline - now;

      if (diff <= 0) {
        setTimeLeft("Deadline passed");
        setUrgent(false);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${mins}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m`);
      } else {
        setTimeLeft(`${mins}m`);
      }

      setUrgent(diff < 1000 * 60 * 60 * 4); // under 4 hours
    }

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [deadlineTime]);

  if (!deadlineTime) return null;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold ${
      urgent
        ? "bg-[rgba(255,70,85,0.15)] text-[var(--red)] animate-pulse"
        : "bg-[var(--surface2)] text-[var(--text-muted)]"
    }`}>
      <span>GW{nextGw} deadline:</span>
      <span className={urgent ? "text-[var(--red)]" : "text-[var(--text)]"}>{timeLeft}</span>
    </div>
  );
}
