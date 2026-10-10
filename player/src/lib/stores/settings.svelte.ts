import { SETTINGS_DEFINITIONS } from "$lib/config/settingsRegistry";

export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
}

const defaultLocalStorageAdapter: StorageAdapter = {
  getItem: (key) =>
    typeof window !== "undefined" ? localStorage.getItem(key) : null,
  setItem: (key, val) => {
    if (typeof window !== "undefined") localStorage.setItem(key, val);
  },
};

export class SettingsStore {
  // Reactive key-value dictionary: e.g. { 'appearance.skin': 'resonance', ... }
  values = $state<Record<string, any>>({});
  private storage: StorageAdapter;
  private readonly storageKey = "sinatra_settings";

  constructor(storage: StorageAdapter = defaultLocalStorageAdapter) {
    this.storage = storage;
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
      const raw = await this.storage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.values = { ...this.values, ...parsed };
      }
    } catch (e) {
      console.warn(
        "Failed to parse saved settings, falling back to defaults:",
        e
      );
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

  private persist() {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.values));
    } catch (e) {
      console.error("Failed to persist settings:", e);
    }
  }

  /**
   * Future-proof adapter swap (e.g. Tauri Plugin Store)
   */
  async setStorageAdapter(newAdapter: StorageAdapter) {
    this.storage = newAdapter;
    await this.load();
  }
}

export const settings = new SettingsStore();
