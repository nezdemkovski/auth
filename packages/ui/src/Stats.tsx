function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function StatCard({
  index,
  label,
  value,
  hint
}: {
  index: number;
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-surface px-5 py-5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-baseline justify-between">
        <div className="eyebrow">{label}</div>
        <span className="eyebrow text-muted-soft">{pad2(index)}</span>
      </div>
      <div className="serif mt-3 text-[44px] leading-none tracking-[-0.035em] text-ink tabular">
        {value === null ? (
          <span className="inline-block h-9 w-16 animate-pulse rounded bg-surface-hover align-middle" />
        ) : (
          value.toLocaleString()
        )}
      </div>
      <div className="mt-2.5 text-[12.5px] text-muted">{hint}</div>
    </div>
  );
}
