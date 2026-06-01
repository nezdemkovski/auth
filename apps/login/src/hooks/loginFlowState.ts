import type { AuthStep } from "../types";

export type LoginFlowState = {
  step: AuthStep;
  error: string | null;
  pending: boolean;
  email: string;
  password: string;
  twoFactorCode: string;
  verifiedPassword: string | null;
  totpUri: string;
  backupCodes: string[];
  lastLoginMethod: string | null;
};

export type LoginFlowAction =
  | { type: "set-step"; step: AuthStep }
  | { type: "set-error"; error: string | null }
  | { type: "set-pending"; pending: boolean }
  | { type: "set-email"; email: string }
  | { type: "set-password"; password: string }
  | { type: "set-two-factor-code"; code: string }
  | { type: "set-verified-password"; password: string | null }
  | { type: "set-two-factor-setup"; totpUri: string; backupCodes: string[] }
  | { type: "set-last-login-method"; method: string | null };

export const initialLoginFlowState = (
  error: string | null,
  lastLoginMethod: string | null
): LoginFlowState => ({
  step: "credentials",
  error,
  pending: false,
  email: "",
  password: "",
  twoFactorCode: "",
  verifiedPassword: null,
  totpUri: "",
  backupCodes: [],
  lastLoginMethod
});

export const loginFlowReducer = (
  state: LoginFlowState,
  action: LoginFlowAction
): LoginFlowState => {
  switch (action.type) {
    case "set-step":
      return { ...state, step: action.step };
    case "set-error":
      return { ...state, error: action.error };
    case "set-pending":
      return { ...state, pending: action.pending };
    case "set-email":
      return { ...state, email: action.email };
    case "set-password":
      return { ...state, password: action.password };
    case "set-two-factor-code":
      return { ...state, twoFactorCode: action.code };
    case "set-verified-password":
      return { ...state, verifiedPassword: action.password };
    case "set-two-factor-setup":
      return {
        ...state,
        totpUri: action.totpUri,
        backupCodes: action.backupCodes
      };
    case "set-last-login-method":
      return { ...state, lastLoginMethod: action.method };
  }
};
