import assert from "node:assert/strict";
import test from "node:test";

import { computeGlowScore } from "../core/metrics.ts";
import type { GlowConfig, NoteStats } from "../core/types.ts";

const config: GlowConfig = {
  tauRecencyMs: 3 * 24 * 60 * 60 * 1000,
  hitCountMaxScale: 20,
  weightRecency: 0.6,
  weightFrequency: 0.4,
  weightGravity: 0,
  focusTopN: 2000,
  showArchived: true,
  maxRecords: 2000,
};

const now = Date.UTC(2024, 0, 15, 12, 0, 0);

function expectedGlowScore(
  stats: NoteStats,
  fallbackMtime?: number,
): number {
  const dt = Math.max(0, now - (stats.lastOpened ?? fallbackMtime ?? now));
  const recency = Math.exp(-dt / config.tauRecencyMs);
  const denom = Math.log(1 + config.hitCountMaxScale);
  const freq = denom > 0 ? Math.log(1 + stats.hitCount) / denom : 0;
  const gravity =
    typeof stats.manualGravity === "number"
      ? Math.min(1, Math.max(0, stats.manualGravity))
      : 0;
  const rawScore =
    config.weightRecency * recency +
    config.weightFrequency * freq +
    config.weightGravity * gravity;
  return Math.min(1, Math.max(0, rawScore));
}

test("computeGlowScore matches the expected formula", () => {
  const stats: NoteStats = {
    path: "notes/glow.md",
    hitCount: 4,
    lastOpened: now - 24 * 60 * 60 * 1000,
  };

  const expected = expectedGlowScore(stats);
  const actual = computeGlowScore(stats, config, now);
  assert.ok(Math.abs(actual - expected) < 1e-9);
});

test("computeGlowScore uses fallback mtime when lastOpened is missing", () => {
  const stats: NoteStats = {
    path: "notes/fallback.md",
    hitCount: 1,
    lastOpened: now - 2 * 24 * 60 * 60 * 1000,
  };
  const fallbackMtime = now - 2 * 24 * 60 * 60 * 1000;

  const expected = expectedGlowScore(stats, fallbackMtime);
  const actual = computeGlowScore(stats, config, now, fallbackMtime);
  assert.ok(Math.abs(actual - expected) < 1e-9);
});
