import type { GlowConfig } from "../core/metrics";

export interface CognitiveGlowSettings extends GlowConfig {
  showArchived: boolean;
}

export const DEFAULT_SETTINGS: CognitiveGlowSettings = {
  tauRecencyMs: 3 * 24 * 60 * 60 * 1000,
  hitCountMaxScale: 20,
  weightRecency: 0.6,
  weightFrequency: 0.4,
  focusTopN: 5,
  showArchived: true,
};
