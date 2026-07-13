# Auth client

Headless client for hosted realm login, session lifecycle, Telegram Mini App
sign-in, authenticated fetch, billing usage, and user avatar management.

```ts
import { createAuthClient, createKeyValueAuthStorage } from "@nezdemkovski/auth-client";

const auth = createAuthClient({
  baseUrl: "https://auth.example.com",
  realm: "demo",
  storage: createKeyValueAuthStorage(AsyncStorage)
});

const loginUrl = await auth.login.createUrl({
  redirectUri: "https://demo.example.com/auth/callback"
});
```

The SDK deliberately exposes only the short-lived access token. Realm session
credentials stay inside the client and must not be forwarded to product APIs.
