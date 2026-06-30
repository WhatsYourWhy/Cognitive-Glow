import type {
  GlowConfig,
  GlowRecord,
  NoteStats,
  StatsIndex,
} from "./types";

export function updateStatsOnOpen(
  index: StatsIndex,
  path: string,
  now: number,
  dwellMs?: number,
): void {
  const existing: NoteStats = index.notes[path] ?? {
    path,
    hitCount: 0,
    lastOpened: now,
  };

  existing.hitCount += 1;
  existing.lastOpened = now;
  if (dwellMs !== undefined) {
    existing.dwellMs = (existing.dwellMs ?? 0) + dwellMs;
  }
  index.notes[path] = existing;
}

export function migrateStatsOnRename(
  index: StatsIndex,
  oldPath: string,
  newPath: string,
): void {
  if (oldPath === newPath) {
    return;
  }
  const existing = index.notes[oldPath];
  if (!existing) {
    return;
  }
  delete index.notes[oldPath];
  existing.path = newPath;
  index.notes[newPath] = existing;
}

export function removeStatsOnDelete(index: StatsIndex, path: string): void {
  if (index.notes[path]) {
    delete index.notes[path];
  }
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeGlowScore(
  stats: NoteStats,
  config: GlowConfig,
  now: number,
  fallbackMtime?: number,
): number {
  // A note that was never opened (hitCount 0 — e.g. a pin-only record) has no
  // open-recency, so it must not borrow recency glow from a synthetic anchor.
  // Spec 3.2: otherwise fall back to mtime when lastOpened is missing.
  const recencyAnchor = stats.lastOpened ?? fallbackMtime ?? now;
  const dt = Math.max(0, now - recencyAnchor);
  const recency =
    stats.hitCount > 0 ? Math.exp(-dt / config.tauRecencyMs) : 0;
  const denom = Math.log(1 + config.hitCountMaxScale);
  const freq = denom > 0 ? Math.log(1 + stats.hitCount) / denom : 0;
  const gravity =
    typeof stats.manualGravity === "number"
      ? clamp(0, 1, stats.manualGravity)
      : 0;
  return clamp(
    0,
    1,
    config.weightRecency * recency +
      config.weightFrequency * freq +
      config.weightGravity * gravity,
  );
}

export function computeAllGlowRecords(
  index: StatsIndex,
  config: GlowConfig,
  now: number,
  fallbackMtimeForPath?: (path: string) => number | undefined,
): GlowRecord[] {
  return Object.values(index.notes).map((stats) => ({
    path: stats.path,
    glowScore: computeGlowScore(
      stats,
      config,
      now,
      fallbackMtimeForPath?.(stats.path),
    ),
  }));
}
