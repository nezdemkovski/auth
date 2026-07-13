import { useEffect, useMemo, useReducer } from "react";

import { createLoginAuthClient } from "../auth-client";
import { getSubtitle, getTitle } from "../copy";
import type { LoginConfig } from "../types";
import { initialLoginFlowState, loginFlowReducer } from "./loginFlowState";
import { loginAlternateUrl } from "./loginUrls";
import { useLoginFlowActions } from "./useLoginFlowActions";
import { useLoginTheme } from "./useLoginTheme";

export const useLoginFlow = (config: LoginConfig) => {
  const authClient = useMemo(
    () => createLoginAuthClient(config.project),
    [config.project]
  );
  const [flow, dispatch] = useReducer(
    loginFlowReducer,
    initialLoginFlowState(config.error ?? null, authClient.getLastUsedLoginMethod())
  );
  const isSignup = config.mode === "signup";
  const passkeysEnabled = config.features.passkey.enabled;
  const title = getTitle(flow.step, isSignup);
  const subtitle = getSubtitle(flow.step, isSignup, config.projectName);
  const alternateUrl = useMemo(
    () => loginAlternateUrl(config, isSignup),
    [config, isSignup]
  );
  const { theme, toggleTheme } = useLoginTheme(title, config.projectName);
  const { continueAfterAuth, ...flowActions } = useLoginFlowActions({
    authClient,
    config,
    flow,
    dispatch,
    isSignup,
    passkeysEnabled
  });

  useEffect(() => {
    void continueAfterAuth({
      offerPasskey: passkeysEnabled,
      password: null,
      silentWhenUnauthenticated: true
    });
  }, [continueAfterAuth, passkeysEnabled]);

  return {
    actions: {
      ...flowActions,
      toggleTheme
    },
    state: {
      alternateUrl,
      backupCodes: flow.backupCodes,
      email: flow.email,
      error: flow.error,
      isSignup,
      lastLoginMethod: flow.lastLoginMethod,
      passkeysEnabled,
      password: flow.password,
      pending: flow.pending,
      socialProviders: config.socialProviders,
      step: flow.step,
      subtitle,
      theme,
      totpUri: flow.totpUri,
      twoFactorCode: flow.twoFactorCode
    }
  };
};
