export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function parseJson<T = Record<string, unknown>>(
  req: {
    json(): Promise<unknown>;
  },
  fallback: T = {} as T
): Promise<T> {
  return req.json().catch(() => fallback) as Promise<T>;
}
