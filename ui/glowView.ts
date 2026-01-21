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
    return "Cognitive Glow";
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  render(): void {
    const { getRecords, getSettings } = this.options;
    const container = this.contentEl;
    container.empty();

    const settings = getSettings();

    const header = container.createDiv({ cls: "cognitive-glow-header" });
    header.createEl("h3", { text: "Cognitive Glow" });
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
        text: `Showing top ${topN} notes by glow score.`,
      });
    } else {
      header.createEl("p", {
        cls: "cognitive-glow-mode",
        text: "Showing all notes by glow score.",
      });
    }

    if (records.length === 0) {
      list.createEl("p", { text: "No glow stats yet." });
      return;
    }

    records.forEach((record) => {
      const glowScore = Math.min(1, Math.max(0, record.glowScore));
      const widthPercent = Math.round(glowScore * 100);
      const opacity = 0.2 + glowScore * 0.8;
      const row = list.createDiv({ cls: "cognitive-glow-row" });
      row.setAttr(
        "style",
        `width: ${widthPercent}%; opacity: ${opacity};`,
      );
      row.addEventListener("click", () =>
        this.app.workspace.openLinkText(record.path, "", false),
      );

      const label = row.createDiv({ cls: "cognitive-glow-label" });
      label.setText(record.path);
    });
  }
}
