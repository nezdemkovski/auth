import type { AuthProject } from "../config/projects";
import { createProjectDatabase, type ProjectDatabase } from "../db/project-db";
import type { EmailSender } from "../email/sender";
import {
  createPolarWebhookHandlers,
  type PolarWebhookHandlers
} from "../modules/billing/webhooks";
import type { PolarEntitlementGrantStore } from "../modules/billing/usage-store";
import type { PolarWebhookStore } from "../modules/billing/webhook-store";
import { createProjectAuth } from "./project-auth";

type ProjectAuth = ReturnType<typeof createProjectAuth>;

export type RegisteredProject = {
  project: AuthProject;
  auth: ProjectAuth;
  projectDb: ProjectDatabase;
};

type RegistryOptions = {
  databaseUrl: string;
  publicBaseUrl: string;
  secret: string;
  emailSender: EmailSender | null;
  trustProxyHeaders: boolean;
  projects: AuthProject[];
  polarEntitlementGrantStore?: PolarEntitlementGrantStore;
  polarWebhookStore?: PolarWebhookStore;
};

export class AuthRegistry {
  private projects = new Map<string, RegisteredProject>();
  private options: RegistryOptions;

  constructor(options: RegistryOptions) {
    this.options = options;
    for (const project of options.projects) {
      this.projects.set(project.slug, this.createRegisteredProject(project));
    }
  }

  get(slug: string) {
    return this.projects.get(slug) ?? null;
  }

  list() {
    return [...this.projects.values()].map(({ project }) => project);
  }

  async updateProject(project: AuthProject) {
    const current = this.projects.get(project.slug);
    const next = this.createRegisteredProject(project);

    this.projects.set(project.slug, next);
    await current?.projectDb.pool.end();
  }

  async updateEmailSender(emailSender: EmailSender | null) {
    this.options = {
      ...this.options,
      emailSender
    };
    const projects = this.list();
    const currentProjects = [...this.projects.values()];
    const nextProjects = new Map<string, RegisteredProject>();

    for (const project of projects) {
      nextProjects.set(project.slug, this.createRegisteredProject(project));
    }

    this.projects = nextProjects;

    await Promise.all(
      currentProjects.map(({ projectDb }) => projectDb.pool.end())
    );
  }

  isTrustedOrigin(slug: string, origin: string | undefined) {
    if (!origin) {
      return false;
    }

    const registered = this.get(slug);

    if (!registered) {
      return false;
    }

    return registered.project.trustedOrigins.includes(origin);
  }

  async close() {
    await Promise.all(
      [...this.projects.values()].map(({ projectDb }) => projectDb.pool.end())
    );
  }

  private createRegisteredProject(project: AuthProject) {
    const projectDb = createProjectDatabase(this.options.databaseUrl, project);
    const auth = createProjectAuth({
      project,
      projectDb,
      publicBaseUrl: this.options.publicBaseUrl,
      secret: this.options.secret,
      emailSender: this.options.emailSender,
      trustProxyHeaders: this.options.trustProxyHeaders,
      polarWebhookHandlers: this.createPolarWebhookHandlers()
    });

    return {
      project,
      auth,
      projectDb
    };
  }

  private createPolarWebhookHandlers() {
    const store = this.options.polarWebhookStore;
    const entitlements = this.options.polarEntitlementGrantStore;
    if (!store || !entitlements) {
      return undefined;
    }

    return (project: AuthProject): PolarWebhookHandlers =>
      createPolarWebhookHandlers({
        project,
        entitlements,
        store
      });
  }
}
