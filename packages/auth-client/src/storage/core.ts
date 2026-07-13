export type AuthStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
};

export const createKeyValueAuthStorage = (storage: KeyValueStorage): AuthStorage => ({
  get: async (key) => await storage.getItem(key),
  set: async (key, value) => await storage.setItem(key, value),
  delete: async (key) => await storage.removeItem(key)
});
