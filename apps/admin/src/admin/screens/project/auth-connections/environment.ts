import {
  AuthConnectionKind,
  type AuthConnectionCredential
} from "../../../types";

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
