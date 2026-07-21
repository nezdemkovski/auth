import { telegram } from "@nezdemkovski/best-auth-telegram";
import type { ProjectAuthPluginContribution } from "@nezdemkovski/auth-better-auth-runtime";

import type { AuthProject } from "../../config/projects";
import type { TelegramMiniAppRuntimeSettings } from "./store";

export const TELEGRAM_MINI_APP_MAX_AUTH_AGE_SECONDS = 300;

export const createTelegramMiniAppAuthPluginContribution = (
  settingsByProject: ReadonlyMap<string, TelegramMiniAppRuntimeSettings>
): ProjectAuthPluginContribution<AuthProject> => {
  return (project) => {
    const settings = settingsByProject.get(project.slug);
    if (!settings) {
      return [];
    }

    return [
      telegram({
        botToken: settings.botToken,
        botUsername: settings.botUsername,
        loginWidget: false,
        maxAuthAge: TELEGRAM_MINI_APP_MAX_AUTH_AGE_SECONDS,
        miniApp: {
          enabled: true,
          validateInitData: true,
          allowAutoSignin: true,
          mapMiniAppDataToUser: (user) => ({
            name: user.last_name
              ? `${user.first_name} ${user.last_name}`
              : user.first_name,
            email: `${user.id}@telegram.invalid`,
            image: user.photo_url
          })
        }
      })
    ];
  };
};
