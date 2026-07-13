import { describe, expect, test } from "bun:test";

import { OAuthResource, OAuthScope } from "../../../config/oauth-resources";
import { ErrorCode } from "../../../runtime/error-codes";
import { OAuthResourceError, OAuthResourceErrorKind } from "../core";
import { oauthResourceFailureResponse } from "../translator";

const responseOptions = {
  publicBaseUrl: "https://auth.example.com",
  projectSlug: "demo",
  resource: OAuthResource.Storage,
  scopes: [OAuthScope.StorageAvatarWrite]
};

describe("OAuth resource response translator", () => {
  test("challenges invalid tokens with the exact protected resource metadata", () => {
    expect(
      oauthResourceFailureResponse(
        new OAuthResourceError(OAuthResourceErrorKind.InvalidToken),
        responseOptions
      )
    ).toEqual({
      error: ErrorCode.Unauthorized,
      status: 401,
      wwwAuthenticate:
        "Bearer resource_metadata=\"https://auth.example.com/.well-known/oauth-protected-resource/api/demo/upload\", error=\"invalid_token\""
    });
  });

  test("returns the required operation scope without translating unknown errors", () => {
    expect(
      oauthResourceFailureResponse(
        new OAuthResourceError(OAuthResourceErrorKind.InsufficientScope),
        responseOptions
      )
    ).toMatchObject({
      error: ErrorCode.InsufficientScope,
      status: 403,
      wwwAuthenticate: expect.stringContaining(
        "error=\"insufficient_scope\", scope=\"storage:avatar:write\""
      )
    });
    expect(
      oauthResourceFailureResponse(new Error("unexpected"), responseOptions)
    ).toBeNull();
  });
});
