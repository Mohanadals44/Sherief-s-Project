import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelative(d: Date | number | string | null | undefined): string {
  if (!d) return "never";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "never";
  const diffMs = Date.now() - date.getTime();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return date.toLocaleDateString();
}
