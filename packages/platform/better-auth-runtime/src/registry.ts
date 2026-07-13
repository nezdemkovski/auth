import type { Realm } from "@nezdemkovski/auth-realm";

import {
  createProjectDatabase,
  type ProjectDatabase
} from "./database";
import { createProjectAuth } from "./auth";
import type {
  ProjectAuth,
  ProjectAuthEmailContribution,
  ProjectAuthPluginContribution,
  ProjectAuthProtocolOptions
} from "./model";

export type RegisteredProject<TProject extends Realm = Realm> = {
  project: TProject;
  auth: ProjectAuth;
  projectDb: ProjectDatabase;
};

export type AuthRegistryOptions<TProject extends Realm> = {
  databaseUrl: string;
  publicBaseUrl: string;
  secret: string;
  trustedClientIpHeader: string;
  trustProxyHeaders: boolean;
  projects: TProject[];
  protocol: ProjectAuthProtocolOptions<TProject>;
  emailContribution?: ProjectAuthEmailContribution<TProject>;
  pluginContributions?: ProjectAuthPluginContribution<TProject>[];
};

export class AuthRegistry<TProject extends Realm = Realm> {
  private projects = new Map<string, RegisteredProject<TProject>>();
  private options: AuthRegistryOptions<TProject>;

  constructor(options: AuthRegistryOptions<TProject>) {
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
      [...this.projects.values()].map(({ auth }) => auth.ready())
    );
  }

  async updateProject(project: TProject): Promise<void> {
    const current = this.projects.get(project.slug);
    if (current && current.project.schema !== project.schema) {
      throw new Error("Project schema cannot change at runtime");
    }
    const next = this.createRegisteredProject(project, current?.projectDb);
    try {
      await next.auth.ready();
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
    patch: Partial<Omit<TProject, "slug" | "schema">>
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

  async removeProject(slug: string): Promise<void> {
    const current = this.projects.get(slug);
    if (!current) {
      return;
    }

    this.projects.delete(slug);
    await current.projectDb.pool.end();
  }

  async updateEmailContribution(
    emailContribution: ProjectAuthEmailContribution<TProject> | undefined
  ): Promise<void> {
    const previousOptions = this.options;
    this.options = {
      ...this.options,
      emailContribution
    };
    const nextProjects = new Map<string, RegisteredProject<TProject>>();

    for (const current of this.projects.values()) {
      nextProjects.set(
        current.project.slug,
        this.createRegisteredProject(current.project, current.projectDb)
      );
    }

    try {
      await Promise.all(
        [...nextProjects.values()].map(({ auth }) => auth.ready())
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
      [...this.projects.values()].map(({ auth }) => auth.ready())
    );
    await Promise.all(
      [...this.projects.values()].map(({ projectDb }) => projectDb.pool.end())
    );
  }

  private createRegisteredProject(
    project: TProject,
    existingProjectDb?: ProjectDatabase
  ) {
    const projectDb =
      existingProjectDb ??
      createProjectDatabase(this.options.databaseUrl, project);
    const auth = createProjectAuth({
      project,
      projectDb,
      publicBaseUrl: this.options.publicBaseUrl,
      secret: this.options.secret,
      trustedClientIpHeader: this.options.trustedClientIpHeader,
      trustProxyHeaders: this.options.trustProxyHeaders,
      protocol: this.options.protocol,
      emailContribution: this.options.emailContribution,
      pluginContributions: this.options.pluginContributions
    });

    return {
      project,
      auth,
      projectDb
    };
  }
}
