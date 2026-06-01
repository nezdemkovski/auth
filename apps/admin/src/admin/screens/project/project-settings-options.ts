import type { ProjectSettingsPatch } from "../../types";

export const TWO_FACTOR_REQUIREMENT_OPTIONS = [
  { value: "optional", label: "Optional" },
  { value: "admins", label: "Required for admins" },
  { value: "everyone", label: "Required for everyone" }
];

export const AGENT_ACCESS_MODE_OPTIONS = [
  { value: "read-only", label: "Read-only" },
  { value: "scoped-write", label: "Scoped write" }
];

type TwoFactorRequirement =
  ProjectSettingsPatch["features"]["twoFactor"]["required"];
type AgentAccessMode = ProjectSettingsPatch["features"]["agentAuth"]["mode"];

export const parseTwoFactorRequirement = (value: string): TwoFactorRequirement => {
  if (value === "admins" || value === "everyone") {
    return value;
  }
  return "optional";
};

export const parseAgentAccessMode = (value: string): AgentAccessMode => {
  if (value === "scoped-write") {
    return value;
  }
  return "read-only";
};
