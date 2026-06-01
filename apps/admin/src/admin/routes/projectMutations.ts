import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  createPolarProduct,
  resendVerificationEmail,
  terminateUserSessions,
  updateBillingSettings,
  updateProjectSettings,
  updateSocialProvider,
  updateStorageSettings,
  uploadProjectIcon,
  verifyBillingSettings,
  verifySocialProvider
} from "../api";
import { notifyError, notifySuccess } from "../toast";
import type {
  BillingSettingsPatch,
  CreatePolarProductInput,
  ProjectSettingsPatch,
  SocialProviderId,
  SocialProviderPatch,
  StorageSettingsPatch
} from "../types";

export const useProjectRouteMutations = () => {
  const queryClient = useQueryClient();
  const [resentVerificationEmail, setResentVerificationEmail] = useState<string | null>(
    null
  );
  const [terminatedSessionsUserId, setTerminatedSessionsUserId] = useState<
    string | null
  >(null);

  const resendVerification = useMutation({
    mutationFn: (input: { project: string; email: string }) =>
      resendVerificationEmail(input.project, input.email),
    onSuccess: async (_data, variables) => {
      setResentVerificationEmail(variables.email);
      notifySuccess("Verification email sent", variables.email);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "project-users", variables.project]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "storage-objects", variables.project]
      });
    },
    onError: (caught, variables) => {
      notifyError(
        "Could not send verification email",
        `to ${variables.email}: ${caught instanceof Error ? caught.message : "unknown error"}`
      );
    }
  });
  const terminateSessions = useMutation({
    mutationFn: (input: { project: string; userId: string }) =>
      terminateUserSessions(input.project, input.userId),
    onSuccess: async (_data, variables) => {
      setTerminatedSessionsUserId(variables.userId);
      notifySuccess("Sessions terminated");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "project-users", variables.project]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "projects"]
      });
    },
    onError: (caught) => {
      notifyError(
        "Could not terminate sessions",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });
  const updateProject = useMutation({
    mutationFn: (input: { project: string; patch: ProjectSettingsPatch }) =>
      updateProjectSettings(input.project, input.patch),
    onSuccess: async (_data, variables) => {
      notifySuccess("Realm settings saved");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "projects"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "project-users", variables.project]
      });
    },
    onError: (caught) => {
      notifyError(
        "Could not save realm settings",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });
  const socialProviderUpdate = useMutation({
    mutationFn: (input: {
      project: string;
      provider: SocialProviderId;
      patch: SocialProviderPatch;
    }) => updateSocialProvider(input),
    onSuccess: async (_data, variables) => {
      notifySuccess("Social provider saved");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "social-providers", variables.project]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "projects"]
      });
    },
    onError: (caught) => {
      notifyError(
        "Could not save social provider",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });
  const socialProviderVerify = useMutation({
    mutationFn: (input: { project: string; provider: SocialProviderId }) =>
      verifySocialProvider(input),
    onSuccess: async (_data, variables) => {
      notifySuccess("Provider check passed");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "social-providers", variables.project]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "projects"]
      });
    },
    onError: (caught) => {
      notifyError(
        "Provider check failed",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });
  const billingUpdate = useMutation({
    mutationFn: (input: { project: string; patch: BillingSettingsPatch }) =>
      updateBillingSettings(input),
    onSuccess: async (_data, variables) => {
      notifySuccess("Billing settings saved");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "billing", variables.project]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "projects"]
      });
    },
    onError: (caught) => {
      notifyError(
        "Could not save billing settings",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });
  const billingVerify = useMutation({
    mutationFn: (input: {
      project: string;
      accessToken?: string;
      environment?: "sandbox" | "production";
    }) => verifyBillingSettings(input),
    onSuccess: () => {
      notifySuccess("Polar check passed");
    },
    onError: (caught) => {
      notifyError(
        "Polar check failed",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });
  const storageUpdate = useMutation({
    mutationFn: (input: { project: string; patch: StorageSettingsPatch }) =>
      updateStorageSettings(input),
    onSuccess: async (_data, variables) => {
      notifySuccess("Storage settings saved");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "storage", variables.project]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "projects"]
      });
    },
    onError: (caught) => {
      notifyError(
        "Could not save storage settings",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });
  const projectIconUpload = useMutation({
    mutationFn: (input: { project: string; file: File }) => uploadProjectIcon(input),
    onSuccess: async (_data, variables) => {
      notifySuccess("App icon uploaded");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "projects"]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "project-users", variables.project]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "storage-objects", variables.project]
      });
    },
    onError: (caught) => {
      notifyError(
        "Could not upload app icon",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });
  const polarProductCreate = useMutation({
    mutationFn: (input: { project: string; product: CreatePolarProductInput }) =>
      createPolarProduct(input),
    onSuccess: async (_data, variables) => {
      notifySuccess("Polar product created");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "billing", variables.project]
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "polar-products", variables.project]
      });
    },
    onError: (caught) => {
      notifyError(
        "Could not create Polar product",
        caught instanceof Error ? caught.message : undefined
      );
    }
  });

  return {
    resentVerificationEmail,
    terminatedSessionsUserId,
    resendVerification,
    terminateSessions,
    updateProject,
    socialProviderUpdate,
    socialProviderVerify,
    billingUpdate,
    billingVerify,
    storageUpdate,
    projectIconUpload,
    polarProductCreate
  };
};
