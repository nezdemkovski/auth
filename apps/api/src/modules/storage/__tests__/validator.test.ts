import { describe, expect, test } from "bun:test";

import { parseMediaUploadRequest } from "../validator";

describe("storage validator", () => {
  test("accepts only the expected media upload purpose and a file", async () => {
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    const form = new FormData();
    form.set("purpose", "user_avatar");
    form.set("file", file);

    await expect(parseMediaUploadRequest(form, "user_avatar")).resolves.toEqual({
      purpose: "user_avatar",
      file
    });
    await expect(parseMediaUploadRequest(form, "project_icon")).resolves.toBeNull();
  });

  test("rejects media upload forms without a file", async () => {
    const form = new FormData();
    form.set("purpose", "user_avatar");

    await expect(parseMediaUploadRequest(form, "user_avatar")).resolves.toBeNull();
  });
});
