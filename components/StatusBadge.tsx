import { cn } from "@/lib/ui";

const styles: Record<string, string> = {
  pending: "bg-[var(--color-surface-2)] text-[var(--color-text-dim)] border-[var(--color-border)]",
  running:
    "bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)] text-[var(--color-accent)] border-[color-mix(in_oklab,var(--color-accent)_30%,transparent)]",
  done: "bg-[color-mix(in_oklab,var(--color-success)_14%,transparent)] text-[var(--color-success)] border-[color-mix(in_oklab,var(--color-success)_30%,transparent)]",
  error:
    "bg-[color-mix(in_oklab,var(--color-danger)_14%,transparent)] text-[var(--color-danger)] border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)]",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
        styles[status] ?? styles.pending,
      )}
    >
      {status === "running" && (
        <span className="inline-block size-1.5 rounded-full bg-current animate-pulse" />
      )}
      {status}
    </span>
  );
}
