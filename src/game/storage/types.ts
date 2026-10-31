export interface SoulrunRecords {
  readonly highScore: number;
  readonly bestCompletedLoops: number;
  readonly bestSurvivalTimeMs: number;
}

export interface SoulrunSettings {
  readonly musicVolume: number;
  readonly soundVolume: number;
  readonly muted: boolean;
  readonly screenShake: boolean;
  readonly reducedFlashes: boolean;
}

export interface StoredDataV1 {
  readonly schemaVersion: 1;
  readonly records: SoulrunRecords;
  readonly settings: SoulrunSettings;
}

export interface AdventureRecordCandidate {
  readonly score: number;
  readonly completedLoops: number;
  readonly survivalTimeMs: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StorageDiagnostic {
  readonly kind: 'storage-unavailable' | 'invalid-data';
  readonly message: string;
}
