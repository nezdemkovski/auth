import { oauthResourceMetadataUrl } from "./config";
import {
  OAuthResourceError,
  OAuthResourceErrorKind,
  OAuthResourceFailureCode,
  type OAuthResource,
  type OAuthResourceFailureResponse,
  type OAuthScope
} from "./model";

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
      error: OAuthResourceFailureCode.UnknownProject,
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
      error: OAuthResourceFailureCode.InsufficientScope,
      status: 403,
      wwwAuthenticate: [
        `Bearer resource_metadata="${metadataUrl}"`,
        `error="insufficient_scope", scope="${options.scopes.join(" ")}"`
      ].join(", ")
    };
  }

  return {
    error: OAuthResourceFailureCode.Unauthorized,
    status: 401,
    wwwAuthenticate: [
      `Bearer resource_metadata="${metadataUrl}"`,
      "error=\"invalid_token\""
    ].join(", ")
  };
};
