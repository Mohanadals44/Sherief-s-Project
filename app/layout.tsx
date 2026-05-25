import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper, Rss, Lightbulb, Clock, Settings, Home } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "News Orchestration",
  description: "Multi-agent news & research dashboard that runs inside Cursor",
};

const nav = [
  { href: "/", label: "Dashboard", Icon: Home },
  { href: "/outlets", label: "Outlets", Icon: Rss },
  { href: "/topics", label: "Topics", Icon: Lightbulb },
  { href: "/schedule", label: "Schedule", Icon: Clock },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex">
          <aside className="w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
            <div className="px-5 py-5 border-b border-[var(--color-border)] flex items-center gap-2">
              <Newspaper className="text-[var(--color-accent)]" size={20} />
              <div>
                <div className="text-sm font-semibold leading-tight">News Orchestration</div>
                <div className="text-[11px] text-[var(--color-text-mute)] leading-tight">Multi-agent · runs in Cursor</div>
              </div>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {nav.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <Icon size={16} />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="px-5 py-3 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-mute)]">
              Local-only. Cron fires only while this machine is awake.
            </div>
          </aside>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
