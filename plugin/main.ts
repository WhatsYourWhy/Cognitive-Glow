import type { TFile } from "obsidian";

import {
  computeGlowScore,
  type GlowConfig,
  type GlowRecord,
  type NoteStats,
} from "../core/metrics";

export function buildGlowRecord(
  file: TFile,
  stats: NoteStats,
  config: GlowConfig,
  now: number,
): GlowRecord {
  return {
    path: file.path,
    glowScore: computeGlowScore(stats, config, now, file.stat.mtime),
  };
}
