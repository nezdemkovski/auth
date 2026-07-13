import { memoryAdapter, type MemoryDB } from "@better-auth/memory-adapter";
import { createAuthPlatformProvider } from "@nezdemkovski/auth-integration";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

export type ReferenceProductAuthOptions = {
  baseURL: string;
  secret: string;
  authIssuer: string;
  authClientId: string;
  authClientSecret: string;
  database: MemoryDB;
};

export const createReferenceProductAuth = (
  options: ReferenceProductAuthOptions
) => {
  return betterAuth({
    appName: "Auth reference product",
    baseURL: options.baseURL,
    secret: options.secret,
    database: memoryAdapter(options.database),
    trustedOrigins: [new URL(options.baseURL).origin],
    plugins: [
      genericOAuth({
        config: [
          createAuthPlatformProvider({
            issuer: options.authIssuer,
            clientId: options.authClientId,
            clientSecret: options.authClientSecret
          })
        ]
      })
    ],
    advanced: {
      cookiePrefix: "reference_product"
    },
    telemetry: {
      enabled: false
    }
  });
};

export type ReferenceProductAuth = ReturnType<typeof createReferenceProductAuth>;
