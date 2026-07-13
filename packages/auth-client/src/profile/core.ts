import { MediaUploadPurpose, parseUserAvatarResponse } from "@nezdemkovski/auth-contracts";
import { AuthClientError, AuthClientErrorCode } from "../errors";
import type { AuthSessionService } from "../session/core";
import type { AuthTransport } from "../transport/core";

export type UploadAvatarOptions = {
  file: Blob;
  fileName?: string;
};

export class AuthProfileService {
  constructor(
    private readonly transport: AuthTransport,
    private readonly session: AuthSessionService
  ) {}

  async uploadAvatar(options: UploadAvatarOptions) {
    const sessionToken = await this.session.requireSessionToken();
    const form = new FormData();
    form.append("purpose", MediaUploadPurpose.UserAvatar);
    form.append("file", options.file, options.fileName ?? "avatar.jpg");
    const body = await this.transport.requestJson(this.transport.realmPath("/upload"), {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: form
    });
    const response = parseUserAvatarResponse(body);
    if (!response?.image) {
      throw new AuthClientError(AuthClientErrorCode.InvalidResponse, "Auth service returned no avatar URL");
    }
    await this.session.getAccessToken(true);
    return response.image;
  }

  async deleteAvatar() {
    const sessionToken = await this.session.requireSessionToken();
    await this.transport.requestJson(this.transport.realmPath("/upload"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    await this.session.getAccessToken(true);
  }
}
