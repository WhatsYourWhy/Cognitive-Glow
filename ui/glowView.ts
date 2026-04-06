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

    records.forEach((record) => {
      const glowScore = Math.min(1, Math.max(0, record.glowScore));
      const widthPercent = Math.round(glowScore * 100);
      const opacity = 0.25 + glowScore * 0.75;

      // Extract display name: filename without .md extension
      const parts = record.path.split("/");
      const filename = parts[parts.length - 1];
      const displayName = filename.endsWith(".md")
        ? filename.slice(0, -3)
        : filename;

      const row = list.createDiv({ cls: "cognitive-glow-row" });
      row.setAttr(
        "style",
        `width: ${widthPercent}%; opacity: ${opacity.toFixed(3)}; --glow-score: ${glowScore.toFixed(3)};`,
      );
      row.setAttr("title", record.path);
      row.addEventListener("click", () => {
        this.app.workspace
          .openLinkText(record.path, "", false)
          .catch(() => {});
      });

      const label = row.createDiv({ cls: "cognitive-glow-label" });
      label.setText(displayName);
    });
  }
}
