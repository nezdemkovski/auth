import {
  afterEach,
  describe,
  expect,
  test
} from "bun:test";

import { StorageProvider } from "../../../config/projects";
import {
  MediaUploadError,
  MediaUploadPurpose,
  uploadMedia
} from "../media";

const originalS3Client = Bun.S3Client;
const s3Writes: Array<{
  objectKey: string;
  bytes: Uint8Array;
  options: {
    type: string;
    acl: string;
  };
}> = [];

class FakeS3Client {
  async write(
    objectKey: string,
    bytes: Uint8Array,
    options: {
      type: string;
      acl: string;
    }
  ) {
    s3Writes.push({
      objectKey,
      bytes,
      options
    });
  }
}

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
  afterEach(() => {
    s3Writes.length = 0;
    Reflect.set(Bun, "S3Client", originalS3Client);
  });

  test("uploads supported images to realm-scoped object storage", async () => {
    Reflect.set(Bun, "S3Client", FakeS3Client);

    const result = await uploadMedia({
      storage: configuredStorage,
      realmSlug: "demo",
      purpose: MediaUploadPurpose.ProjectIcon,
      file: new File(["avatar-bytes"], "../avatar.png", { type: "image/png" }),
      ownerUserId: null
    });

    expect(result).toMatchObject({
      bucket: "auth-public",
      originalFileName: "..-avatar.png",
      mimeType: "image/png",
      sizeBytes: 12
    });
    expect(result.objectKey).toMatch(/^realms\/demo\/images\/[a-f0-9]{32}\.png$/);
    expect(result.publicUrl).toBe(
      `http://127.0.0.1:9000/auth-public/${result.objectKey}`
    );
    expect(result.checksumSha256).toHaveLength(64);
    expect(s3Writes).toHaveLength(1);
    expect(s3Writes[0]).toMatchObject({
      objectKey: result.objectKey,
      options: {
        type: "image/png",
        acl: "public-read"
      }
    });
    expect(new TextDecoder().decode(s3Writes[0]?.bytes)).toBe("avatar-bytes");
  });

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
