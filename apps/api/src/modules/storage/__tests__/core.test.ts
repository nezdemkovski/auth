import { describe, expect, test } from "bun:test";

import {
  runUploadedMediaWorkflow,
  StorageCleanupError
} from "../core";
import type { MediaUploadResult } from "../media";

const uploaded: MediaUploadResult = {
  bucket: "auth-public",
  objectKey: "realms/testing/images/avatar.jpg",
  publicUrl: "https://cdn.example/realms/testing/images/avatar.jpg",
  originalFileName: "avatar.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  checksumSha256: "checksum"
};

describe("storage core", () => {
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
      "cleanup:realms/testing/images/avatar.jpg:true:false"
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
      "cleanup:realms/testing/images/avatar.jpg:true:true"
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
