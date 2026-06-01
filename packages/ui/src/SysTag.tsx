import { cn } from "./cn";

const SYS_TAG_SIZES = {
  sm: "px-1.5 py-0.5 text-[10px]",
  lg: "px-2 py-0.5 text-[11px]"
};

export function SysTag({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-border bg-surface-muted font-semibold uppercase tracking-[0.06em] text-muted",
        SYS_TAG_SIZES[size]
      )}
    >
      system
    </span>
  );
}
