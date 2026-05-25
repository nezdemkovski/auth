import { describe, expect, test } from "bun:test";

import { StorageProvider } from "../../../config/projects";
import {
  MediaUploadError,
  MediaUploadPurpose,
  uploadMedia
} from "../media";

const configuredStorage = {
  provider: StorageProvider.S3,
  enabled: true,
  managed: false,
  endpoint: "http://127.0.0.1:9000",
  region: "auto",
  bucket: "auth-public",
  publicBaseUrl: "http://127.0.0.1:9000/auth-public",
  accessKeyId: "access",
  secretAccessKey: "secret"
};

describe("storage media upload", () => {
  test("rejects uploads when S3 storage is not configured", async () => {
    await expect(
      uploadMedia({
        storage: {
          ...configuredStorage,
          enabled: false
        },
        realmSlug: "demo",
        purpose: MediaUploadPurpose.ProjectIcon,
        file: new File(["avatar"], "avatar.png", { type: "image/png" }),
        ownerUserId: null
      })
    ).rejects.toMatchObject({
      code: "storage_not_configured"
    });
  });

  test("rejects non-image files before touching object storage", async () => {
    await expect(
      uploadMedia({
        storage: configuredStorage,
        realmSlug: "demo",
        purpose: MediaUploadPurpose.ProjectIcon,
        file: new File(["hello"], "notes.txt", { type: "text/plain" }),
        ownerUserId: null
      })
    ).rejects.toMatchObject({
      code: "unsupported_file_type"
    });
  });

  test("requires an owner for user avatar object keys", async () => {
    await expect(
      uploadMedia({
        storage: configuredStorage,
        realmSlug: "demo",
        purpose: MediaUploadPurpose.UserAvatar,
        file: new File(["avatar"], "avatar.png", { type: "image/png" }),
        ownerUserId: null
      })
    ).rejects.toBeInstanceOf(MediaUploadError);
  });
});
