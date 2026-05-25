import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import { updateProjectIconUrl } from "../projects/store";
import { updateUserImage } from "../users/store";
import {
  insertStorageObject,
  listStorageObjects
} from "./objects-store";
import {
  readPublicStorageSettings,
  updateStorageSettings,
  type PublicStorageSettings,
  type StorageSettingsPatch
} from "./settings-store";
import {
  deleteUploadedMedia,
  uploadMedia,
  type MediaUploadPurpose,
  type MediaUploadResult
} from "./media";

export type StorageServiceOptions = {
  registry: AuthRegistry;
  databaseUrl: string;
  adminProject: AuthProject;
  adminDb?: AdminDatabase;
  encryptionSecret: string;
  managedStorage: AuthProject["storage"];
};

export type StorageUploadInput = {
  registered: RegisteredProject;
  purpose: MediaUploadPurpose;
  file: File;
  ownerUserId: string | null;
};

export class StorageCleanupError extends Error {
  constructor(
    message: string,
    readonly cause: unknown
  ) {
    super(message);
    this.name = "StorageCleanupError";
  }
}

export const runUploadedMediaWorkflow = async <T>(options: {
  upload(): Promise<MediaUploadResult>;
  record(uploaded: MediaUploadResult): Promise<void>;
  persist(uploaded: MediaUploadResult): Promise<T>;
  cleanup(uploaded: MediaUploadResult, originalError: unknown): Promise<void>;
}) => {
  let uploaded: MediaUploadResult | null = null;

  try {
    uploaded = await options.upload();
    await options.record(uploaded);
    return await options.persist(uploaded);
  } catch (error) {
    if (uploaded) {
      await options.cleanup(uploaded, error);
    }
    throw error;
  }
};

export class StorageService {
  constructor(private readonly options: StorageServiceOptions) {}

  readSettings(project: AuthProject) {
    return readPublicStorageSettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
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
  ) {
    const storage = await updateStorageSettings({
      databaseUrl: this.options.databaseUrl,
      adminProject: this.options.adminProject,
      adminDb: this.options.adminDb,
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

  async uploadProjectIcon(input: StorageUploadInput) {
    return this.withUploadedMedia(input, async (uploaded) => {
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
    });
  }

  async uploadUserAvatar(input: StorageUploadInput) {
    if (!input.ownerUserId) {
      throw new Error("ownerUserId is required for user avatar uploads");
    }
    const ownerUserId = input.ownerUserId;

    return this.withUploadedMedia(input, async (uploaded) => {
      await updateUserImage(
        input.registered.projectDb.pool,
        ownerUserId,
        uploaded.publicUrl
      );

      return {
        upload: uploaded,
        user: {
          id: ownerUserId,
          image: uploaded.publicUrl
        }
      };
    });
  }

  private async withUploadedMedia<T>(
    input: StorageUploadInput,
    persist: (uploaded: MediaUploadResult) => Promise<T>
  ) {
    return runUploadedMediaWorkflow({
      upload: () =>
        uploadMedia({
          storage: input.registered.project.storage,
          realmSlug: input.registered.project.slug,
          purpose: input.purpose,
          file: input.file,
          ownerUserId: input.ownerUserId
        }),
      record: (uploaded) =>
        insertStorageObject(input.registered.projectDb.pool, {
          purpose: input.purpose,
          ...uploaded,
          ownerUserId: input.ownerUserId
        }),
      persist,
      cleanup: (uploaded, error) =>
        cleanupUploadedMedia(input.registered.project.storage, uploaded, error)
    });
  }
}

const cleanupUploadedMedia = async (storage: AuthProject["storage"], uploaded: MediaUploadResult, originalError: unknown) => {
  try {
    await deleteUploadedMedia({
      storage,
      objectKey: uploaded.objectKey
    });
  } catch (cleanupError) {
    throw new StorageCleanupError(
      "Storage upload succeeded but persistence and cleanup both failed",
      {
        originalError,
        cleanupError
      }
    );
  }
};
