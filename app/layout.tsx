import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FPL Analyst",
  description: "AI-powered Fantasy Premier League analysis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
