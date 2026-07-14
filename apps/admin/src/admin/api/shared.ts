export const jsonHeaders = {
  "Content-Type": "application/json"
};

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export enum AdminSessionState {
  Authenticated = "authenticated",
  Unauthorized = "unauthorized"
}

const sessionListeners = new Set<(state: AdminSessionState) => void>();

export const subscribeAdminSession = (
  listener: (state: AdminSessionState) => void
) => {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
};

export const notifyAdminAuthenticated = () => {
  notifyAdminSession(AdminSessionState.Authenticated);
};

export const notifyAdminUnauthorized = () => {
  notifyAdminSession(AdminSessionState.Unauthorized);
};

const notifyAdminSession = (state: AdminSessionState) => {
  for (const listener of sessionListeners) {
    listener(state);
  }
};

export const adminFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
) => {
  const response = await fetch(input, init);
  if (response.status === 401) {
    notifyAdminUnauthorized();
    throw new UnauthorizedError();
  }

  return response;
};

type ErrorBody = {
  error?: string;
  message?: string;
  code?: string;
};

export const readJson = async <T>(response: Response): Promise<T> => {
  return response.json() as Promise<T>;
};

export const readErrorBody = async (response: Response): Promise<ErrorBody | null> => {
  return response.json().catch(() => null) as Promise<ErrorBody | null>;
};

export const readErrorMessage = async (
  response: Response,
  fallback: string
): Promise<string> => {
  const body = await readErrorBody(response);
  return body?.message ?? fallback;
};
