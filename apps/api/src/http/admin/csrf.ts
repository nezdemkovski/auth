export const isStateChangingMethod = (method: string) => {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
};

export const isTrustedAdminRequest = (headers: Headers, adminOrigin: string) => {
  const origin = headers.get("origin");
  if (origin) {
    return origin === adminOrigin;
  }

  const secFetchSite = headers.get("sec-fetch-site");
  if (secFetchSite) {
    return secFetchSite === "same-origin";
  }

  return false;
};
