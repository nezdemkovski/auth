export type Theme = "light" | "dark";

const STORAGE_KEY = "auth-theme";

export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* ignore */
  }
  return null;
}

export function getSystemTheme(): Theme {
  return typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

export function watchSystemTheme(handler: (theme: Theme) => void): () => void {
  if (typeof matchMedia === "undefined") return () => {};
  const mql = matchMedia("(prefers-color-scheme: dark)");
  const onChange = (event: MediaQueryListEvent) => {
    if (getStoredTheme()) return;
    handler(event.matches ? "dark" : "light");
  };
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
