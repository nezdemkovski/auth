import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PROJECT_STORAGE,
  MediaUploadPurpose,
  StorageProvider,
  StorageService,
  type StorageProviderAccess,
  type StorageStore
} from "@nezdemkovski/auth-storage";
import { Pool } from "pg";
import { DEFAULT_PROJECT_BILLING } from "@nezdemkovski/auth-billing";
import {
  DEFAULT_REALM_FEATURES,
  DEFAULT_REALM_SOCIAL_PROVIDERS
} from "@nezdemkovski/auth-realm";
import { MediaService } from "../core";

const project = {
  slug: "demo",
  name: "Demo App",
  schema: "demo_auth",
  description: "",
  iconUrl: "https://cdn.example/old.png",
  appUrl: "https://demo.example.com",
  trustedOrigins: ["https://demo.example.com"],
  features: DEFAULT_REALM_FEATURES,
  socialProviders: DEFAULT_REALM_SOCIAL_PROVIDERS,
  billing: DEFAULT_PROJECT_BILLING,
  storage: {
    ...DEFAULT_PROJECT_STORAGE,
    provider: StorageProvider.S3,
    enabled: true,
    bucket: "media",
    publicBaseUrl: "https://cdn.example",
    accessKeyId: "access",
    secretAccessKey: "secret"
  }
};

const uploaded = {
  bucket: "media",
  objectKey: "realms/demo/images/new.png",
  publicUrl: "https://cdn.example/realms/demo/images/new.png",
  originalFileName: "new.png",
  mimeType: "image/png",
  sizeBytes: 3,
  checksumSha256: "checksum"
};

const createService = () => {
  const calls: string[] = [];
  const store: StorageStore = {
    loadRuntimeSettings: async () => new Map(),
    readSettings: async () => null,
    saveSettings: async () => project.storage,
    listObjects: async () => [],
    insertObject: async () => {
      calls.push("record");
    },
    findObjectByPublicUrl: async (_pool, publicUrl) =>
      publicUrl === project.iconUrl
        ? { objectKey: "realms/demo/images/old.png", publicUrl }
        : null,
    markObjectPendingDeletion: async (_pool, objectKey) => {
      calls.push(`pending:${objectKey}`);
    },
    listPendingObjects: async () => [],
    deleteObject: async (_pool, objectKey) => {
      calls.push(`delete-record:${objectKey}`);
    }
  };
  const provider: StorageProviderAccess = {
    upload: async () => uploaded,
    delete: async ({ objectKey }) => {
      calls.push(`delete-provider:${objectKey}`);
    }
  };
  const storage = new StorageService({
    store,
    provider,
    managedStorage: DEFAULT_PROJECT_STORAGE,
    applyRuntimeSettings: async () => {}
  });
  const media = new MediaService({
    storage,
    realmIcons: {
      updateIcon: async (projectSlug, iconUrl) => {
        calls.push(`persist-realm:${projectSlug}:${iconUrl}`);
        return true;
      },
      applyRuntimeIcon: async (projectSlug, iconUrl) => {
        calls.push(`runtime-realm:${projectSlug}:${iconUrl}`);
      }
    },
    userAvatars: {
      read: async () => "",
      update: async () => {}
    }
  });

  return { calls, media };
};

describe("media application service", () => {
  test("coordinates storage with realm persistence through explicit ports", async () => {
    const { calls, media } = createService();
    const pool = new Pool();

    try {
      const result = await media.uploadProjectIcon({
        registered: { project, pool },
        purpose: MediaUploadPurpose.ProjectIcon,
        file: new File(["new"], "new.png", { type: "image/png" }),
        ownerUserId: "admin-user"
      });

      expect(result.project?.iconUrl).toBe(uploaded.publicUrl);
      expect(calls).toEqual([
        "record",
        `persist-realm:demo:${uploaded.publicUrl}`,
        `runtime-realm:demo:${uploaded.publicUrl}`,
        "pending:realms/demo/images/old.png",
        "delete-provider:realms/demo/images/old.png",
        "delete-record:realms/demo/images/old.png"
      ]);
    } finally {
      await pool.end();
    }
  });
});
