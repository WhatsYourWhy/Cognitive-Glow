import type {
  GlowConfig,
  NoteStats,
  PersistedData,
  StatsIndex,
} from "./types";

export const CURRENT_VERSION = 1;

export const EMPTY_STATS: StatsIndex = { notes: {} };

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

export function ensureStatsIndex(raw: unknown): StatsIndex {
  if (!isRecord(raw)) {
    return EMPTY_STATS;
  }
  const notes = raw.notes;
  if (!isRecord(notes)) {
    return EMPTY_STATS;
  }
  return {
    notes: notes as Record<string, NoteStats>,
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
): PersistedData {
  const data = isRecord(raw) ? raw : {};
  const stats = ensureStatsIndex(data.stats ?? raw);
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
): Promise<PersistedData> {
  const raw = await loadData();
  if (isStatsIndex(raw) && !isPersistedData(raw)) {
    return migrateFromStatsIndex(raw, defaultSettings);
  }
  return ensurePersistedData(raw, defaultSettings);
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
