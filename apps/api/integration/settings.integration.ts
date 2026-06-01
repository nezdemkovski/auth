import { beforeEach, describe, expect, test } from "bun:test";

import {
  ObservabilityProvider,
  StorageProvider
} from "../src/config/projects";
import { SocialProvider } from "../src/config/social-providers";
import { EmailProvider } from "../src/email/sender";
import {
  readDeliverySettings,
  updateDeliverySettings
} from "../src/modules/delivery/store";
import {
  readObservabilitySettings,
  readObservabilitySettingsState,
  updateObservabilitySettings
} from "../src/modules/observability/store";
import {
  markSocialProviderVerified,
  readProjectSocialProviders,
  updateProjectSocialProvider
} from "../src/modules/projects/social-provider-store";
import {
  deleteProjectSettings,
  loadEffectiveProjects,
  projectSettingsExists,
  updateProjectIconUrl,
  updateProjectSettings
} from "../src/modules/projects/store";
import {
  loadProjectStorageSettings,
  readPublicStorageSettings,
  updateStorageSettings
} from "../src/modules/storage/settings-store";
import {
  insertStorageObject,
  listStorageObjects
} from "../src/modules/storage/objects-store";
import { MediaUploadPurpose } from "../src/modules/storage/media";
import { seedIntegrationRealm } from "./seed";
import {
  createIntegrationApp,
  integrationAdminDbOptions,
  integrationAdminProject,
  integrationEncryptionSecret,
  integrationPublicBaseUrl,
  resetAndBootstrapIntegrationDatabase
} from "./setup";

describe("settings integration", () => {
  beforeEach(async () => {
    await resetAndBootstrapIntegrationDatabase();
  });

  test("persists delivery and observability settings without losing existing secrets", async () => {
    await updateDeliverySettings({
      ...integrationAdminDbOptions,
      encryptionSecret: integrationEncryptionSecret,
      patch: {
        provider: EmailProvider.Resend,
        from: "Auth <auth@example.test>",
        cloudflareAccountId: "",
        resendApiKey: "resend-integration-key"
      }
    });
    await updateDeliverySettings({
      ...integrationAdminDbOptions,
      encryptionSecret: integrationEncryptionSecret,
      patch: {
        provider: EmailProvider.Resend,
        from: "Auth Team <auth@example.test>",
        cloudflareAccountId: ""
      }
    });

    await expect(
      readDeliverySettings({
        ...integrationAdminDbOptions,
        encryptionSecret: integrationEncryptionSecret
      })
    ).resolves.toMatchObject({
      provider: EmailProvider.Resend,
      from: "Auth Team <auth@example.test>",
      resendApiKey: "resend-integration-key",
      resendApiKeyConfigured: true
    });

    await updateObservabilitySettings({
      ...integrationAdminDbOptions,
      encryptionSecret: integrationEncryptionSecret,
      patch: {
        provider: ObservabilityProvider.Sentry,
        enabled: true,
        dsn: "https://public@example.ingest.sentry.io/1",
        environment: "integration"
      }
    });
    await updateObservabilitySettings({
      ...integrationAdminDbOptions,
      encryptionSecret: integrationEncryptionSecret,
      patch: {
        provider: ObservabilityProvider.Sentry,
        enabled: true,
        environment: "integration-next"
      }
    });

    await expect(
      readObservabilitySettings({
        ...integrationAdminDbOptions,
        encryptionSecret: integrationEncryptionSecret
      })
    ).resolves.toEqual({
      provider: ObservabilityProvider.Sentry,
      enabled: true,
      dsn: "https://public@example.ingest.sentry.io/1",
      environment: "integration-next"
    });
    await expect(
      readObservabilitySettingsState(integrationAdminDbOptions)
    ).resolves.toMatchObject({
      dsnConfigured: true,
      environment: "integration-next"
    });
  });

  test("persists realm storage settings and stored object metadata", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-settings",
      schema: "integration_settings_auth",
      name: "Integration Settings"
    });

    await updateStorageSettings({
      ...integrationAdminDbOptions,
      project,
      encryptionSecret: integrationEncryptionSecret,
      managedStorage: project.storage,
      patch: {
        provider: StorageProvider.S3,
        enabled: true,
        endpoint: "https://s3.example.test",
        region: "auto",
        bucket: "auth-integration",
        publicBaseUrl: "https://cdn.example.test/auth-integration/",
        accessKeyId: "integration-access-key",
        secretAccessKey: "integration-secret-key"
      }
    });
    await updateStorageSettings({
      ...integrationAdminDbOptions,
      project,
      encryptionSecret: integrationEncryptionSecret,
      managedStorage: project.storage,
      patch: {
        provider: StorageProvider.S3,
        enabled: true,
        endpoint: "https://s3.example.test",
        region: "auto",
        bucket: "auth-integration",
        publicBaseUrl: "https://cdn.example.test/auth-integration"
      }
    });

    await expect(
      loadProjectStorageSettings({
        ...integrationAdminDbOptions,
        project,
        encryptionSecret: integrationEncryptionSecret,
        managedStorage: project.storage
      })
    ).resolves.toMatchObject({
      provider: StorageProvider.S3,
      enabled: true,
      publicBaseUrl: "https://cdn.example.test/auth-integration",
      accessKeyId: "integration-access-key",
      secretAccessKey: "integration-secret-key"
    });
    await expect(
      readPublicStorageSettings({
        ...integrationAdminDbOptions,
        project,
        managedStorage: project.storage
      })
    ).resolves.toMatchObject({
      configured: true,
      accessKeyIdConfigured: true,
      secretAccessKeyConfigured: true
    });

    const { registry, close } = await createIntegrationApp();
    try {
      const registered = registry.get(project.slug);
      if (!registered) {
        throw new Error("Expected integration realm to be registered");
      }

      await insertStorageObject(registered.projectDb.pool, {
        purpose: MediaUploadPurpose.ProjectIcon,
        bucket: "auth-integration",
        objectKey: "realms/integration-settings/images/image.jpg",
        publicUrl: "https://cdn.example.test/auth-integration/image.jpg",
        originalFileName: "profile.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1234,
        checksumSha256: "abc123",
        ownerUserId: null
      });

      await expect(listStorageObjects(registered.projectDb.pool)).resolves.toEqual([
        expect.objectContaining({
          purpose: MediaUploadPurpose.ProjectIcon,
          originalFileName: "profile.jpg",
          objectKey: "realms/integration-settings/images/image.jpg"
        })
      ]);
    } finally {
      await close();
    }
  });

  test("updates and deletes realm metadata without affecting the built-in admin realm", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-project",
      schema: "integration_project_auth",
      name: "Integration Project"
    });

    await expect(
      projectSettingsExists({
        ...integrationAdminDbOptions,
        slug: project.slug,
        schema: project.schema
      })
    ).resolves.toBe(true);

    await expect(
      updateProjectSettings({
        ...integrationAdminDbOptions,
        slug: project.slug,
        patch: {
          name: "Renamed Integration Project",
          description: "Updated by integration test",
          iconUrl: "https://cdn.example.test/icon.png",
          appUrl: "https://renamed.integration.test",
          trustedOrigins: ["https://renamed.integration.test"],
          features: project.features
        }
      })
    ).resolves.toMatchObject({
      slug: project.slug,
      name: "Renamed Integration Project",
      appUrl: "https://renamed.integration.test",
      trustedOrigins: ["https://renamed.integration.test"]
    });
    await expect(
      updateProjectIconUrl({
        ...integrationAdminDbOptions,
        slug: project.slug,
        iconUrl: "https://cdn.example.test/new-icon.png"
      })
    ).resolves.toMatchObject({
      iconUrl: "https://cdn.example.test/new-icon.png"
    });

    const beforeDelete = await loadEffectiveProjects({
      ...integrationAdminDbOptions,
      encryptionSecret: integrationEncryptionSecret,
      managedStorage: project.storage
    });
    expect(beforeDelete.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: project.slug,
          name: "Renamed Integration Project",
          iconUrl: "https://cdn.example.test/new-icon.png"
        })
      ])
    );

    await deleteProjectSettings({
      ...integrationAdminDbOptions,
      slug: project.slug
    });
    await deleteProjectSettings({
      ...integrationAdminDbOptions,
      slug: integrationAdminProject.slug
    });

    const afterDelete = await loadEffectiveProjects({
      ...integrationAdminDbOptions,
      encryptionSecret: integrationEncryptionSecret,
      managedStorage: project.storage
    });
    expect(afterDelete.adminProject.slug).toBe(integrationAdminProject.slug);
    expect(afterDelete.projects.some((item) => item.slug === project.slug)).toBe(false);
  });

  test("keeps social provider settings per realm and clears verification after re-enable", async () => {
    const project = await seedIntegrationRealm({
      slug: "integration-social",
      schema: "integration_social_auth",
      name: "Integration Social"
    });

    await updateProjectSocialProvider({
      ...integrationAdminDbOptions,
      project,
      provider: SocialProvider.GitHub,
      encryptionSecret: integrationEncryptionSecret,
      patch: {
        enabled: true,
        clientId: "github-client",
        clientSecret: "github-secret"
      }
    });
    await markSocialProviderVerified({
      ...integrationAdminDbOptions,
      project,
      provider: SocialProvider.GitHub
    });

    const verified = await readProjectSocialProviders({
      ...integrationAdminDbOptions,
      project,
      publicBaseUrl: integrationPublicBaseUrl
    });
    expect(verified.find((provider) => provider.provider === SocialProvider.GitHub))
      .toMatchObject({
        enabled: true,
        clientId: "github-client",
        configured: true,
        callbackUrl: `${integrationPublicBaseUrl}/api/${project.slug}/auth/callback/github`
      });
    expect(
      verified.find((provider) => provider.provider === SocialProvider.GitHub)?.verifiedAt
    ).toEqual(expect.any(String));

    await updateProjectSocialProvider({
      ...integrationAdminDbOptions,
      project,
      provider: SocialProvider.GitHub,
      encryptionSecret: integrationEncryptionSecret,
      patch: {
        enabled: false,
        clientId: "github-client"
      }
    });
    await updateProjectSocialProvider({
      ...integrationAdminDbOptions,
      project,
      provider: SocialProvider.GitHub,
      encryptionSecret: integrationEncryptionSecret,
      patch: {
        enabled: true,
        clientId: "github-client"
      }
    });

    await expect(
      readProjectSocialProviders({
        ...integrationAdminDbOptions,
        project,
        publicBaseUrl: integrationPublicBaseUrl
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: SocialProvider.GitHub,
          enabled: true,
          configured: true,
          verifiedAt: null
        })
      ])
    );
  });
});
