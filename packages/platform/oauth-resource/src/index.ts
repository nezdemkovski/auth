export {
  OAUTH_DYNAMIC_CLIENT_SCOPES,
  OAUTH_SCOPES,
  oauthResourceDefinitions,
  oauthResourceIdentifier,
  oauthResourceMetadataScopes,
  oauthResourceMetadataUrl,
  oauthResourceScopes,
  oauthTokenKindClaim
} from "./config";
export {
  readOAuthResourceMetadata,
  requireServiceOAuthResource,
  requireUserOAuthResource
} from "./core";
export {
  authorizeServiceOAuthResourceRequest,
  authorizeUserOAuthResourceRequest,
  createOAuthResourceAuthorizer,
  type OAuthResourceAuthorizer,
  type ServiceOAuthResourceAuthorization,
  type UserOAuthResourceAuthorization
} from "./authorizer";
export {
  OAuthResource,
  OAuthResourceError,
  OAuthResourceErrorKind,
  OAuthResourceFailureCode,
  OAuthScope,
  OAuthTokenKind,
  type OAuthResourceAuth,
  type OAuthResourceFailureResponse,
  type OAuthResourceRegistration,
  type OAuthResourceRegistry,
  type ServiceOAuthResourceAccess,
  type UserOAuthResourceAccess
} from "./model";
export { oauthResourceFailureResponse } from "./translator";
