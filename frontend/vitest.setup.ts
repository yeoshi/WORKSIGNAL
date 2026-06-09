import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

const store = new Map<string, string>();

const localStorageMock: Storage = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(key: string) {
    return store.get(key) ?? null;
  },
  key(index: number) {
    return [...store.keys()][index] ?? null;
  },
  removeItem(key: string) {
    store.delete(key);
  },
  setItem(key: string, value: string) {
    store.set(key, value);
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

beforeEach(() => {
  store.clear();
});
