export interface StorageAdapter {
  getItem<T = any>(key: string): Promise<T | null>;
  setItem<T = any>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  async getItem<T = any>(key: string): Promise<T | null> {
    if (typeof window === "undefined") return null;
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : null;
    } catch (e) {
      console.warn(`[LocalStorageAdapter] Failed to parse key "${key}":`, e);
      return null;
    }
  }

  async setItem<T = any>(key: string, value: T): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`[LocalStorageAdapter] Failed to write key "${key}":`, e);
    }
  }

  async removeItem(key: string): Promise<void> {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
  }
}

let activeAdapter: StorageAdapter = new LocalStorageAdapter();

export function getStorageAdapter(): StorageAdapter {
  return activeAdapter;
}

export function setStorageAdapter(adapter: StorageAdapter) {
  activeAdapter = adapter;
}
