import { ItemView, type WorkspaceLeaf } from "obsidian";

import type { GlowRecord } from "../core/types";
import type { CognitiveGlowSettings } from "../plugin/settings";

export const GLOW_VIEW_TYPE = "cognitive-glow-view";

const LOW_GLOW_THRESHOLD = 0.05;

interface GlowViewOptions {
  getRecords: () => GlowRecord[];
  getSettings: () => CognitiveGlowSettings;
}

export class GlowView extends ItemView {
  private options: GlowViewOptions;
  private isFocusMode = false;

  constructor(leaf: WorkspaceLeaf, options: GlowViewOptions) {
    super(leaf);
    this.options = options;
  }

  getViewType(): string {
    return GLOW_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Cognitive glow";
  }

  getIcon(): string {
    return "sparkles";
  }

  onOpen(): Promise<void> {
    this.render();
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    this.contentEl.empty();
    return Promise.resolve();
  }

  render(): void {
    const { getRecords, getSettings } = this.options;
    const container = this.contentEl;
    container.empty();
    container.addClass("cognitive-glow-panel");

    const settings = getSettings();

    const header = container.createDiv({ cls: "cognitive-glow-header" });
    header.createEl("h3", { text: "Cognitive glow" });
    const modeControls = header.createDiv({
      cls: "cognitive-glow-mode-controls",
    });
    const normalButton = modeControls.createEl("button", {
      cls: "cognitive-glow-toggle",
      text: "Normal",
    });
    const focusButton = modeControls.createEl("button", {
      cls: "cognitive-glow-toggle",
      text: "Focus",
    });
    normalButton.toggleClass("is-active", !this.isFocusMode);
    focusButton.toggleClass("is-active", this.isFocusMode);
    normalButton.addEventListener("click", () => {
      if (!this.isFocusMode) {
        return;
      }
      this.isFocusMode = false;
      this.render();
    });
    focusButton.addEventListener("click", () => {
      if (this.isFocusMode) {
        return;
      }
      this.isFocusMode = true;
      this.render();
    });

    const list = container.createDiv({ cls: "cognitive-glow-list" });

    let records = getRecords().sort((a, b) => b.glowScore - a.glowScore);

    if (!settings.showArchived) {
      records = records.filter(
        (record) => record.glowScore >= LOW_GLOW_THRESHOLD,
      );
    }

    if (this.isFocusMode) {
      const topN = Math.max(1, Math.floor(settings.focusTopN));
      records = records.slice(0, topN);
      header.createEl("p", {
        cls: "cognitive-glow-mode",
        text: `Top ${topN} notes by glow`,
      });
    } else {
      header.createEl("p", {
        cls: "cognitive-glow-mode",
        text: "All notes by glow score",
      });
    }

    const maxRecords = Math.max(0, Math.floor(settings.maxRecords));
    if (maxRecords > 0) {
      records = records.slice(0, maxRecords);
    }

    if (records.length === 0) {
      list.createEl("p", {
        cls: "cognitive-glow-empty",
        text: "No glow data yet — open some notes to get started.",
      });
      return;
    }

    // Tonal range: stretch scores across the *visible* list so the top note
    // burns and the bottom note is an ember, even when raw scores cluster.
    // Raw scores rank the list; stretched scores paint it.
    const scores = records.map((r) => Math.min(1, Math.max(0, r.glowScore)));
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const range = maxScore - minScore;

    records.forEach((record, i) => {
      const glowScore = scores[i];
      // When every visible score is (near-)equal there is no hierarchy to
      // show, so everything renders at full heat rather than arbitrary rank.
      const intensity = range > 1e-6 ? (glowScore - minScore) / range : 1;
      // Warmth follows physical age, not relative rank — but tone-mapped.
      // Raw recency is exp(-age/tau), which collapses everything older
      // than ~2·tau into indistinguishable gray. Recover age in tau-units
      // and cool on a log scale instead, so the amber midtones stretch
      // across weeks: fresh ≈ 1, 1·tau ≈ 0.8, 10·tau ≈ 0.3, 30·tau → 0.
      const recency = Math.min(1, Math.max(0, record.recency));
      let warmth = 0;
      if (recency > 0) {
        const ageInTau = -Math.log(recency);
        warmth = Math.max(0, 1 - Math.log(1 + ageInTau) / Math.log(31));
      }
      const frequency = Math.min(1, Math.max(0, record.frequency));

      // Extract display name: filename without .md extension
      const parts = record.path.split("/");
      const filename = parts[parts.length - 1];
      const displayName = filename.endsWith(".md")
        ? filename.slice(0, -3)
        : filename;

      const row = list.createDiv({ cls: "cognitive-glow-row" });
      // Three perceptual channels, all consumed by styles.css (per Obsidian
      // styling guidance): intensity → presence/glow, warmth → color
      // temperature, frequency → row width.
      row.style.setProperty("--glow-intensity", intensity.toFixed(3));
      row.style.setProperty("--glow-warmth", warmth.toFixed(3));
      row.style.setProperty("--glow-freq", frequency.toFixed(3));
      // Ignition is discrete, not a fade: a smooth light↔dark text
      // crossover always has a warmth where text matches the background.
      // Hot rows flip to a white-gold ground with dark text in one step.
      row.toggleClass("is-hot", warmth >= 0.7);
      row.setAttr("title", record.path);
      row.addEventListener("click", () => {
        this.app.workspace
          .openLinkText(record.path, "", false)
          .catch((e: unknown) => console.error("Cognitive Glow: failed to open note", e));
      });

      const label = row.createDiv({ cls: "cognitive-glow-label" });
      label.setText(displayName);
    });
  }
}
