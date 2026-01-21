import type { GlowConfig, NoteStats } from "./metrics";

export interface StatsIndex {
  notes: Record<string, NoteStats>;
}

export interface PersistedData {
  version: number;
  stats: StatsIndex;
  settings: GlowConfig;
}

export const CURRENT_VERSION = 1;

export const EMPTY_STATS: StatsIndex = { notes: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

export async function loadPersistedData(
  loadData: () => Promise<unknown>,
  defaultSettings: GlowConfig,
): Promise<PersistedData> {
  const raw = await loadData();
  return ensurePersistedData(raw, defaultSettings);
}

export async function savePersistedData(
  saveData: (data: PersistedData) => Promise<void>,
  data: PersistedData,
): Promise<void> {
  await saveData(data);
}
