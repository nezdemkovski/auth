import { describe, expect, test } from "bun:test";

import {
  storageObjectResponse,
  storageSettingsResponse
} from "../translator";

describe("storage translator", () => {
  test("keeps public settings secret-free", () => {
    expect(
      storageSettingsResponse({
        provider: "s3",
        enabled: true,
        managed: false,
        endpoint: "http://127.0.0.1:9000",
        region: "auto",
        bucket: "auth-public",
        publicBaseUrl: "http://127.0.0.1:9000/auth-public",
        accessKeyIdConfigured: true,
        secretAccessKeyConfigured: true,
        configured: true
      })
    ).toEqual({
      provider: "s3",
      enabled: true,
      managed: false,
      endpoint: "http://127.0.0.1:9000",
      region: "auto",
      bucket: "auth-public",
      publicBaseUrl: "http://127.0.0.1:9000/auth-public",
      accessKeyIdConfigured: true,
      secretAccessKeyConfigured: true,
      configured: true
    });
  });

  test("preserves object explorer metadata", () => {
    expect(
      storageObjectResponse({
        id: "object-id",
        purpose: "project_icon",
        folder: "images",
        bucket: "auth-public",
        objectKey: "realms/testing/images/avatar.jpg",
        publicUrl: "https://cdn.example/realms/testing/images/avatar.jpg",
        originalFileName: "avatar.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        checksumSha256: "checksum",
        ownerUserId: "user-id",
        createdAt: "2026-05-25T10:00:00.000Z"
      })
    ).toMatchObject({
      folder: "images",
      originalFileName: "avatar.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024
    });
  });
});
