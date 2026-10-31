import type {
  AdventureRecordCandidate,
  SoulrunRecords,
  SoulrunSettings,
  StorageDiagnostic,
  StorageLike,
  StoredDataV1,
} from './types';

export const SOULRUN_STORAGE_KEY = 'soulrun:v1';
export const SOULRUN_INVALID_PREFIX = 'soulrun:invalid:';

export const DEFAULT_RECORDS: SoulrunRecords = Object.freeze({
  highScore: 0,
  bestCompletedLoops: 0,
  bestSurvivalTimeMs: 0,
});

export const DEFAULT_SETTINGS: SoulrunSettings = Object.freeze({
  musicVolume: 0.7,
  soundVolume: 0.8,
  muted: false,
  screenShake: true,
  reducedFlashes: false,
});

export const DEFAULT_STORED_DATA: StoredDataV1 = Object.freeze({
  schemaVersion: 1,
  records: DEFAULT_RECORDS,
  settings: DEFAULT_SETTINGS,
});

type DiagnosticListener = (diagnostic: StorageDiagnostic) => void;

interface SoulrunStorageOptions {
  readonly now?: () => number;
  readonly onDiagnostic?: DiagnosticListener;
}

export class SoulrunStorage {
  private data: StoredDataV1 = cloneStoredData(DEFAULT_STORED_DATA);
  private storageAvailable: boolean;
  private diagnosticEmitted = false;
  private readonly now: () => number;
  private readonly onDiagnostic: DiagnosticListener;

  constructor(
    private readonly storage: StorageLike | null,
    options: SoulrunStorageOptions = {},
  ) {
    this.storageAvailable = storage !== null;
    this.now = options.now ?? Date.now;
    this.onDiagnostic = options.onDiagnostic ?? defaultDiagnosticListener;
    this.load();
  }

  snapshot(): StoredDataV1 {
    return cloneStoredData(this.data);
  }

  updateSettings(patch: Partial<SoulrunSettings>): SoulrunSettings {
    this.data = {
      ...this.data,
      settings: sanitizeSettings({ ...this.data.settings, ...patch }),
    };
    this.persist();
    return { ...this.data.settings };
  }

  recordAdventure(result: AdventureRecordCandidate): SoulrunRecords {
    const candidate = sanitizeRecords({
      highScore: result.score,
      bestCompletedLoops: result.completedLoops,
      bestSurvivalTimeMs: result.survivalTimeMs,
    });
    this.data = {
      ...this.data,
      records: {
        highScore: Math.max(this.data.records.highScore, candidate.highScore),
        bestCompletedLoops: Math.max(
          this.data.records.bestCompletedLoops,
          candidate.bestCompletedLoops,
        ),
        bestSurvivalTimeMs: Math.max(
          this.data.records.bestSurvivalTimeMs,
          candidate.bestSurvivalTimeMs,
        ),
      },
    };
    this.persist();
    return { ...this.data.records };
  }

  private load(): void {
    if (!this.storageAvailable || !this.storage) {
      this.emitDiagnostic(
        'storage-unavailable',
        'Local storage is unavailable; using memory only.',
      );
      return;
    }

    let raw: string | null;
    try {
      raw = this.storage.getItem(SOULRUN_STORAGE_KEY);
    } catch {
      this.disableStorage();
      return;
    }
    if (raw === null) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isSupportedStoredObject(parsed)) throw new Error('Unsupported storage schema');
      this.data = sanitizeStoredData(parsed);
    } catch {
      this.emitDiagnostic('invalid-data', 'Stored Soulrun data was invalid and reset.');
      try {
        this.storage.setItem(`${SOULRUN_INVALID_PREFIX}${Math.floor(this.now())}`, raw);
      } catch {
        // Quarantine is best-effort; resetting the primary value still takes priority.
      }
      this.data = cloneStoredData(DEFAULT_STORED_DATA);
      try {
        this.storage.setItem(SOULRUN_STORAGE_KEY, JSON.stringify(this.data));
      } catch {
        this.disableStorage();
      }
    }
  }

  private persist(): void {
    if (!this.storageAvailable || !this.storage) return;
    try {
      this.storage.setItem(SOULRUN_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      this.disableStorage();
    }
  }

  private disableStorage(): void {
    this.storageAvailable = false;
    this.emitDiagnostic('storage-unavailable', 'Local storage failed; using memory only.');
  }

  private emitDiagnostic(kind: StorageDiagnostic['kind'], message: string): void {
    if (this.diagnosticEmitted) return;
    this.diagnosticEmitted = true;
    this.onDiagnostic({ kind, message });
  }
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function sanitizeStoredData(value: unknown): StoredDataV1 {
  const source = isRecord(value) ? value : {};
  return {
    schemaVersion: 1,
    records: sanitizeRecords(source.records),
    settings: sanitizeSettings(source.settings),
  };
}

function sanitizeSettings(value: unknown): SoulrunSettings {
  const source = isRecord(value) ? value : {};
  return {
    musicVolume: boundedNumber(source.musicVolume, DEFAULT_SETTINGS.musicVolume, 0, 1),
    soundVolume: boundedNumber(source.soundVolume, DEFAULT_SETTINGS.soundVolume, 0, 1),
    muted: booleanValue(source.muted, DEFAULT_SETTINGS.muted),
    screenShake: booleanValue(source.screenShake, DEFAULT_SETTINGS.screenShake),
    reducedFlashes: booleanValue(source.reducedFlashes, DEFAULT_SETTINGS.reducedFlashes),
  };
}

function sanitizeRecords(value: unknown): SoulrunRecords {
  const source = isRecord(value) ? value : {};
  return {
    highScore: nonNegativeInteger(source.highScore, DEFAULT_RECORDS.highScore),
    bestCompletedLoops: nonNegativeInteger(
      source.bestCompletedLoops,
      DEFAULT_RECORDS.bestCompletedLoops,
    ),
    bestSurvivalTimeMs: nonNegativeInteger(
      source.bestSurvivalTimeMs,
      DEFAULT_RECORDS.bestSurvivalTimeMs,
    ),
  };
}

function isSupportedStoredObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.schemaVersion === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function cloneStoredData(data: StoredDataV1): StoredDataV1 {
  return {
    schemaVersion: 1,
    records: { ...data.records },
    settings: { ...data.settings },
  };
}

function defaultDiagnosticListener(diagnostic: StorageDiagnostic): void {
  console.warn(`[soulrun] ${diagnostic.message}`);
}
