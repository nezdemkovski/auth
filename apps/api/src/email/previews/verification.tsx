import { ActionEmail, VERIFICATION_EXPIRY_HOURS } from "../templates";

export default function VerificationEmailPreview() {
  return (
    <ActionEmail
      projectName="OpenMarkers"
      eyebrow="Verify"
      headlineLead="Verify your"
      headlineEm="account."
      preview="Confirm your email address for OpenMarkers."
      intro={`Confirm this email address to finish setting up your account. The link stays valid for ${VERIFICATION_EXPIRY_HOURS} hours.`}
      actionLabel="Verify email →"
      actionUrl="https://auth.nezdemkovski.cloud/api/openmarkers/auth/verify-email?token=preview"
      expiryHours={VERIFICATION_EXPIRY_HOURS}
    />
  );
}
