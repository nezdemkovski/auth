import { Spinner } from "./Spinner";

export function LoadingPanel() {
  return (
    <div className="flex items-center gap-3">
      <Spinner />
      <p className="mono text-[12px] uppercase tracking-[0.08em] text-muted">
        Checking session…
      </p>
    </div>
  );
}
