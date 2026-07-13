import type { ProjectSettingsPatch } from "../../types";

export const TWO_FACTOR_REQUIREMENT_OPTIONS = [
  { value: "optional", label: "Optional" },
  { value: "admins", label: "Required for admins" },
  { value: "everyone", label: "Required for everyone" }
];

type TwoFactorRequirement =
  ProjectSettingsPatch["features"]["twoFactor"]["required"];

export const parseTwoFactorRequirement = (value: string): TwoFactorRequirement => {
  if (value === "admins" || value === "everyone") {
    return value;
  }
  return "optional";
};
