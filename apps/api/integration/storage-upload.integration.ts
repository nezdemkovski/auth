import { beforeEach, describe, expect, test } from "bun:test";

import {
  OAuthResource,
  OAuthScope,
  oauthResourceIdentifier,
  oauthResourceMetadataUrl
} from "../src/config/oauth-resources";
import {
  StorageProvider,
  updateStorageSettings
} from "@nezdemkovski/auth-storage";
import { DIRECT_CLIENT_IP_HEADER } from "../src/http/security";
import { seedIntegrationRealm } from "./seed";
import {
  createIntegrationAdminSession,
  createIntegrationApp,
  createIntegrationUserResourceToken,
  integrationAdminDbOptions,
  integrationEncryptionSecret,
  integrationPublicBaseUrl,
  integrationStorage,
  installIntegrationAppFetch,
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
      name: "Integration Upload",
      oauthProvider: { enabled: true }
    });
    await updateStorageSettings({
      ...integrationAdminDbOptions,
      projectSlug: project.slug,
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
    const restoreFetch = installIntegrationAppFetch(app);

    try {
      const admin = await createIntegrationAdminSession({
        app,
        registry,
        email: "upload-admin@integration.test"
      });
      const projectIcon = await app.request(`/admin/api/projects/${project.slug}/upload`, {
        method: "POST",
        headers: adminUploadHeaders({
          cookie: admin.cookie,
          origin: "http://127.0.0.1:3000"
        }),
        body: uploadForm("project_icon", "realm-icon.png")
      });
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
      const storageResource = oauthResourceIdentifier(
        integrationPublicBaseUrl,
        project.slug,
        OAuthResource.Storage
      );
      const resourceToken = await createIntegrationUserResourceToken({
        app,
        registry,
        projectSlug: project.slug,
        userCookie: user.cookie,
        resource: storageResource,
        scopes: [
          OAuthScope.StorageAvatarWrite,
          OAuthScope.StorageAvatarDelete
        ]
      });
      const avatar = await app.request(`/api/${project.slug}/upload`, {
        method: "POST",
        headers: resourceUploadHeaders({
          accessToken: resourceToken,
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
          image: expect.stringContaining(`/realms/${project.slug}/images/${user.userId}/`)
        }
      });

      const replacementIcon = await app.request(`/admin/api/projects/${project.slug}/upload`, {
        method: "POST",
        headers: adminUploadHeaders({
          cookie: admin.cookie,
          origin: "http://127.0.0.1:3000"
        }),
        body: uploadForm("project_icon", "replacement-icon.png")
      });
      const replacementAvatar = await app.request(`/api/${project.slug}/upload`, {
        method: "POST",
        headers: resourceUploadHeaders({
          accessToken: resourceToken,
          origin: project.appUrl
        }),
        body: uploadForm("user_avatar", "replacement-avatar.png")
      });
      expect(replacementIcon.status).toBe(200);
      expect(replacementAvatar.status).toBe(200);

      const deletedAvatar = await app.request(`/api/${project.slug}/upload`, {
        method: "DELETE",
        headers: resourceUploadHeaders({
          accessToken: resourceToken,
          origin: project.appUrl
        })
      });
      expect(deletedAvatar.status).toBe(200);
      expect(await readIntegrationJson(deletedAvatar)).toMatchObject({
        user: { id: user.userId, image: null }
      });

      const objects = await app.request(`/admin/api/projects/${project.slug}/storage/objects`, {
        headers: {
          Cookie: admin.cookie,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      expect(objects.status).toBe(200);
      const objectsBody = await readIntegrationJson(objects);
      expect(objectsBody).toMatchObject({
        objects: expect.arrayContaining([
          expect.objectContaining({
            originalFileName: "replacement-icon.png",
            mimeType: "image/png"
          })
        ])
      });
      expect(JSON.stringify(objectsBody)).not.toContain("realm-icon.png");
      expect(JSON.stringify(objectsBody)).not.toContain('"avatar.png"');
      expect(JSON.stringify(objectsBody)).not.toContain("replacement-avatar.png");
    } finally {
      restoreFetch();
      await close();
    }
  });

  test("rejects upload requests without a content length before parsing multipart bodies", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-upload-reject",
      schema: "integration_upload_reject_auth",
      name: "Integration Upload Reject",
      oauthProvider: { enabled: true }
    });
    const { app, registry, close } = await createIntegrationApp();
    const restoreFetch = installIntegrationAppFetch(app);

    try {
      const user = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "upload-reject@integration.test",
        password: "correct horse battery staple"
      });
      const resourceToken = await createIntegrationUserResourceToken({
        app,
        registry,
        projectSlug: project.slug,
        userCookie: user.cookie,
        resource: oauthResourceIdentifier(
          integrationPublicBaseUrl,
          project.slug,
          OAuthResource.Storage
        ),
        scopes: [OAuthScope.StorageAvatarWrite]
      });
      const response = await app.request(`/api/${project.slug}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resourceToken}`,
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
      restoreFetch();
      await close();
    }
  });

  test("requires an audience-bound token with the operation scope", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-resource",
      schema: "integration_resource_auth",
      name: "Integration Resource",
      oauthProvider: { enabled: true }
    });
    const otherProject = await seedIntegrationRealm({
      slug: "integration-other-resource",
      schema: "integration_other_resource_auth",
      name: "Integration Other Resource",
      oauthProvider: { enabled: true }
    });
    const { app, registry, close } = await createIntegrationApp();
    const restoreFetch = installIntegrationAppFetch(app);

    try {
      const user = await signUpIntegrationUser({
        app,
        projectSlug: project.slug,
        origin: project.appUrl,
        email: "resource-user@integration.test",
        password: "correct horse battery staple"
      });
      const otherUser = await signUpIntegrationUser({
        app,
        projectSlug: otherProject.slug,
        origin: otherProject.appUrl,
        email: "other-resource-user@integration.test",
        password: "correct horse battery staple"
      });
      const resource = oauthResourceIdentifier(
        integrationPublicBaseUrl,
        project.slug,
        OAuthResource.Storage
      );
      const metadataUrl = oauthResourceMetadataUrl(
        integrationPublicBaseUrl,
        project.slug,
        OAuthResource.Storage
      );

      const metadata = await app.request(metadataUrl);
      expect(metadata.status).toBe(200);
      expect(await readIntegrationJson(metadata)).toMatchObject({
        resource,
        authorization_servers: [
          `${integrationPublicBaseUrl}/api/${project.slug}`
        ],
        scopes_supported: [
          OAuthScope.StorageAvatarWrite,
          OAuthScope.StorageAvatarDelete
        ]
      });

      const sessionOnly = await app.request(`/api/${project.slug}/upload`, {
        method: "POST",
        headers: {
          Cookie: user.cookie,
          Origin: project.appUrl,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      expect(sessionOnly.status).toBe(401);
      expect(sessionOnly.headers.get("www-authenticate")).toContain(
        `resource_metadata="${metadataUrl}"`
      );

      const deleteOnlyToken = await createIntegrationUserResourceToken({
        app,
        registry,
        projectSlug: project.slug,
        userCookie: user.cookie,
        resource,
        scopes: [OAuthScope.StorageAvatarDelete]
      });
      const insufficientScope = await app.request(
        `/api/${project.slug}/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${deleteOnlyToken}`,
            Origin: project.appUrl,
            [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
          }
        }
      );
      expect(insufficientScope.status).toBe(403);
      expect(insufficientScope.headers.get("www-authenticate")).toContain(
        "error=\"insufficient_scope\""
      );

      const wrongAudienceToken = await createIntegrationUserResourceToken({
        app,
        registry,
        projectSlug: otherProject.slug,
        userCookie: otherUser.cookie,
        resource: oauthResourceIdentifier(
          integrationPublicBaseUrl,
          otherProject.slug,
          OAuthResource.Storage
        ),
        scopes: [OAuthScope.StorageAvatarWrite]
      });
      const wrongAudience = await app.request(`/api/${project.slug}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${wrongAudienceToken}`,
          Origin: project.appUrl,
          [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
        }
      });
      expect(wrongAudience.status).toBe(401);
      expect(wrongAudience.headers.get("www-authenticate")).toContain(
        "error=\"invalid_token\""
      );
    } finally {
      restoreFetch();
      await close();
    }
  });
});

const adminUploadHeaders = (input: { cookie: string; origin: string }) => {
  return {
    Cookie: input.cookie,
    Origin: input.origin,
    "Content-Length": "512",
    [DIRECT_CLIENT_IP_HEADER]: "127.0.0.1"
  };
};

const resourceUploadHeaders = (input: {
  accessToken: string;
  origin: string;
}) => {
  return {
    Authorization: `Bearer ${input.accessToken}`,
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
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10,
    42, 188, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
  ]);
};
