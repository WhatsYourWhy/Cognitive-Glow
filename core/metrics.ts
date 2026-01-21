export interface NoteStats {
  path: string;
  hitCount: number;
  lastOpened?: number;
  dwellMs?: number;
}

export interface GlowConfig {
  tauRecencyMs: number;
  hitCountMaxScale: number;
  weightRecency: number;
  weightFrequency: number;
  focusTopN: number;
}

export interface GlowRecord {
  path: string;
  glowScore: number;
}

export function updateStatsOnOpen(stats: NoteStats, now: number): NoteStats {
  return {
    ...stats,
    hitCount: stats.hitCount + 1,
    lastOpened: now,
  };
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
  const lastOpenedOrMtime = stats.lastOpened ?? fallbackMtime;
  // Spec 3.2: fall back to mtime when lastOpened is missing.
  const recencyAnchor = lastOpenedOrMtime ?? now;
  const recency = Math.exp(-(now - recencyAnchor) / config.tauRecencyMs);
  const freq =
    Math.log(1 + stats.hitCount) /
    Math.log(1 + config.hitCountMaxScale);
  return clamp(
    0,
    1,
    config.weightRecency * recency + config.weightFrequency * freq,
  );
}
