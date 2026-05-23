import { ActionEmail, RESET_EXPIRY_HOURS } from "../templates";

export default function PasswordResetEmailPreview() {
  return (
    <ActionEmail
      projectName="OpenMarkers"
      eyebrow="Reset"
      headlineLead="Reset your"
      headlineEm="password."
      preview="Choose a new password for OpenMarkers."
      intro={`Use the link below to choose a new password. It expires in ${RESET_EXPIRY_HOURS} hour. If you did not request it, you can safely ignore this email.`}
      actionLabel="Reset password →"
      actionUrl="https://auth.nezdemkovski.cloud/openmarkers/api/auth/reset-password?token=preview"
      expiryHours={RESET_EXPIRY_HOURS}
    />
  );
}
