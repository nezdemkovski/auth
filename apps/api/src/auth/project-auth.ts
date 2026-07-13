import {
  createProjectAuth as createRuntimeProjectAuth,
  createProjectMigrationAuthOptions as createRuntimeMigrationAuthOptions,
  type ProjectDatabase,
  type ProjectAuthPluginContribution as RuntimePluginContribution
} from "@nezdemkovski/auth-better-auth-runtime";
import type { EmailSender } from "@nezdemkovski/auth-delivery";
import type { BetterAuthOptions } from "better-auth";

import type { AuthProject } from "../config/projects";
import { TRUSTED_CLIENT_IP_HEADER } from "../config/proxy";
import {
  createProjectAuthEmailContribution,
  createProjectAuthProtocolOptions
} from "./protocol";

export type ProjectAuthPluginContribution =
  RuntimePluginContribution<AuthProject>;

export const createProjectAuth = (options: {
  project: AuthProject;
  projectDb: ProjectDatabase;
  publicBaseUrl: string;
  secret: string;
  emailSender: EmailSender | null;
  trustProxyHeaders: boolean;
  pluginContributions?: ProjectAuthPluginContribution[];
}) => {
  return createRuntimeProjectAuth({
    project: options.project,
    projectDb: options.projectDb,
    publicBaseUrl: options.publicBaseUrl,
    secret: options.secret,
    trustedClientIpHeader: TRUSTED_CLIENT_IP_HEADER,
    trustProxyHeaders: options.trustProxyHeaders,
    protocol: createProjectAuthProtocolOptions(options.publicBaseUrl),
    emailContribution: createProjectAuthEmailContribution(options.emailSender),
    pluginContributions: options.pluginContributions
  });
};

export const createProjectMigrationAuthOptions = (options: {
  project: AuthProject;
  database: BetterAuthOptions["database"];
  publicBaseUrl: string;
  secret: string;
}) => {
  return createRuntimeMigrationAuthOptions({
    ...options,
    trustedClientIpHeader: TRUSTED_CLIENT_IP_HEADER,
    protocol: createProjectAuthProtocolOptions(options.publicBaseUrl)
  });
};
