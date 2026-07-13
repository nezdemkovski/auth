import {
  AuthConnectionKind,
  type AuthConnectionCredential,
  type RealmSetup
} from "../../../types";

export const buildRealmSetupEnvironment = (
  setup: Pick<RealmSetup, "issuer" | "clientId" | "clientSecret">
) =>
  [
    `AUTH_ISSUER=${setup.issuer}`,
    `AUTH_CLIENT_ID=${setup.clientId}`,
    `AUTH_CLIENT_SECRET=${setup.clientSecret}`
  ].join("\n");

export const buildAuthConnectionEnvironment = (input: {
  issuer: string;
  kind: AuthConnectionKind;
  credential: AuthConnectionCredential;
}) => {
  const prefix =
    input.kind === AuthConnectionKind.Service ? "AUTH_SERVICE" : "AUTH";
  const lines = [
    `AUTH_ISSUER=${input.issuer}`,
    `${prefix}_CLIENT_ID=${input.credential.clientId}`
  ];
  if (input.credential.clientSecret) {
    lines.push(`${prefix}_CLIENT_SECRET=${input.credential.clientSecret}`);
  }
  return lines.join("\n");
};
