import assert from "node:assert/strict";
import test from "node:test";

import { ensurePersistedData, sanitizeSettings } from "../core/store.ts";
import type { GlowConfig } from "../core/types.ts";

// Non-empty folder default so fallback-to-default is distinguishable from
// fallback-to-empty.
const defaults: GlowConfig = {
  tauRecencyMs: 3 * 24 * 60 * 60 * 1000,
  hitCountMaxScale: 20,
  weightRecency: 0.6,
  weightFrequency: 0.4,
  weightGravity: 0,
  focusTopN: 5,
  showArchived: true,
  maxRecords: 3000,
  sidebarSide: "right",
  minDwellMs: 30000,
  includedFolders: ["Projects/"],
  excludedFolders: [],
};

test("sanitizeSettings keeps valid values and clamps out-of-range numbers", () => {
  const result = sanitizeSettings(
    {
      tauRecencyMs: 0, // below min → clamped to 1
      hitCountMaxScale: 10, // valid → kept
      weightRecency: 5, // above max → clamped to 1
      weightGravity: -2, // below min → clamped to 0
      focusTopN: 2.6, // rounded to integer
      minDwellMs: -100, // below min → clamped to 0
      sidebarSide: "left", // valid → kept
    },
    defaults,
  );

  assert.equal(result.tauRecencyMs, 1);
  assert.equal(result.hitCountMaxScale, 10);
  assert.equal(result.weightRecency, 1);
  assert.equal(result.weightGravity, 0);
  assert.equal(result.focusTopN, 3);
  assert.equal(result.minDwellMs, 0);
  assert.equal(result.sidebarSide, "left");
  // Untouched fields come from defaults.
  assert.equal(result.weightFrequency, defaults.weightFrequency);
});

test("wrong-typed and non-finite values fall back to defaults", () => {
  const result = sanitizeSettings(
    {
      tauRecencyMs: "3 days",
      weightRecency: Number.NaN,
      minDwellMs: Number.POSITIVE_INFINITY,
      maxRecords: null,
      showArchived: "yes",
      sidebarSide: "top",
      focusTopN: [7],
    },
    defaults,
  );

  assert.deepEqual(result, defaults);
});

test("boolean false is preserved, not mistaken for a missing value", () => {
  const result = sanitizeSettings({ showArchived: false }, defaults);
  assert.equal(result.showArchived, false);
});

test("folder lists: non-arrays fall back, junk entries are dropped", () => {
  const result = sanitizeSettings(
    {
      includedFolders: "Projects/", // string, not array → default copy
      excludedFolders: ["archive/", 3, "", "  Templates/  ", {}],
    },
    defaults,
  );

  assert.deepEqual(result.includedFolders, defaults.includedFolders);
  assert.notEqual(result.includedFolders, defaults.includedFolders);
  assert.deepEqual(result.excludedFolders, ["archive/", "Templates/"]);
});

test("unknown keys are dropped", () => {
  const result = sanitizeSettings(
    { glowIntensity: 11, weightRecency: 0.5 },
    defaults,
  );

  assert.ok(!("glowIntensity" in result));
  assert.deepEqual(
    Object.keys(result).sort(),
    Object.keys(defaults).sort(),
  );
});

test("non-record input returns a detached copy of the defaults", () => {
  for (const raw of [undefined, null, 42, "settings", []]) {
    const result = sanitizeSettings(raw, defaults);
    assert.deepEqual(result, defaults);
    assert.notEqual(result, defaults);
    // Array fields must be copies — mutating the result must never reach
    // the shared defaults object.
    assert.notEqual(result.includedFolders, defaults.includedFolders);
    assert.notEqual(result.excludedFolders, defaults.excludedFolders);
  }
});

test("ensurePersistedData sanitizes persisted settings", () => {
  const persisted = ensurePersistedData(
    {
      version: 2,
      stats: { version: 2, notes: {} },
      settings: {
        tauRecencyMs: "junk",
        weightRecency: 9,
        bogus: true,
      },
    },
    defaults,
  );

  assert.equal(persisted.settings.tauRecencyMs, defaults.tauRecencyMs);
  assert.equal(persisted.settings.weightRecency, 1);
  assert.ok(!("bogus" in persisted.settings));
});
