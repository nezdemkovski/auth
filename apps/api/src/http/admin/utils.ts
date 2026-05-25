import { isRecord } from "../../runtime/type-guards";

export { isRecord };

export const parseJson = async (req: { json(): Promise<unknown> }) => {
  const body = await req.json().catch(() => ({}));
  return isRecord(body) ? body : {};
};
