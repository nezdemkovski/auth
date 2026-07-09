import type { AuthRegistry, RegisteredProject } from "../../auth/registry";
import type { AuthProject } from "../../config/projects";
import type { AdminDatabase } from "../../db/admin-pool";
import { updateProjectIconUrl } from "../projects/store";
import { readUserImage, updateUserImage } from "../users/store";
import {
  insertStorageObject,
  listStorageObjects,
  deleteStorageObject,
  findStorageObjectByPublicUrl,
  listPendingStorageObjects,
  markStorageObjectPendingDeletion
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
import { logError } from "../../runtime/logger";

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
  cleanup(
    uploaded: MediaUploadResult,
    context: { originalError: unknown; recorded: boolean }
  ): Promise<void>;
}) => {
  let uploaded: MediaUploadResult | null = null;
  let recorded = false;
  let persisted = false;

  try {
    uploaded = await options.upload();
    await options.record(uploaded);
    recorded = true;
    const result = await options.persist(uploaded);
    persisted = true;
    return { uploaded, result };
  } catch (error) {
    if (uploaded && !persisted) {
      await options.cleanup(uploaded, {
        originalError: error,
        recorded
      });
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

    await this.options.registry.patchProject(registered.project.slug, { storage });

    return this.readSettings(registered.project);
  }

  async uploadProjectIcon(input: StorageUploadInput) {
    return this.withUploadedMedia(input, input.registered.project.iconUrl, async (uploaded) => {
      const project = await updateProjectIconUrl({
        databaseUrl: this.options.databaseUrl,
        adminProject: this.options.adminProject,
        slug: input.registered.project.slug,
        iconUrl: uploaded.publicUrl
      });

      if (project) {
        await this.options.registry.patchProject(input.registered.project.slug, {
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
    const previousUrl = await readUserImage(
      input.registered.projectDb.pool,
      ownerUserId
    );

    return this.withUploadedMedia(input, previousUrl, async (uploaded) => {
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
    previousUrl: string,
    persist: (uploaded: MediaUploadResult) => Promise<T>
  ) {
    await retryPendingStorageCleanup(
      input.registered.projectDb.pool,
      input.registered.project.storage
    );

    const workflow = await runUploadedMediaWorkflow({
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
      cleanup: (uploaded, context) =>
        cleanupUploadedMedia(
          input.registered.projectDb.pool,
          input.registered.project.storage,
          uploaded,
          context
        )
    });

    await retireReplacedMedia({
      pool: input.registered.projectDb.pool,
      storage: input.registered.project.storage,
      previousUrl,
      nextUrl: workflow.uploaded.publicUrl
    }).catch((error) => {
      logError("storage_replaced_object_retirement_failed", {
        previousUrl,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return workflow.result;
  }
}

const cleanupUploadedMedia = async (
  pool: RegisteredProject["projectDb"]["pool"],
  storage: AuthProject["storage"],
  uploaded: MediaUploadResult,
  context: { originalError: unknown; recorded: boolean }
) => {
  if (!context.recorded) {
    try {
      await deleteUploadedMedia({
        storage,
        objectKey: uploaded.objectKey
      });
      return;
    } catch (cleanupError) {
      throw new StorageCleanupError(
        "Storage upload and untracked object cleanup both failed",
        {
          originalError: context.originalError,
          cleanupError
        }
      );
    }
  }

  try {
    await markStorageObjectPendingDeletion(pool, uploaded.objectKey);
  } catch (cleanupError) {
    throw new StorageCleanupError(
      "Storage upload persistence and cleanup scheduling both failed",
      {
        originalError: context.originalError,
        cleanupError
      }
    );
  }

  const cleanupError = await deletePendingStorageObject(
    pool,
    storage,
    uploaded.objectKey
  );
  if (cleanupError) {
    throw new StorageCleanupError(
      "Storage upload persistence and deferred cleanup both failed",
      {
        originalError: context.originalError,
        cleanupError
      }
    );
  }
};

const retireReplacedMedia = async (options: {
  pool: RegisteredProject["projectDb"]["pool"];
  storage: AuthProject["storage"];
  previousUrl: string;
  nextUrl: string;
}) => {
  if (!options.previousUrl || options.previousUrl === options.nextUrl) {
    return;
  }

  const previous = await findStorageObjectByPublicUrl(
    options.pool,
    options.previousUrl
  );
  if (!previous) {
    return;
  }

  await markStorageObjectPendingDeletion(options.pool, previous.objectKey);
  await deletePendingStorageObject(
    options.pool,
    options.storage,
    previous.objectKey
  );
};

const retryPendingStorageCleanup = async (
  pool: RegisteredProject["projectDb"]["pool"],
  storage: AuthProject["storage"]
) => {
  const pending = await listPendingStorageObjects(pool);
  for (const object of pending) {
    await deletePendingStorageObject(pool, storage, object.objectKey);
  }
};

const deletePendingStorageObject = async (
  pool: RegisteredProject["projectDb"]["pool"],
  storage: AuthProject["storage"],
  objectKey: string
) => {
  try {
    await deleteUploadedMedia({ storage, objectKey });
    await deleteStorageObject(pool, objectKey);
    return null;
  } catch (error) {
    logError("storage_object_cleanup_deferred", {
      objectKey,
      error: error instanceof Error ? error.message : String(error)
    });
    return error;
  }
};
