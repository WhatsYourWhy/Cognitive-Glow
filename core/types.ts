export interface NoteStats {
  path: string;
  hitCount: number;
  lastOpened: number;
  manualGravity?: number;
  dwellMs?: number;
}

export interface StatsIndex {
  version: number;
  notes: Record<string, NoteStats>;
}

export interface GlowConfig {
  tauRecencyMs: number;
  hitCountMaxScale: number;
  weightRecency: number;
  weightFrequency: number;
  weightGravity: number;
  focusTopN: number;
  showArchived: boolean;
  maxRecords: number;
  sidebarSide: "left" | "right";
  minDwellMs: number;
  includedFolders: string[];
  excludedFolders: string[];
}

export interface GlowRecord {
  path: string;
  glowScore: number;
  /** Raw recency component (0-1) before weighting — drives ember warmth. */
  recency: number;
  /** Raw frequency component (0-1) before weighting — drives row size. */
  frequency: number;
}

export interface PersistedData {
  version: number;
  stats: StatsIndex;
  settings: GlowConfig;
}
