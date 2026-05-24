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

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function fileNameFromUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    const name = url.pathname.split("/").filter(Boolean).at(-1);
    return name ? decodeURIComponent(name) : value;
  } catch {
    const name = value.split("/").filter(Boolean).at(-1);
    return name ? decodeURIComponent(name) : value;
  }
}

export function projectToSettingsForm(project: ProjectSummary) {
  return {
    name: project.name,
    description: project.description,
    iconUrl: project.iconUrl,
    appUrl: project.appUrl,
    trustedOrigins: project.trustedOrigins.join("\n"),
    passkeyEnabled: project.features.passkey.enabled,
    twoFactorEnabled: project.features.twoFactor.enabled,
    twoFactorRequired: project.features.twoFactor.required,
    agentAuthEnabled: project.features.agentAuth.enabled,
    agentAuthMode: project.features.agentAuth.mode,
    oauthProviderEnabled: project.features.oauthProvider.enabled,
    oauthDynamicClientRegistration:
      project.features.oauthProvider.dynamicClientRegistration
  };
}
