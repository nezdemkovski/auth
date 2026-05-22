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

  constructor(options: RegistryOptions) {
    for (const project of options.projects) {
      const projectDb = createProjectDatabase(options.databaseUrl, project);
      const auth = createProjectAuth({
        project,
        projectDb,
        publicBaseUrl: options.publicBaseUrl,
        secret: options.secret,
        emailSender: options.emailSender,
        trustProxyHeaders: options.trustProxyHeaders
      });

      this.projects.set(project.slug, {
        project,
        auth,
        projectDb
      });
    }
  }

  get(slug: string): RegisteredProject | null {
    return this.projects.get(slug) ?? null;
  }

  list(): AuthProject[] {
    return [...this.projects.values()].map(({ project }) => project);
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
}
