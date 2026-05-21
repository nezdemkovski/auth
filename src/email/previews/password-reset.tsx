import { ActionEmail } from "../templates";

export default function PasswordResetEmailPreview() {
  return (
    <ActionEmail
      projectName="OpenMarkers"
      title="Reset your OpenMarkers password"
      preview="Choose a new password for OpenMarkers."
      intro="Use this link to choose a new password. If you did not request it, you can ignore this email."
      actionLabel="Reset password"
      actionUrl="https://auth.nezdemkovski.cloud/openmarkers/api/auth/reset-password?token=preview"
    />
  );
}
