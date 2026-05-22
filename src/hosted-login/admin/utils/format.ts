import type { ProjectSummary } from "../types";

export function formatRelative(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function projectToSettingsForm(project: ProjectSummary) {
  return {
    name: project.name,
    description: project.description,
    iconUrl: project.iconUrl,
    appUrl: project.appUrl,
    trustedOrigins: project.trustedOrigins.join("\n")
  };
}
