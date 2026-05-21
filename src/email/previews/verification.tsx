import { ActionEmail } from "../templates";

export default function VerificationEmailPreview() {
  return (
    <ActionEmail
      projectName="OpenMarkers"
      title="Verify your OpenMarkers account"
      preview="Confirm your email address for OpenMarkers."
      intro="Confirm this email address to finish setting up your account."
      actionLabel="Verify email"
      actionUrl="https://auth.nezdemkovski.cloud/openmarkers/api/auth/verify-email?token=preview"
    />
  );
}
