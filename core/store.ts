import type {
  GlowConfig,
  NoteStats,
  PersistedData,
  StatsIndex,
} from "./types";

export const CURRENT_VERSION = 2;

export const EMPTY_STATS: StatsIndex = {
  version: CURRENT_VERSION,
  notes: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStatsIndex(value: unknown): value is StatsIndex {
  return (
    isRecord(value) &&
    "notes" in value &&
    isRecord((value as StatsIndex).notes)
  );
}

function isPersistedData(value: unknown): value is PersistedData {
  return (
    isRecord(value) &&
    "version" in value &&
    "stats" in value &&
    "settings" in value
  );
}

export function ensureStatsIndex(
  raw: unknown,
  fallbackMtimeForPath?: (path: string) => number | undefined,
  now: number = Date.now(),
): StatsIndex {
  if (!isRecord(raw)) {
    return EMPTY_STATS;
  }
  const notesSource = isRecord(raw.notes) ? raw.notes : raw;
  if (!isRecord(notesSource)) {
    return EMPTY_STATS;
  }
  const version =
    typeof raw.version === "number" ? raw.version : CURRENT_VERSION;
  const normalizedNotes: Record<string, NoteStats> = {};
  for (const [key, value] of Object.entries(notesSource)) {
    if (!isRecord(value)) {
      continue;
    }
    const path = typeof value.path === "string" ? value.path : key;
    const hitCount =
      typeof value.hitCount === "number" ? value.hitCount : 0;
    const lastOpened =
      typeof value.lastOpened === "number"
        ? value.lastOpened
        : fallbackMtimeForPath?.(path) ?? now;
    const manualGravity =
      typeof value.manualGravity === "number"
        ? value.manualGravity
        : undefined;
    const dwellMs =
      typeof value.dwellMs === "number" ? value.dwellMs : undefined;
    normalizedNotes[path] = {
      path,
      hitCount,
      lastOpened,
      manualGravity,
      dwellMs,
    };
  }
  return {
    version,
    notes: normalizedNotes,
  };
}

function migrateFromStatsIndex(
  stats: StatsIndex,
  defaultSettings: GlowConfig,
): PersistedData {
  return {
    version: CURRENT_VERSION,
    stats,
    settings: { ...defaultSettings },
  };
}

export function ensurePersistedData(
  raw: unknown,
  defaultSettings: GlowConfig,
  fallbackMtimeForPath?: (path: string) => number | undefined,
  now: number = Date.now(),
): PersistedData {
  const data = isRecord(raw) ? raw : {};
  const stats = ensureStatsIndex(
    data.stats ?? raw,
    fallbackMtimeForPath,
    now,
  );
  const settings = {
    ...defaultSettings,
    ...(isRecord(data.settings) ? data.settings : {}),
  } as GlowConfig;
  const version =
    typeof data.version === "number" ? data.version : CURRENT_VERSION;
  return {
    version,
    stats,
    settings,
  };
}

export async function loadAllStats(
  loadData: () => Promise<unknown>,
  defaultSettings: GlowConfig,
  fallbackMtimeForPath?: (path: string) => number | undefined,
): Promise<PersistedData> {
  const raw = await loadData();
  if (isStatsIndex(raw) && !isPersistedData(raw)) {
    const stats = ensureStatsIndex(raw, fallbackMtimeForPath);
    return migrateFromStatsIndex(stats, defaultSettings);
  }
  return ensurePersistedData(raw, defaultSettings, fallbackMtimeForPath);
}

export async function saveAllStats(
  saveData: (data: PersistedData) => Promise<void>,
  data: PersistedData,
): Promise<void> {
  const payload: PersistedData = {
    version:
      typeof data.version === "number" ? data.version : CURRENT_VERSION,
    stats: data.stats,
    settings: data.settings,
  };
  await saveData(payload);
}
