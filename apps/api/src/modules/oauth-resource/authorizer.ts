import { requestToResourceInput } from "better-auth/oauth2";

import type { AuthRegistry } from "../../auth/registry";
import {
  type OAuthResource,
  type OAuthScope
} from "../../config/oauth-resources";
import {
  requireServiceOAuthResource,
  requireUserOAuthResource,
  type ServiceOAuthResourceAccess,
  type UserOAuthResourceAccess
} from "./core";
import {
  oauthResourceFailureResponse,
  type OAuthResourceFailureResponse
} from "./translator";

export type UserOAuthResourceAuthorization =
  | {
      ok: true;
      value: UserOAuthResourceAccess;
    }
  | {
      ok: false;
      failure: OAuthResourceFailureResponse;
    };

export type ServiceOAuthResourceAuthorization =
  | {
      ok: true;
      value: ServiceOAuthResourceAccess;
    }
  | {
      ok: false;
      failure: OAuthResourceFailureResponse;
    };

type ResourceAuthorizationInput = {
  projectSlug: string;
  request: Request;
  resource: OAuthResource;
  scopes: OAuthScope[];
};

export type OAuthResourceAuthorizer = {
  authorizeUser(
    input: ResourceAuthorizationInput
  ): Promise<UserOAuthResourceAuthorization>;
  authorizeService(
    input: ResourceAuthorizationInput
  ): Promise<ServiceOAuthResourceAuthorization>;
};

export const createOAuthResourceAuthorizer = (options: {
  registry: AuthRegistry;
  publicBaseUrl: string;
}): OAuthResourceAuthorizer => ({
  authorizeUser: (input) =>
    authorizeUserOAuthResourceRequest({
      ...options,
      ...input
    }),
  authorizeService: (input) =>
    authorizeServiceOAuthResourceRequest({
      ...options,
      ...input
    })
});

export const authorizeUserOAuthResourceRequest = async (options: {
  registry: AuthRegistry;
  publicBaseUrl: string;
  projectSlug: string;
  request: Request;
  resource: OAuthResource;
  scopes: OAuthScope[];
}): Promise<UserOAuthResourceAuthorization> => {
  try {
    return {
      ok: true,
      value: await requireUserOAuthResource({
        ...options,
        request: requestToResourceInput(options.request)
      })
    };
  } catch (error) {
    const failure = oauthResourceFailureResponse(error, options);
    if (!failure) {
      throw error;
    }

    return {
      ok: false,
      failure
    };
  }
};

export const authorizeServiceOAuthResourceRequest = async (options: {
  registry: AuthRegistry;
  publicBaseUrl: string;
  projectSlug: string;
  request: Request;
  resource: OAuthResource;
  scopes: OAuthScope[];
}): Promise<ServiceOAuthResourceAuthorization> => {
  try {
    return {
      ok: true,
      value: await requireServiceOAuthResource({
        ...options,
        request: requestToResourceInput(options.request)
      })
    };
  } catch (error) {
    const failure = oauthResourceFailureResponse(error, options);
    if (!failure) {
      throw error;
    }

    return {
      ok: false,
      failure
    };
  }
};
