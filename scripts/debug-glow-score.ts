import { computeGlowScore } from "../core/metrics";
import type { GlowConfig, NoteStats } from "../core/types";

const config: GlowConfig = {
  tauRecencyMs: 3 * 24 * 60 * 60 * 1000,
  hitCountMaxScale: 20,
  weightRecency: 0.6,
  weightFrequency: 0.4,
  focusTopN: 2000,
};

const now = Date.UTC(2024, 0, 15, 12, 0, 0);

function expectedGlowScore(
  stats: NoteStats,
  fallbackMtime?: number,
): number {
  const recencyAnchor = stats.lastOpened ?? fallbackMtime ?? now;
  const dt = Math.max(0, now - recencyAnchor);
  const recency = Math.exp(-dt / config.tauRecencyMs);
  const denom = Math.log(1 + config.hitCountMaxScale);
  const freq = denom > 0 ? Math.log(1 + stats.hitCount) / denom : 0;
  const rawScore = config.weightRecency * recency + config.weightFrequency * freq;
  return Math.min(1, Math.max(0, rawScore));
}

function logCase(
  label: string,
  stats: NoteStats,
  fallbackMtime?: number,
): void {
  const expected = expectedGlowScore(stats, fallbackMtime);
  const actual = computeGlowScore(stats, config, now, fallbackMtime);

  console.log(`\n${label}`);
  console.log("inputs:", { stats, fallbackMtime, now });
  console.log("expected:", expected.toFixed(6));
  console.log("actual:  ", actual.toFixed(6));
}

logCase("Case 1: explicit lastOpened", {
  path: "notes/glow.md",
  hitCount: 4,
  lastOpened: now - 24 * 60 * 60 * 1000,
});

logCase(
  "Case 2: missing lastOpened uses fallback mtime",
  {
    path: "notes/fallback.md",
    hitCount: 1,
  },
  now - 2 * 24 * 60 * 60 * 1000,
);
