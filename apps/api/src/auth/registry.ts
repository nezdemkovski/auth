import type { EmailSender } from "@nezdemkovski/auth-delivery";

import type { AuthProject } from "../config/projects";
import { createProjectDatabase, type ProjectDatabase } from "../db/project-db";
import {
  createProjectAuth,
  type ProjectAuthPluginContribution
} from "./project-auth";

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
  pluginContributions?: ProjectAuthPluginContribution[];
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

  async ready(): Promise<void> {
    await Promise.all(
      [...this.projects.values()].map(({ auth }) => auth.$context)
    );
  }

  async updateProject(project: AuthProject): Promise<void> {
    const current = this.projects.get(project.slug);
    if (current && current.project.schema !== project.schema) {
      throw new Error("Project schema cannot change at runtime");
    }
    const next = this.createRegisteredProject(project, current?.projectDb);
    try {
      await next.auth.$context;
    } catch (error) {
      if (!current) {
        await next.projectDb.pool.end();
      }
      throw error;
    }

    this.projects.set(project.slug, next);
  }

  async patchProject(
    slug: string,
    patch: Partial<Omit<AuthProject, "slug" | "schema">>
  ): Promise<void> {
    const current = this.projects.get(slug);
    if (!current) {
      throw new Error(`Unknown project: ${slug}`);
    }

    await this.updateProject({
      ...current.project,
      ...patch
    });
  }

  async updateEmailSender(emailSender: EmailSender | null): Promise<void> {
    const previousOptions = this.options;
    this.options = {
      ...this.options,
      emailSender
    };
    const nextProjects = new Map<string, RegisteredProject>();

    for (const current of this.projects.values()) {
      nextProjects.set(
        current.project.slug,
        this.createRegisteredProject(current.project, current.projectDb)
      );
    }

    try {
      await Promise.all(
        [...nextProjects.values()].map(({ auth }) => auth.$context)
      );
      this.projects = nextProjects;
    } catch (error) {
      this.options = previousOptions;
      throw error;
    }
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
    await Promise.allSettled(
      [...this.projects.values()].map(({ auth }) => auth.$context)
    );
    await Promise.all(
      [...this.projects.values()].map(({ projectDb }) => projectDb.pool.end())
    );
  }

  private createRegisteredProject(
    project: AuthProject,
    existingProjectDb?: ProjectDatabase
  ) {
    const projectDb = existingProjectDb ?? createProjectDatabase(this.options.databaseUrl, project);
    const auth = createProjectAuth({
      project,
      projectDb,
      publicBaseUrl: this.options.publicBaseUrl,
      secret: this.options.secret,
      emailSender: this.options.emailSender,
      trustProxyHeaders: this.options.trustProxyHeaders,
      pluginContributions: this.options.pluginContributions
    });

    return {
      project,
      auth,
      projectDb
    };
  }
}
