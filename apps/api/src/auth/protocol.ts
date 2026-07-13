import type {
  ProjectAuthEmailContribution,
  ProjectAuthProtocolOptions
} from "@nezdemkovski/auth-better-auth-runtime";
import {
  createProjectEmailHandlers,
  type EmailSender
} from "@nezdemkovski/auth-delivery";

import {
  OAUTH_DYNAMIC_CLIENT_SCOPES,
  OAUTH_SCOPES,
  OAuthTokenKind,
  oauthResourceDefinitions,
  oauthTokenKindClaim
} from "../config/oauth-resources";
import type { AuthProject } from "../config/projects";

export const createProjectAuthProtocolOptions = (
  publicBaseUrl: string
): ProjectAuthProtocolOptions<AuthProject> => {
  const tokenKindClaim = oauthTokenKindClaim(publicBaseUrl);

  return {
    oauthProvider: {
      scopes: OAUTH_SCOPES,
      dynamicClientScopes: OAUTH_DYNAMIC_CLIENT_SCOPES,
      resources: (project) =>
        oauthResourceDefinitions(publicBaseUrl, project.slug),
      userAccessTokenClaims: {
        [tokenKindClaim]: OAuthTokenKind.User
      },
      serviceAccessTokenClaims: {
        [tokenKindClaim]: OAuthTokenKind.Service
      }
    }
  };
};

export const createProjectAuthEmailContribution = (
  emailSender: EmailSender | null
): ProjectAuthEmailContribution<AuthProject> => {
  return (project) =>
    createProjectEmailHandlers({
      sender: emailSender,
      project
    });
};
