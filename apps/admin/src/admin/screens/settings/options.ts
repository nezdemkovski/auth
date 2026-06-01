import type { DeliveryProvider, ObservabilityProvider } from "../../types";

export const DELIVERY_PROVIDER_OPTIONS = [
  { value: "none", label: "Disabled" },
  { value: "resend", label: "Resend" },
  { value: "cloudflare", label: "Cloudflare Email Routing" }
];

export const OBSERVABILITY_PROVIDER_OPTIONS = [
  { value: "none", label: "Disabled" },
  { value: "sentry", label: "Sentry" }
];

export const parseDeliveryProvider = (value: string): DeliveryProvider => {
  if (value === "resend" || value === "cloudflare") {
    return value;
  }
  return "none";
};

export const parseObservabilityProvider = (value: string): ObservabilityProvider => {
  if (value === "sentry") {
    return value;
  }
  return "none";
};
