import { browserStorage, SoulrunStorage } from './SoulrunStorage';

let runtimeStorage: SoulrunStorage | null = null;

export function getSoulrunStorage(): SoulrunStorage {
  runtimeStorage ??= new SoulrunStorage(browserStorage());
  return runtimeStorage;
}

export function resetSoulrunStorage(): void {
  runtimeStorage = null;
}
