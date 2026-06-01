import type { Dispatch, FormEvent } from "react";
import { useCallback } from "react";

import type { LoginAuthClient } from "../auth-client";
import {
  createLoginSessionRedirect,
  getLoginNextAction,
  LoginNextAction,
  requestLoginPasswordReset,
  signInWithEmail,
  signInWithSocial,
  signUpWithEmail,
  verifyTwoFactorCode
} from "../auth-client";
import type { LoginConfig, SocialProviderId } from "../types";
import type { LoginFlowAction, LoginFlowState } from "./loginFlowState";
import { passwordResetUrl, socialCallbackUrl } from "./loginUrls";

export const useLoginFlowActions = ({
  authClient,
  config,
  flow,
  dispatch,
  isSignup,
  passkeysEnabled
}: {
  authClient: LoginAuthClient;
  config: LoginConfig;
  flow: LoginFlowState;
  dispatch: Dispatch<LoginFlowAction>;
  isSignup: boolean;
  passkeysEnabled: boolean;
}) => {
  const setStep = (step: LoginFlowState["step"]) =>
    dispatch({ type: "set-step", step });
  const setEmail = (email: string) => dispatch({ type: "set-email", email });
  const setPassword = (password: string) =>
    dispatch({ type: "set-password", password });
  const setTwoFactorCode = (code: string) =>
    dispatch({ type: "set-two-factor-code", code });
  const setError = (error: string | null) => dispatch({ type: "set-error", error });
  const setPending = (pending: boolean) =>
    dispatch({ type: "set-pending", pending });

  const redirectWithCurrentSession = useCallback(async () => {
    dispatch({ type: "set-step", step: "redirecting" });
    const redirectTo = await createLoginSessionRedirect({
      project: config.project,
      redirectUri: config.redirectUri,
      state: config.state,
      codeChallenge: config.codeChallenge
    });

    if (!redirectTo) {
      dispatch({ type: "set-step", step: "credentials" });
      dispatch({ type: "set-error", error: "Could not finish sign-in" });
      return;
    }

    window.location.assign(redirectTo);
  }, [config.codeChallenge, config.project, config.redirectUri, config.state, dispatch]);

  const continueAfterAuth = useCallback(
    async ({
      offerPasskey,
      password
    }: {
      offerPasskey: boolean;
      password: string | null;
    }) => {
      const nextAction = await getLoginNextAction(config.project);

      if (nextAction === LoginNextAction.EnrollTwoFactor) {
        dispatch({ type: "set-verified-password", password });
        dispatch({ type: "set-step", step: "two-factor-enroll" });
        return;
      }

      if (offerPasskey && nextAction === LoginNextAction.OfferPasskey) {
        dispatch({ type: "set-step", step: "passkey-enroll" });
        return;
      }

      await redirectWithCurrentSession();
    },
    [config.project, dispatch, redirectWithCurrentSession]
  );

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      if (isSignup) {
        const created = await signUpWithEmail({
          project: config.project,
          email: flow.email,
          password: flow.password,
          callbackURL: new URL(config.redirectUri).origin
        });
        if (!created) {
          setError("Could not create account");
          return;
        }
        dispatch({ type: "set-verified-password", password: flow.password });
      } else {
        const signedIn = await signInWithEmail({
          project: config.project,
          email: flow.email,
          password: flow.password
        });
        if (!signedIn.ok) {
          setError("Invalid email or password");
          return;
        }
        if (signedIn.twoFactorRedirect) {
          setStep("two-factor");
          return;
        }
        dispatch({ type: "set-verified-password", password: flow.password });
      }

      await continueAfterAuth({
        offerPasskey: passkeysEnabled,
        password: flow.password
      });
    } finally {
      setPending(false);
    }
  };

  const signInWithPasskey = async () => {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.signIn.passkey();
      if (result.error) {
        setError(result.error.message || "Could not sign in with passkey");
        return;
      }

      await continueAfterAuth({ offerPasskey: false, password: null });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in with passkey");
    } finally {
      setPending(false);
    }
  };

  const startSocialSignIn = async (provider: SocialProviderId) => {
    setPending(true);
    setError(null);

    try {
      const started = await signInWithSocial({
        project: config.project,
        provider,
        callbackURL: socialCallbackUrl(config).toString()
      });
      if (!started) {
        setPending(false);
        setError("Could not start social sign-in");
      }
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : "Could not start social sign-in");
    }
  };

  const submitTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const verified = await verifyTwoFactorCode({
        project: config.project,
        code: flow.twoFactorCode.trim()
      });

      if (!verified) {
        setError("Invalid verification code");
        return;
      }

      await continueAfterAuth({
        offerPasskey: passkeysEnabled,
        password: flow.password
      });
    } finally {
      setPending(false);
    }
  };

  const submitForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const sent = await requestLoginPasswordReset({
        project: config.project,
        email: flow.email,
        redirectTo: passwordResetUrl(config).toString()
      });
      if (!sent) {
        setError("Could not send reset email");
        return;
      }

      setStep("reset-sent");
    } finally {
      setPending(false);
    }
  };

  const addPasskey = async () => {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.passkey.addPasskey({
        name: `${config.projectName} passkey`
      });
      if (result.error) {
        setError(result.error.message || "Could not add passkey");
        return;
      }

      await redirectWithCurrentSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add passkey");
    } finally {
      setPending(false);
    }
  };

  const startTwoFactorEnrollment = async () => {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.enable({
        ...(flow.verifiedPassword ? { password: flow.verifiedPassword } : {}),
        issuer: config.projectName
      });
      if (result.error || !result.data?.totpURI) {
        setError(result.error?.message || "Could not start two-factor setup");
        return;
      }

      dispatch({
        type: "set-two-factor-setup",
        totpUri: result.data.totpURI,
        backupCodes: result.data.backupCodes ?? []
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start two-factor setup");
    } finally {
      setPending(false);
    }
  };

  const verifyTwoFactorEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: flow.twoFactorCode.trim(),
        trustDevice: true
      });
      if (result.error) {
        setError(result.error.message || "Invalid verification code");
        return;
      }

      await continueAfterAuth({
        offerPasskey: passkeysEnabled,
        password: flow.verifiedPassword
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid verification code");
    } finally {
      setPending(false);
    }
  };

  return {
    addPasskey,
    continueAfterAuth,
    redirectWithCurrentSession,
    setEmail,
    setPassword,
    setStep,
    setTwoFactorCode,
    signInWithPasskey,
    startSocialSignIn,
    startTwoFactorEnrollment,
    submitCredentials,
    submitForgotPassword,
    submitTwoFactor,
    verifyTwoFactorEnrollment
  };
};
