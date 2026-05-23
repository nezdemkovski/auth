type StatusTone = "success" | "warning" | "danger" | "neutral";

const DOT_COLORS: Record<StatusTone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  neutral: "var(--muted)"
};

export function StatusBadge({
  tone,
  label
}: {
  tone: StatusTone;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: DOT_COLORS[tone] }}
      />
      {label}
    </span>
  );
}
