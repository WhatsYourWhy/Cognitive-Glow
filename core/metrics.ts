import type { TFile } from "obsidian";

import type {
  GlowConfig,
  GlowRecord,
  NoteStats,
  StatsIndex,
} from "./types";

export type { GlowConfig, GlowRecord, NoteStats, StatsIndex } from "./types";

export function updateStatsOnOpen(
  index: StatsIndex,
  file: TFile,
  now: number,
): void {
  const path = file.path;
  const existing: NoteStats = index.notes[path] ?? {
    path,
    hitCount: 0,
    lastOpened: now,
  };

  existing.hitCount += 1;
  existing.lastOpened = now;
  index.notes[path] = existing;
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
  // Spec 3.2: fall back to mtime when lastOpened is missing.
  const recencyAnchor = stats.lastOpened ?? fallbackMtime ?? now;
  const recency = Math.exp(-(now - recencyAnchor) / config.tauRecencyMs);
  const denom = Math.log(1 + config.hitCountMaxScale);
  const freq = denom > 0 ? Math.log(1 + stats.hitCount) / denom : 0;
  return clamp(
    0,
    1,
    config.weightRecency * recency + config.weightFrequency * freq,
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
