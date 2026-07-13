import { afterEach, describe, expect, test } from "bun:test";

import {
  MediaUploadPurpose,
  StorageProvider
} from "../model";
import { createS3StorageProvider, MediaUploadError } from "../s3";

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
    s3Writes.push({ objectKey, bytes, options });
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

describe("S3 storage provider", () => {
  afterEach(() => {
    s3Writes.length = 0;
    Reflect.set(Bun, "S3Client", originalS3Client);
  });

  test("uploads supported images to realm-scoped object keys", async () => {
    Reflect.set(Bun, "S3Client", FakeS3Client);

    const result = await createS3StorageProvider().upload({
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
  });

  test("rejects disabled storage and active SVG content", async () => {
    const provider = createS3StorageProvider();

    await expect(
      provider.upload({
        storage: { ...configuredStorage, enabled: false },
        realmSlug: "demo",
        purpose: MediaUploadPurpose.ProjectIcon,
        file: new File(["avatar"], "avatar.png", { type: "image/png" }),
        ownerUserId: null
      })
    ).rejects.toMatchObject({ code: "storage_not_configured" });

    await expect(
      provider.upload({
        storage: configuredStorage,
        realmSlug: "demo",
        purpose: MediaUploadPurpose.ProjectIcon,
        file: new File(["<svg><script>x</script></svg>"], "avatar.svg", {
          type: "image/svg+xml"
        }),
        ownerUserId: null
      })
    ).rejects.toMatchObject({ code: "unsupported_file_type" });
    expect(s3Writes).toEqual([]);
  });

  test("requires an owner for user avatar object keys", async () => {
    await expect(
      createS3StorageProvider().upload({
        storage: configuredStorage,
        realmSlug: "demo",
        purpose: MediaUploadPurpose.UserAvatar,
        file: new File(["avatar"], "avatar.png", { type: "image/png" }),
        ownerUserId: null
      })
    ).rejects.toBeInstanceOf(MediaUploadError);
  });
});
