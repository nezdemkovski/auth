import { StatusDot } from "@nezdemkovski/auth-client-shared/icons";

export function StatusBadge({
  tone,
  label
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
      <StatusDot tone={tone} />
      {label}
    </span>
  );
}
