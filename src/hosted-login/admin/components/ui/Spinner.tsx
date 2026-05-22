export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2"
      style={{
        borderColor: "var(--border)",
        borderTopColor: "var(--ink)"
      }}
    />
  );
}
