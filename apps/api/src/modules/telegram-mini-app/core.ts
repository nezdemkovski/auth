import type { AuthProject } from "../../config/projects";
import type {
  TelegramMiniAppRuntimeSettings,
  TelegramMiniAppStore
} from "./store";
import type { TelegramMiniAppConnectionInput } from "./validator";

type TelegramMiniAppServiceOptions = {
  store: TelegramMiniAppStore;
  runtimeSettings: Map<string, TelegramMiniAppRuntimeSettings>;
  applyRuntimeSettings(project: AuthProject): Promise<void>;
};

export class TelegramMiniAppService {
  constructor(private readonly options: TelegramMiniAppServiceOptions) {}

  read(projectSlug: string) {
    return this.options.store.readConnection(projectSlug);
  }

  async connect(project: AuthProject, input: TelegramMiniAppConnectionInput) {
    const previous = await this.options.store.read(project.slug);
    const settings: TelegramMiniAppRuntimeSettings = {
      botUsername: input.botUsername,
      botToken: input.botToken
    };

    await this.options.store.save(project.slug, settings);
    this.options.runtimeSettings.set(project.slug, settings);

    try {
      await this.options.applyRuntimeSettings(project);
    } catch (error) {
      await this.restore(project.slug, previous);
      throw error;
    }

    return { botUsername: settings.botUsername };
  }

  async disconnect(project: AuthProject) {
    const previous = await this.options.store.read(project.slug);
    if (!previous) {
      return;
    }

    await this.options.store.delete(project.slug);
    this.options.runtimeSettings.delete(project.slug);

    try {
      await this.options.applyRuntimeSettings(project);
    } catch (error) {
      await this.restore(project.slug, previous);
      throw error;
    }
  }

  private async restore(
    projectSlug: string,
    settings: TelegramMiniAppRuntimeSettings | null
  ) {
    if (!settings) {
      await this.options.store.delete(projectSlug);
      this.options.runtimeSettings.delete(projectSlug);
      return;
    }

    await this.options.store.save(projectSlug, settings);
    this.options.runtimeSettings.set(projectSlug, settings);
  }
}
