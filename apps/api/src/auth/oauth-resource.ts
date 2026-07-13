import type { OAuthResourceRegistry } from "@nezdemkovski/auth-oauth-resource";

import type { AuthRegistry, RegisteredProject } from "./registry";

export const createOAuthResourceRegistryPort = (
  registry: AuthRegistry
): OAuthResourceRegistry<RegisteredProject> => ({
  get: (projectSlug) => {
    const registered = registry.get(projectSlug);
    if (!registered) {
      return null;
    }

    return {
      registered,
      projectSlug: registered.project.slug,
      oauthProviderEnabled: registered.project.features.oauthProvider.enabled,
      auth: registered.auth
    };
  }
});
