export type TelegramMiniAppConnectionInput = {
  botUsername: string;
  botToken: string;
};

export const parseTelegramMiniAppConnection = (
  value: Record<string, unknown>
): TelegramMiniAppConnectionInput | null => {
  if (
    Object.keys(value).some(
      (key) => key !== "botUsername" && key !== "botToken"
    ) ||
    typeof value.botUsername !== "string" ||
    typeof value.botToken !== "string"
  ) {
    return null;
  }

  const botUsername = value.botUsername.trim().replace(/^@/, "");
  const botToken = value.botToken.trim();
  if (
    !/^[A-Za-z0-9_]{5,32}$/.test(botUsername) ||
    !botUsername.toLowerCase().endsWith("bot") ||
    botToken.length < 20 ||
    botToken.length > 256 ||
    !botToken.includes(":")
  ) {
    return null;
  }

  return { botUsername, botToken };
};
