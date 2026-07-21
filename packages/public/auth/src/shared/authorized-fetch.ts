export type AccessTokenSource = {
  getAccessToken(): Promise<string | null>;
  invalidateAccessToken(): void;
};

export const authorizedFetch = async (
  auth: AccessTokenSource,
  fetcher: typeof fetch,
  input: string | URL,
  init: RequestInit = {},
  retry = true
): Promise<Response> => {
  const token = await auth.getAccessToken();
  if (!token) {
    throw new Error("Authentication is required");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetcher(input, { ...init, headers });
  if (response.status !== 401 || !retry) {
    return response;
  }

  auth.invalidateAccessToken();
  return authorizedFetch(auth, fetcher, input, init, false);
};
