import { SETTINGS_DEFINITIONS } from "$lib/config/settingsRegistry";
import { getStorageAdapter } from "$lib/stores/localStorage";

export class SettingsStore {
  values = $state<Record<string, any>>({});
  private readonly storageKey = "sinatra_settings";

  constructor() {
    this.initDefaults();
    this.load();
  }

  private initDefaults() {
    const defaults: Record<string, any> = {};
    for (const def of SETTINGS_DEFINITIONS) {
      defaults[def.id] = def.defaultValue;
    }
    this.values = defaults;
  }

  async load() {
    try {
      const saved = await getStorageAdapter().getItem<Record<string, any>>(
        this.storageKey
      );
      if (saved) {
        this.values = { ...this.values, ...saved };
      }
    } catch (e) {
      console.warn("Failed to load settings via adapter, using defaults:", e);
    }
  }

  get<T = any>(id: string): T {
    return this.values[id];
  }

  set(id: string, value: any): boolean {
    const def = SETTINGS_DEFINITIONS.find((d) => d.id === id);
    if (!def) {
      console.warn(`Unknown setting id: "${id}"`);
      return false;
    }

    if (def.type === "boolean") {
      this.values[id] =
        typeof value === "string"
          ? value === "true" || value === "1"
          : Boolean(value);
    } else {
      this.values[id] = String(value);
    }

    this.persist();
    return true;
  }

  private async persist() {
    await getStorageAdapter().setItem(this.storageKey, this.values);
  }
}

export const settings = new SettingsStore();
