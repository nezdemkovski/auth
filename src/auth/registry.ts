import type { AuthProject } from "../config/projects";
import { createProjectDatabase, type ProjectDatabase } from "../db/project-db";
import type { EmailSender } from "../email/sender";
import { createProjectAuth } from "./project-auth";

type ProjectAuth = ReturnType<typeof createProjectAuth>;

type RegisteredProject = {
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
};

export class AuthRegistry {
  private readonly projects = new Map<string, RegisteredProject>();
  private readonly options: RegistryOptions;

  constructor(options: RegistryOptions) {
    this.options = options;
    for (const project of options.projects) {
      this.projects.set(project.slug, this.createRegisteredProject(project));
    }
  }

  get(slug: string): RegisteredProject | null {
    return this.projects.get(slug) ?? null;
  }

  list(): AuthProject[] {
    return [...this.projects.values()].map(({ project }) => project);
  }

  async updateProject(project: AuthProject): Promise<void> {
    const current = this.projects.get(project.slug);
    const next = this.createRegisteredProject(project);

    this.projects.set(project.slug, next);
    await current?.projectDb.pool.end();
  }

  isTrustedOrigin(slug: string, origin: string | undefined): boolean {
    if (!origin) {
      return false;
    }

    const registered = this.get(slug);

    if (!registered) {
      return false;
    }

    return registered.project.trustedOrigins.includes(origin);
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.projects.values()].map(({ projectDb }) => projectDb.pool.end())
    );
  }

  private createRegisteredProject(project: AuthProject): RegisteredProject {
    const projectDb = createProjectDatabase(this.options.databaseUrl, project);
    const auth = createProjectAuth({
      project,
      projectDb,
      publicBaseUrl: this.options.publicBaseUrl,
      secret: this.options.secret,
      emailSender: this.options.emailSender,
      trustProxyHeaders: this.options.trustProxyHeaders
    });

    return {
      project,
      auth,
      projectDb
    };
  }
}
