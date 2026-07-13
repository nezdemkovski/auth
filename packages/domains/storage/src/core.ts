import type {
  MediaUploadPurpose,
  MediaUploadResult,
  ProjectStorageSettings,
  StorageRealm,
  StorageSettingsPatch
} from "./model";
import type { StorageProviderAccess, StorageStore } from "./ports";
import { publicStorageSettings } from "./translator";
import {
  normalizeStorageSettingsPatch,
  validateStorageSettingsPatch
} from "./validator";

export enum StorageCleanupEventType {
  ReplacedObjectRetirementFailed = "replaced_object_retirement_failed",
  ObjectCleanupDeferred = "object_cleanup_deferred"
}

export type StorageCleanupEvent = {
  type: StorageCleanupEventType;
  objectKey?: string;
  previousUrl?: string;
  error: unknown;
};

export type StorageServiceOptions = {
  store: StorageStore;
  provider: StorageProviderAccess;
  managedStorage: ProjectStorageSettings;
  applyRuntimeSettings(
    projectSlug: string,
    storage: ProjectStorageSettings
  ): Promise<void>;
  reportCleanupError?(event: StorageCleanupEvent): void;
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

  loadRuntimeSettings() {
    return this.options.store.loadRuntimeSettings();
  }

  async readSettings(projectSlug: string) {
    const stored = await this.options.store.readSettings(projectSlug);
    return publicStorageSettings(stored, this.options.managedStorage);
  }

  listObjects(realm: StorageRealm) {
    return this.options.store.listObjects(realm.pool);
  }

  async updateSettings(projectSlug: string, patch: StorageSettingsPatch) {
    const normalized = normalizeStorageSettingsPatch(
      patch,
      this.options.managedStorage
    );
    validateStorageSettingsPatch(normalized, {
      allowHttpEndpoint: this.options.managedStorage.managed
    });

    const storage = await this.options.store.saveSettings(
      projectSlug,
      normalized
    );
    await this.options.applyRuntimeSettings(projectSlug, storage);
    return this.readSettings(projectSlug);
  }

  async replaceMedia<T>(input: {
    realm: StorageRealm;
    purpose: MediaUploadPurpose;
    file: File;
    ownerUserId: string | null;
    previousUrl: string;
    persist(uploaded: MediaUploadResult): Promise<T>;
  }) {
    await this.retryPendingCleanup(input.realm);

    const workflow = await runUploadedMediaWorkflow({
      upload: () =>
        this.options.provider.upload({
          storage: input.realm.storage,
          realmSlug: input.realm.slug,
          purpose: input.purpose,
          file: input.file,
          ownerUserId: input.ownerUserId
        }),
      record: (uploaded) =>
        this.options.store.insertObject(input.realm.pool, {
          purpose: input.purpose,
          ...uploaded,
          ownerUserId: input.ownerUserId
        }),
      persist: input.persist,
      cleanup: (uploaded, context) =>
        this.cleanupUploadedMedia(input.realm, uploaded, context)
    });

    await this.retireReplacedMedia(
      input.realm,
      input.previousUrl,
      workflow.uploaded.publicUrl
    ).catch((error) => {
      this.options.reportCleanupError?.({
        type: StorageCleanupEventType.ReplacedObjectRetirementFailed,
        previousUrl: input.previousUrl,
        error
      });
    });

    return workflow;
  }

  async removeMediaReference<T>(input: {
    realm: StorageRealm;
    previousUrl: string;
    persist(): Promise<T>;
  }) {
    const result = await input.persist();
    await this.retireReplacedMedia(input.realm, input.previousUrl, "").catch(
      (error) => {
        this.options.reportCleanupError?.({
          type: StorageCleanupEventType.ReplacedObjectRetirementFailed,
          previousUrl: input.previousUrl,
          error
        });
      }
    );
    return result;
  }

  private async cleanupUploadedMedia(
    realm: StorageRealm,
    uploaded: MediaUploadResult,
    context: { originalError: unknown; recorded: boolean }
  ) {
    if (!context.recorded) {
      try {
        await this.options.provider.delete({
          storage: realm.storage,
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
      await this.options.store.markObjectPendingDeletion(
        realm.pool,
        uploaded.objectKey
      );
    } catch (cleanupError) {
      throw new StorageCleanupError(
        "Storage upload persistence and cleanup scheduling both failed",
        {
          originalError: context.originalError,
          cleanupError
        }
      );
    }

    const cleanupError = await this.deletePendingObject(
      realm,
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
  }

  private async retireReplacedMedia(
    realm: StorageRealm,
    previousUrl: string,
    nextUrl: string
  ) {
    if (!previousUrl || previousUrl === nextUrl) {
      return;
    }

    const previous = await this.options.store.findObjectByPublicUrl(
      realm.pool,
      previousUrl
    );
    if (!previous) {
      return;
    }

    await this.options.store.markObjectPendingDeletion(
      realm.pool,
      previous.objectKey
    );
    await this.deletePendingObject(realm, previous.objectKey);
  }

  private async retryPendingCleanup(realm: StorageRealm) {
    const pending = await this.options.store.listPendingObjects(realm.pool);
    for (const object of pending) {
      await this.deletePendingObject(realm, object.objectKey);
    }
  }

  private async deletePendingObject(
    realm: StorageRealm,
    objectKey: string
  ) {
    try {
      await this.options.provider.delete({
        storage: realm.storage,
        objectKey
      });
      await this.options.store.deleteObject(realm.pool, objectKey);
      return null;
    } catch (error) {
      this.options.reportCleanupError?.({
        type: StorageCleanupEventType.ObjectCleanupDeferred,
        objectKey,
        error
      });
      return error;
    }
  }
}
