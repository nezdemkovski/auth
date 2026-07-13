import {
  cloneDefaultSocialProviders,
  normalizeRealmSlug,
  realmSchemaFromSlug,
  validateRealmSchema,
  validateRealmSlug
} from "./model";
import { normalizeRealmFeatures, type RealmSettingsCreate } from "./validator";

export const createRealmFromInput = (input: RealmSettingsCreate) => {
  const slug = normalizeRealmSlug(input.slug);
  validateRealmSlug(slug);

  const realm = {
    slug,
    name: input.name.trim(),
    schema: realmSchemaFromSlug(slug),
    description: input.description.trim(),
    iconUrl: input.iconUrl.trim(),
    appUrl: input.appUrl.trim(),
    trustedOrigins: input.trustedOrigins.map((origin) => origin.trim()).filter(Boolean),
    features: normalizeRealmFeatures(input.features),
    socialProviders: cloneDefaultSocialProviders()
  };

  validateRealmSchema(realm.schema);
  return realm;
};
