import {
  OAuthResource,
  type OAuthScope,
  oauthResourceMetadataUrl
} from "../../config/oauth-resources";
import { ErrorCode } from "../../runtime/error-codes";
import { OAuthResourceError, OAuthResourceErrorKind } from "./core";

export type OAuthResourceFailureResponse = {
  error: ErrorCode;
  status: 401 | 403 | 404;
  wwwAuthenticate?: string;
};

export const oauthResourceFailureResponse = (
  error: unknown,
  options: {
    publicBaseUrl: string;
    projectSlug: string;
    resource: OAuthResource;
    scopes: OAuthScope[];
  }
): OAuthResourceFailureResponse | null => {
  if (!(error instanceof OAuthResourceError)) {
    return null;
  }

  if (error.kind === OAuthResourceErrorKind.UnknownProject) {
    return {
      error: ErrorCode.UnknownProject,
      status: 404
    };
  }
  const metadataUrl = oauthResourceMetadataUrl(
    options.publicBaseUrl,
    options.projectSlug,
    options.resource
  );
  if (error.kind === OAuthResourceErrorKind.InsufficientScope) {
    return {
      error: ErrorCode.InsufficientScope,
      status: 403,
      wwwAuthenticate: [
        `Bearer resource_metadata="${metadataUrl}"`,
        `error="insufficient_scope", scope="${options.scopes.join(" ")}"`
      ].join(", ")
    };
  }

  return {
    error: ErrorCode.Unauthorized,
    status: 401,
    wwwAuthenticate: [
      `Bearer resource_metadata="${metadataUrl}"`,
      "error=\"invalid_token\""
    ].join(", ")
  };
};
