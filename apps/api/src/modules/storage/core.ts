import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import { updateProjectIconUrl } from "../../db/project-settings";
import {
  insertStorageObject,
  listStorageObjects,
  readPublicStorageSettings,
  updateStorageSettings,
  type PublicStorageSettings,
  type StorageSettingsPatch
} from "./store";
import {
  uploadMedia,
  type MediaUploadPurpose,
  type MediaUploadResult
} from "./media";

export type StorageServiceOptions = {
  registry: AuthRegistry;
  databaseUrl: string;
  adminProject: AuthProject;
  encryptionSecret: string;
  managedStorage: AuthProject["storage"];
};

export type StorageUploadInput = {
  registered: RegisteredProject;
  purpose: MediaUploadPurpose;
  file: File;
  ownerUserId: string | null;
};

export class StorageService {
  constructor(private readonly options: StorageServiceOptions) {}

  readSettings(project: AuthProject) {
    return readPublicStorageSettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      project,
      managedStorage: this.options.managedStorage
    });
  }

  listObjects(registered: RegisteredProject) {
    return listStorageObjects(registered.projectDb.pool);
  }

  async updateSettings(
    registered: RegisteredProject,
    patch: StorageSettingsPatch
  ): Promise<PublicStorageSettings> {
    const storage = await updateStorageSettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      project: registered.project,
      encryptionSecret: this.options.encryptionSecret,
      managedStorage: this.options.managedStorage,
      patch
    });

    await this.options.registry.updateProject({
      ...registered.project,
      storage
    });

    return this.readSettings(registered.project);
  }

  async uploadProjectIcon(input: StorageUploadInput): Promise<{
    upload: MediaUploadResult;
    project: AuthProject | null;
  }> {
    const uploaded = await this.uploadAndRecord(input);
    const project = await updateProjectIconUrl({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      slug: input.registered.project.slug,
      iconUrl: uploaded.publicUrl
    });

    if (project) {
      await this.options.registry.updateProject({
        ...input.registered.project,
        iconUrl: uploaded.publicUrl
      });
    }

    return {
      upload: uploaded,
      project: project
        ? {
            ...input.registered.project,
            iconUrl: uploaded.publicUrl
          }
        : null
    };
  }

  async uploadUserAvatar(input: StorageUploadInput): Promise<{
    upload: MediaUploadResult;
    user: { id: string; image: string };
  }> {
    if (!input.ownerUserId) {
      throw new Error("ownerUserId is required for user avatar uploads");
    }

    const uploaded = await this.uploadAndRecord(input);
    await updateUserImage(
      input.registered.projectDb.pool,
      input.ownerUserId,
      uploaded.publicUrl
    );

    return {
      upload: uploaded,
      user: {
        id: input.ownerUserId,
        image: uploaded.publicUrl
      }
    };
  }

  private async uploadAndRecord(input: StorageUploadInput): Promise<MediaUploadResult> {
    const uploaded = await uploadMedia({
      storage: input.registered.project.storage,
      realmSlug: input.registered.project.slug,
      purpose: input.purpose,
      file: input.file,
      ownerUserId: input.ownerUserId
    });

    await insertStorageObject(input.registered.projectDb.pool, {
      purpose: input.purpose,
      ...uploaded,
      ownerUserId: input.ownerUserId
    });

    return uploaded;
  }
}

async function updateUserImage(
  pool: Pool,
  userId: string,
  image: string
): Promise<void> {
  const db = drizzle({ client: pool });
  await db.execute(sql`
    UPDATE "user"
    SET image = ${image},
        "updatedAt" = now()
    WHERE id = ${userId}
  `);
}
