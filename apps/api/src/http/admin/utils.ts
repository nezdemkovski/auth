export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const parseJson = async (req: { json(): Promise<unknown> }) => {
  const body = await req.json().catch(() => ({}));
  return isRecord(body) ? body : {};
};
