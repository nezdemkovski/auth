import { useEffect, useState } from "react";
import {
  applyTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
  type Theme
} from "@nezdemkovski/auth-client-shared/theme";

export const useLoginTheme = (title: string, projectName: string) => {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    document.title = `${title} · ${projectName}`;
    applyTheme(theme);
  }, [theme, title, projectName]);

  useEffect(() => {
    return watchSystemTheme((next) => setThemeState(next));
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  return { theme, toggleTheme };
};
