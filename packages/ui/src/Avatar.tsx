export function Avatar({ email, size = 32 }: { email: string; size?: number }) {
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  const fontSize = Math.max(11, size / 2.7);
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full border border-border bg-surface-muted font-medium text-ink-soft tracking-[-0.01em]"
      style={{
        width: size,
        height: size,
        fontSize: `${fontSize}px`
      }}
    >
      {initial}
    </span>
  );
}
