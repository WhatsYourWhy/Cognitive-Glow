export interface CognitiveGlowSettings {
  tauRecencyMs: number;
  hitCountMaxScale: number;
  weightRecency: number;
  weightFrequency: number;
  weightGravity: number;
  focusTopN: number;
  showArchived: boolean;
  maxRecords: number;
}

export const DEFAULT_SETTINGS: CognitiveGlowSettings = {
  tauRecencyMs: 3 * 24 * 60 * 60 * 1000,
  hitCountMaxScale: 20,
  weightRecency: 0.6,
  weightFrequency: 0.4,
  weightGravity: 0,
  focusTopN: 5,
  showArchived: true,
  maxRecords: 3000,
};
