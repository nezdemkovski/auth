export {
  AuthPlatformScope,
  DEFAULT_AUTH_PLATFORM_SCOPES,
  createAuthPlatformProvider,
  type AuthPlatformProviderOptions
} from "./provider/config";
export {
  readAuthPlatformIdentity,
  type AuthPlatformIdentity,
  type AuthPlatformIdentityOptions
} from "./identity/subject";
export {
  AuthPlatformResource,
  AuthPlatformResourceScope,
  authPlatformResourceIdentifier,
  authPlatformResourceMetadataUrl,
  authPlatformResourceScopes
} from "./resource/config";
