import type {
  MediaUploadPurpose,
  MediaUploadResult,
  StorageRealm,
  StorageService
} from "@nezdemkovski/auth-storage";
import type { Pool } from "pg";

import type { AuthProject } from "../../config/projects";

type MediaStoragePort = Pick<
  StorageService,
  "replaceMedia" | "removeMediaReference"
>;

type RealmIconPort = {
  updateIcon(projectSlug: string, iconUrl: string): Promise<boolean>;
  applyRuntimeIcon(projectSlug: string, iconUrl: string): Promise<void>;
};

type UserAvatarPort = {
  read(pool: Pool, userId: string): Promise<string>;
  update(pool: Pool, userId: string, image: string): Promise<void>;
};

export type MediaProject = {
  project: AuthProject;
  pool: Pool;
};

export class MediaService {
  constructor(
    private readonly options: {
      storage: MediaStoragePort;
      realmIcons: RealmIconPort;
      userAvatars: UserAvatarPort;
    }
  ) {}

  async uploadProjectIcon(input: {
    registered: MediaProject;
    purpose: MediaUploadPurpose;
    file: File;
    ownerUserId: string | null;
  }) {
    const realm = storageRealm(input.registered);
    const workflow = await this.options.storage.replaceMedia({
      realm,
      purpose: input.purpose,
      file: input.file,
      ownerUserId: input.ownerUserId,
      previousUrl: input.registered.project.iconUrl,
      persist: async (uploaded: MediaUploadResult) => {
        const updated = await this.options.realmIcons.updateIcon(
          realm.slug,
          uploaded.publicUrl
        );
        if (!updated) {
          return null;
        }

        await this.options.realmIcons.applyRuntimeIcon(
          realm.slug,
          uploaded.publicUrl
        );
        return {
          ...input.registered.project,
          iconUrl: uploaded.publicUrl
        };
      }
    });

    return {
      upload: workflow.uploaded,
      project: workflow.result
    };
  }

  async uploadUserAvatar(input: {
    registered: MediaProject;
    purpose: MediaUploadPurpose;
    file: File;
    ownerUserId: string;
  }) {
    const realm = storageRealm(input.registered);
    const previousUrl = await this.options.userAvatars.read(
      realm.pool,
      input.ownerUserId
    );
    const workflow = await this.options.storage.replaceMedia({
      realm,
      purpose: input.purpose,
      file: input.file,
      ownerUserId: input.ownerUserId,
      previousUrl,
      persist: async (uploaded: MediaUploadResult) => {
        await this.options.userAvatars.update(
          realm.pool,
          input.ownerUserId,
          uploaded.publicUrl
        );
        return {
          id: input.ownerUserId,
          image: uploaded.publicUrl
        };
      }
    });

    return {
      upload: workflow.uploaded,
      user: workflow.result
    };
  }

  async deleteUserAvatar(input: {
    registered: MediaProject;
    ownerUserId: string;
  }) {
    const realm = storageRealm(input.registered);
    const previousUrl = await this.options.userAvatars.read(
      realm.pool,
      input.ownerUserId
    );

    return this.options.storage.removeMediaReference({
      realm,
      previousUrl,
      persist: async () => {
        await this.options.userAvatars.update(realm.pool, input.ownerUserId, "");
        return {
          user: {
            id: input.ownerUserId,
            image: null
          }
        };
      }
    });
  }
}

const storageRealm = (registered: MediaProject): StorageRealm => ({
  slug: registered.project.slug,
  storage: registered.project.storage,
  pool: registered.pool
});
