export function SysTag({ size = "sm" }: { size?: "sm" | "lg" }) {
  const cls =
    size === "lg"
      ? "px-2 py-0.5 text-[11px]"
      : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center rounded border border-border bg-surface-muted font-semibold uppercase tracking-[0.06em] text-muted ${cls}`}
    >
      system
    </span>
  );
}
