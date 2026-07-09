type TrustedOriginRegistry = {
  isTrustedOrigin(slug: string, origin: string | undefined): boolean;
};

export const isTrustedProjectMutation = (
  registry: TrustedOriginRegistry,
  project: string,
  headers: Headers
) => {
  if (!headers.get("cookie")) {
    return true;
  }

  const origin = headers.get("origin") ?? undefined;
  return registry.isTrustedOrigin(project, origin);
};
