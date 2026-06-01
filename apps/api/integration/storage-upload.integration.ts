import { beforeEach, describe, expect, test } from "bun:test";

import { StorageProvider } from "../src/config/projects";
import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";
import { updateStorageSettings } from "../src/modules/storage/settings-store";
import { seedIntegrationRealm } from "./seed";
import {
  createIntegrationAdminSession,
  createIntegrationApp,
  integrationAdminDbOptions,
  integrationEncryptionSecret,
  integrationStorage,
  readIntegrationJson,
  resetAndBootstrapIntegrationDatabase,
  signUpIntegrationUser
} from "./setup";

describe("storage upload integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("uploads realm icons and user avatars through public HTTP routes", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-upload",
      schema: "integration_upload_auth",
      name: "Integration Upload"
    });
    await updateStorageSettings({
      ...integrationAdminDbOptions,
      project,
      encryptionSecret: integrationEncryptionSecret,
      managedStorage: integrationStorage,
      patch: {
        provider: StorageProvider.S3,
        enabled: true
      }
    });
    const { app, registry, close } = await createIntegrationApp({
      storage: integrationStorage
    });

    try {
      const admin = await createIntegrationAdminSession({
        app,
        registry,
        email: "upload-admin@integration.test"
      });
      const projectIcon = await app.request(
        `/admin/api/projects/${project.slug}/upload`,
        {
          method: "POST",
          headers: uploadHeaders({
            cookie: admin.cookie,
            origin: "http://127.0.0.1:3000"
          }),
          body: uploadForm("project_icon", "realm-icon.png")
        }
      );
      expect(projectIcon.status).toBe(200);
      expect(await readIntegrationJson(projectIcon)).toMatchObject({
        upload: {
          bucket: integrationStorage.bucket,
          originalFileName: "realm-icon.png",
          mimeType: "image/png"
        },
        project: {
          slug: project.slug
        }
      });

      const user = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "avatar-user@integration.test",
        password: "correct horse battery staple"
      });
      const avatar = await app.request(`/api/${project.slug}/upload`, {
        method: "POST",
        headers: uploadHeaders({
          cookie: user.cookie,
          origin: project.appUrl
        }),
        body: uploadForm("user_avatar", "avatar.png")
      });
      expect(avatar.status).toBe(200);
      expect(await readIntegrationJson(avatar)).toMatchObject({
        upload: {
          bucket: integrationStorage.bucket,
          originalFileName: "avatar.png",
          mimeType: "image/png"
        },
        user: {
          id: user.userId,
          image: expect.stringContaining(
            `/realms/${project.slug}/images/${user.userId}/`
          )
        }
      });

      const objects = await app.request(
        `/admin/api/projects/${project.slug}/storage/objects`,
        {
          headers: {
            Cookie: admin.cookie,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(objects.status).toBe(200);
      expect(await readIntegrationJson(objects)).toMatchObject({
        objects: expect.arrayContaining([
          expect.objectContaining({
            originalFileName: "realm-icon.png",
            mimeType: "image/png"
          }),
          expect.objectContaining({
            originalFileName: "avatar.png",
            ownerUserId: user.userId,
            mimeType: "image/png"
          })
        ])
      });
    } finally {
      await close();
    }
  });

  test("rejects upload requests without a content length before parsing multipart bodies", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-upload-reject",
      schema: "integration_upload_reject_auth",
      name: "Integration Upload Reject"
    });
    const { app, close } = await createIntegrationApp();

    try {
      const user = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "upload-reject@integration.test",
        password: "correct horse battery staple"
      });
      const response = await app.request(`/api/${project.slug}/upload`, {
        method: "POST",
        headers: {
          Cookie: user.cookie,
          Origin: project.appUrl,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        },
        body: uploadForm("user_avatar", "avatar.png")
      });

      expect(response.status).toBe(411);
      expect(await readIntegrationJson(response)).toMatchObject({
        error: "length_required"
      });
    } finally {
      await close();
    }
  });
});

const uploadHeaders = (input: { cookie: string; origin: string }) => {
  return {
    Cookie: input.cookie,
    Origin: input.origin,
    "Content-Length": "512",
    [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
  };
};

const uploadForm = (purpose: string, fileName: string) => {
  const form = new FormData();
  form.set("purpose", purpose);
  form.set(
    "file",
    new File([pngBytes()], fileName, {
      type: "image/png"
    })
  );

  return form;
};

const pngBytes = () => {
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
    0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84,
    120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 42, 188, 0, 0, 0, 0, 73, 69,
    78, 68, 174, 66, 96, 130
  ]);
};
