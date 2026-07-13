import { requestToResourceInput } from "better-auth/oauth2";

import {
  requireServiceOAuthResource,
  requireUserOAuthResource
} from "./core";
import {
  type OAuthResource,
  type OAuthResourceFailureResponse,
  type OAuthResourceRegistry,
  type OAuthScope,
  type ServiceOAuthResourceAccess,
  type UserOAuthResourceAccess
} from "./model";
import { oauthResourceFailureResponse } from "./translator";

export type UserOAuthResourceAuthorization<TRegistered> =
  | {
      ok: true;
      value: UserOAuthResourceAccess<TRegistered>;
    }
  | {
      ok: false;
      failure: OAuthResourceFailureResponse;
    };

export type ServiceOAuthResourceAuthorization<TRegistered> =
  | {
      ok: true;
      value: ServiceOAuthResourceAccess<TRegistered>;
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

export type OAuthResourceAuthorizer<TRegistered> = {
  authorizeUser(
    input: ResourceAuthorizationInput
  ): Promise<UserOAuthResourceAuthorization<TRegistered>>;
  authorizeService(
    input: ResourceAuthorizationInput
  ): Promise<ServiceOAuthResourceAuthorization<TRegistered>>;
};

export const createOAuthResourceAuthorizer = <TRegistered>(options: {
  registry: OAuthResourceRegistry<TRegistered>;
  publicBaseUrl: string;
}): OAuthResourceAuthorizer<TRegistered> => ({
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

export const authorizeUserOAuthResourceRequest = async <TRegistered>(options: {
  registry: OAuthResourceRegistry<TRegistered>;
  publicBaseUrl: string;
  projectSlug: string;
  request: Request;
  resource: OAuthResource;
  scopes: OAuthScope[];
}): Promise<UserOAuthResourceAuthorization<TRegistered>> => {
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

export const authorizeServiceOAuthResourceRequest = async <TRegistered>(options: {
  registry: OAuthResourceRegistry<TRegistered>;
  publicBaseUrl: string;
  projectSlug: string;
  request: Request;
  resource: OAuthResource;
  scopes: OAuthScope[];
}): Promise<ServiceOAuthResourceAuthorization<TRegistered>> => {
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
