import { z } from "zod";

import { OAuthClientProfile } from "./model";

const clientIdSchema = z.string().trim().min(1).max(256);
const nameSchema = z.string().trim().min(1).max(120);
const uriSchema = z.url();
const scopeSchema = z.string().trim().min(1).max(256);
const profileSchema = z.enum([
  OAuthClientProfile.Web,
  OAuthClientProfile.Public,
  OAuthClientProfile.Service
]);

export const createOAuthClientBodySchema = z.object({
  name: nameSchema,
  profile: profileSchema,
  redirectUris: z.array(uriSchema).max(20),
  postLogoutRedirectUris: z.array(uriSchema).max(20),
  scopes: z.array(scopeSchema).min(1).max(50),
  resources: z.array(uriSchema).max(20),
  skipConsent: z.boolean().optional()
});

export const updateOAuthClientSchema = z
  .object({
    name: nameSchema.optional(),
    redirectUris: z.array(uriSchema).max(20).optional(),
    postLogoutRedirectUris: z.array(uriSchema).max(20).optional(),
    scopes: z.array(scopeSchema).min(1).max(50).optional(),
    resources: z.array(uriSchema).max(20).optional(),
    skipConsent: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0);

export const oauthClientQuerySchema = z.object({ clientId: clientIdSchema });
export const oauthClientBodySchema = z.object({ clientId: clientIdSchema });
