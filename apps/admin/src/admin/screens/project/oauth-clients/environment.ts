import {
  OAuthClientProfile,
  type OAuthClientCredential
} from "../../../types";

export const buildOAuthClientEnvironment = (input: {
  issuer: string;
  profile: OAuthClientProfile;
  credential: OAuthClientCredential;
}) => {
  const prefix =
    input.profile === OAuthClientProfile.Service ? "AUTH_SERVICE" : "AUTH";
  const lines = [
    `AUTH_ISSUER=${input.issuer}`,
    `${prefix}_CLIENT_ID=${input.credential.clientId}`
  ];
  if (input.credential.clientSecret) {
    lines.push(`${prefix}_CLIENT_SECRET=${input.credential.clientSecret}`);
  }
  return lines.join("\n");
};
