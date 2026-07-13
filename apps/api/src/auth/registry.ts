import {
  AuthRegistry as RuntimeAuthRegistry,
  type AuthRegistryOptions as RuntimeRegistryOptions,
  type RegisteredProject as RuntimeRegisteredProject
} from "@nezdemkovski/auth-better-auth-runtime";
import type { EmailSender } from "@nezdemkovski/auth-delivery";

import type { AuthProject } from "../config/projects";
import { TRUSTED_CLIENT_IP_HEADER } from "../config/proxy";
import {
  createProjectAuthEmailContribution,
  createProjectAuthProtocolOptions
} from "./protocol";

export type RegisteredProject = RuntimeRegisteredProject<AuthProject>;

type RegistryOptions = Omit<
  RuntimeRegistryOptions<AuthProject>,
  "emailContribution" | "protocol" | "trustedClientIpHeader"
> & {
  emailSender: EmailSender | null;
};

export class AuthRegistry extends RuntimeAuthRegistry<AuthProject> {
  constructor(options: RegistryOptions) {
    super({
      ...options,
      trustedClientIpHeader: TRUSTED_CLIENT_IP_HEADER,
      protocol: createProjectAuthProtocolOptions(options.publicBaseUrl),
      emailContribution: createProjectAuthEmailContribution(options.emailSender)
    });
  }

  updateEmailSender(emailSender: EmailSender | null): Promise<void> {
    return this.updateEmailContribution(
      createProjectAuthEmailContribution(emailSender)
    );
  }
}
