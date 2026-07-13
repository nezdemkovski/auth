# Auth contracts

Framework-independent business contracts for platform-owned resources such as
billing and media. The parsers accept `unknown` so consumers do not have to
trust remote JSON.

This package intentionally contains no Better Auth session, OAuth token, user,
or error response models. Consumers use Better Auth's inferred types for
protocol data.

Import only the capability contract that the product actually consumes:

```ts
import {
  parseBillingUsageSummaryResponse,
  type BillingUsageSummary
} from "@nezdemkovski/auth-contracts/billing";
import {
  MediaUploadPurpose,
  parseUserAvatarResponse
} from "@nezdemkovski/auth-contracts/storage";
```

The package intentionally has no root export. Adding another capability is an
explicit public API decision instead of silently expanding one shared surface.
