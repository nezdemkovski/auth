import { ThemeToggle } from "./shared";
import type { Theme } from "@nezdemkovski/auth-client-shared/theme";

export function LoginHeader({
  projectName,
  theme,
  onToggleTheme
}: {
  projectName: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const projectInitial = projectName.trim().charAt(0).toUpperCase() || "·";

  return (
    <header className="relative z-10 flex h-14 items-center justify-between px-6 lg:px-10">
      <div className="flex items-center gap-2 text-ink">
        <span
          aria-hidden="true"
          className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-semibold tracking-[-0.02em] text-accent-ink shadow-button"
        >
          {projectInitial}
        </span>
        <span className="text-[13.5px] font-medium tracking-[-0.005em]">
          {projectName}
        </span>
      </div>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </header>
  );
}
