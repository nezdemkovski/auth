export function LoginFooter() {
  return (
    <footer className="enter enter-3 mono mt-12 text-center text-[10.5px] uppercase tracking-[0.08em] text-muted-soft sm:-mx-20 sm:whitespace-nowrap">
      ↳ Running on homelab ·{" "}
      <a
        href="https://github.com/nezdemkovski/auth"
        target="_blank"
        rel="noreferrer"
        className="underline-offset-[3px] transition-colors hover:text-ink hover:underline"
      >
        Open source on github ↗
      </a>
      {" · Built on "}
      <a
        href="https://better-auth.com"
        target="_blank"
        rel="noreferrer"
        className="underline-offset-[3px] transition-colors hover:text-ink hover:underline"
      >
        better-auth ↗
      </a>
    </footer>
  );
}
