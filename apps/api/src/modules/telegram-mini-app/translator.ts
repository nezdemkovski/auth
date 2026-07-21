import type { TelegramMiniAppConnection } from "./store";

export const telegramMiniAppConnectionResponse = (
  settings: TelegramMiniAppConnection | null
) => ({
  enabled: settings !== null,
  botUsername: settings?.botUsername ?? null
});
