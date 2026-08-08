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
    isRecord((value as { notes: unknown }).notes)
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

interface NumberRule {
  min?: number;
  max?: number;
  integer?: boolean;
}

function sanitizeNumber(
  value: unknown,
  fallback: number,
  rule: NumberRule = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  let result = rule.integer ? Math.round(value) : value;
  if (rule.min !== undefined && result < rule.min) {
    result = rule.min;
  }
  if (rule.max !== undefined && result > rule.max) {
    result = rule.max;
  }
  return result;
}

function sanitizeFolderList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Rebuild a GlowConfig from untrusted persisted data (data.json can be
 * hand-edited or written by an older plugin version). Each field keeps the
 * stored value only when it has the right type, clamped into its valid
 * range; anything else falls back to the default. Unknown keys are dropped
 * by construction, and array fields are copied so the result never aliases
 * the defaults object.
 */
export function sanitizeSettings(
  raw: unknown,
  defaultSettings: GlowConfig,
): GlowConfig {
  const data = isRecord(raw) ? raw : {};
  return {
    tauRecencyMs: sanitizeNumber(
      data.tauRecencyMs,
      defaultSettings.tauRecencyMs,
      { min: 1 },
    ),
    hitCountMaxScale: sanitizeNumber(
      data.hitCountMaxScale,
      defaultSettings.hitCountMaxScale,
      { min: 1, integer: true },
    ),
    weightRecency: sanitizeNumber(
      data.weightRecency,
      defaultSettings.weightRecency,
      { min: 0, max: 1 },
    ),
    weightFrequency: sanitizeNumber(
      data.weightFrequency,
      defaultSettings.weightFrequency,
      { min: 0, max: 1 },
    ),
    weightGravity: sanitizeNumber(
      data.weightGravity,
      defaultSettings.weightGravity,
      { min: 0, max: 1 },
    ),
    focusTopN: sanitizeNumber(data.focusTopN, defaultSettings.focusTopN, {
      min: 1,
      integer: true,
    }),
    showArchived:
      typeof data.showArchived === "boolean"
        ? data.showArchived
        : defaultSettings.showArchived,
    maxRecords: sanitizeNumber(data.maxRecords, defaultSettings.maxRecords, {
      min: 0,
      integer: true,
    }),
    sidebarSide:
      data.sidebarSide === "left" || data.sidebarSide === "right"
        ? data.sidebarSide
        : defaultSettings.sidebarSide,
    minDwellMs: sanitizeNumber(data.minDwellMs, defaultSettings.minDwellMs, {
      min: 0,
    }),
    includedFolders: sanitizeFolderList(
      data.includedFolders,
      defaultSettings.includedFolders,
    ),
    excludedFolders: sanitizeFolderList(
      data.excludedFolders,
      defaultSettings.excludedFolders,
    ),
  };
}

function migrateFromStatsIndex(
  stats: StatsIndex,
  defaultSettings: GlowConfig,
): PersistedData {
  return {
    version: CURRENT_VERSION,
    stats,
    // No persisted settings exist in the legacy shape; sanitizing the empty
    // input yields a detached copy of the defaults.
    settings: sanitizeSettings(undefined, defaultSettings),
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
  const settings = sanitizeSettings(data.settings, defaultSettings);
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
