import { describe, expect, test } from "bun:test";

import {
  runUploadedMediaWorkflow,
  StorageCleanupError,
  StorageService
} from "../core";
import {
  DEFAULT_PROJECT_STORAGE,
  StorageProvider,
  type MediaUploadResult
} from "../model";
import type { StorageProviderAccess, StorageStore } from "../ports";

const uploaded: MediaUploadResult = {
  bucket: "auth-public",
  objectKey: "realms/demo/images/avatar.jpg",
  publicUrl: "https://cdn.example/realms/demo/images/avatar.jpg",
  originalFileName: "avatar.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  checksumSha256: "checksum"
};

const fakeStore = (): StorageStore => ({
  loadRuntimeSettings: async () => new Map(),
  readSettings: async () => null,
  saveSettings: async (_projectSlug, patch) => ({
    ...DEFAULT_PROJECT_STORAGE,
    ...patch,
    endpoint: patch.endpoint ?? "",
    region: patch.region ?? "auto",
    bucket: patch.bucket ?? "",
    publicBaseUrl: patch.publicBaseUrl ?? "",
    accessKeyId: patch.accessKeyId ?? "",
    secretAccessKey: patch.secretAccessKey ?? ""
  }),
  listObjects: async () => [],
  insertObject: async () => {},
  findObjectByPublicUrl: async () => null,
  markObjectPendingDeletion: async () => {},
  listPendingObjects: async () => [],
  deleteObject: async () => {}
});

const fakeProvider: StorageProviderAccess = {
  upload: async () => uploaded,
  delete: async () => {}
};

describe("storage core", () => {
  test("updates settings through fake ports without an auth registry", async () => {
    const applied: string[] = [];
    const service = new StorageService({
      store: fakeStore(),
      provider: fakeProvider,
      managedStorage: DEFAULT_PROJECT_STORAGE,
      applyRuntimeSettings: async (projectSlug, storage) => {
        applied.push(`${projectSlug}:${storage.provider}:${storage.enabled}`);
      }
    });

    await expect(
      service.updateSettings("demo", {
        provider: StorageProvider.None,
        enabled: false
      })
    ).resolves.toMatchObject({
      provider: StorageProvider.None,
      enabled: false,
      configured: false
    });
    expect(applied).toEqual(["demo:none:false"]);
  });

  test("cleans up uploaded media when metadata persistence fails", async () => {
    const calls: string[] = [];
    const failure = new Error("metadata failed");

    await expect(
      runUploadedMediaWorkflow({
        upload: async () => {
          calls.push("upload");
          return uploaded;
        },
        record: async () => {
          calls.push("record");
          throw failure;
        },
        persist: async () => {
          calls.push("persist");
          return "ok";
        },
        cleanup: async (object, context) => {
          calls.push(
            `cleanup:${object.objectKey}:${context.originalError === failure}:${context.recorded}`
          );
        }
      })
    ).rejects.toBe(failure);

    expect(calls).toEqual([
      "upload",
      "record",
      "cleanup:realms/demo/images/avatar.jpg:true:false"
    ]);
  });

  test("cleans up uploaded media when target persistence fails", async () => {
    const calls: string[] = [];
    const failure = new Error("target failed");

    await expect(
      runUploadedMediaWorkflow({
        upload: async () => {
          calls.push("upload");
          return uploaded;
        },
        record: async () => {
          calls.push("record");
        },
        persist: async () => {
          calls.push("persist");
          throw failure;
        },
        cleanup: async (object, context) => {
          calls.push(
            `cleanup:${object.objectKey}:${context.originalError === failure}:${context.recorded}`
          );
        }
      })
    ).rejects.toBe(failure);

    expect(calls).toEqual([
      "upload",
      "record",
      "persist",
      "cleanup:realms/demo/images/avatar.jpg:true:true"
    ]);
  });

  test("surfaces cleanup failure with the original error context", async () => {
    const originalError = new Error("target failed");
    const cleanupError = new StorageCleanupError("cleanup failed", {
      originalError,
      cleanupError: new Error("delete failed")
    });

    await expect(
      runUploadedMediaWorkflow({
        upload: async () => uploaded,
        record: async () => {},
        persist: async () => {
          throw originalError;
        },
        cleanup: async () => {
          throw cleanupError;
        }
      })
    ).rejects.toBe(cleanupError);
  });

  test("does not run compensation after target persistence succeeds", async () => {
    let cleaned = false;

    await expect(
      runUploadedMediaWorkflow({
        upload: async () => uploaded,
        record: async () => {},
        persist: async () => "saved",
        cleanup: async () => {
          cleaned = true;
        }
      })
    ).resolves.toEqual({ uploaded, result: "saved" });

    expect(cleaned).toBe(false);
  });
});
