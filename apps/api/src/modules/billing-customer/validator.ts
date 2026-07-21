export type CreateCheckoutInput = {
  slug: string;
};

export const parseCreateCheckout = (value: unknown): CreateCheckoutInput | null => {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "slug")) {
    return null;
  }
  if (typeof value.slug !== "string") {
    return null;
  }
  const slug = value.slug.trim();
  return slug && slug.length <= 120 ? { slug } : null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
