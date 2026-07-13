import { describe, expect, test } from "bun:test";

import { MediaUploadPurpose } from "../model";
import {
  parseMediaUploadRequest,
  storageEndpointProtocolIsAllowed
} from "../validator";

describe("storage validator", () => {
  test("accepts only the expected media upload purpose and a file", async () => {
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    const form = new FormData();
    form.set("purpose", MediaUploadPurpose.UserAvatar);
    form.set("file", file);

    await expect(
      parseMediaUploadRequest(form, MediaUploadPurpose.UserAvatar)
    ).resolves.toEqual({
      purpose: MediaUploadPurpose.UserAvatar,
      file
    });
    await expect(
      parseMediaUploadRequest(form, MediaUploadPurpose.ProjectIcon)
    ).resolves.toBeNull();
  });

  test("rejects media upload forms without a file", async () => {
    const form = new FormData();
    form.set("purpose", MediaUploadPurpose.UserAvatar);

    await expect(
      parseMediaUploadRequest(form, MediaUploadPurpose.UserAvatar)
    ).resolves.toBeNull();
  });

  test("requires HTTPS for user-configured storage endpoints", () => {
    expect(
      storageEndpointProtocolIsAllowed(new URL("https://s3.example.com"), {
        allowHttpEndpoint: false
      })
    ).toBe(true);
    expect(
      storageEndpointProtocolIsAllowed(new URL("http://127.0.0.1:9000"), {
        allowHttpEndpoint: false
      })
    ).toBe(false);
    expect(
      storageEndpointProtocolIsAllowed(new URL("http://rustfs:9000"), {
        allowHttpEndpoint: true
      })
    ).toBe(true);
  });
});
