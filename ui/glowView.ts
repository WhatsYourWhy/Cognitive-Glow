import { ItemView, type WorkspaceLeaf } from "obsidian";

import type { GlowConfig, GlowRecord } from "../core/types";

export const GLOW_VIEW_TYPE = "cognitive-glow-view";

type GlowViewMode = "all" | "focus";

interface GlowViewOptions {
  getRecords: () => GlowRecord[];
  getSettings: () => GlowConfig;
  onOpenPath: (path: string) => void;
}

export class GlowView extends ItemView {
  private mode: GlowViewMode = "all";
  private options: GlowViewOptions;

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

  setMode(mode: GlowViewMode): void {
    this.mode = mode;
    this.render();
  }

  render(): void {
    const { getRecords, getSettings } = this.options;
    const settings = getSettings();
    const container = this.contentEl;
    container.empty();

    const header = container.createDiv({ cls: "cognitive-glow-header" });
    header.createEl("h3", { text: "Cognitive Glow" });

    const buttonRow = header.createDiv({ cls: "cognitive-glow-controls" });
    const normalButton = buttonRow.createEl("button", { text: "Normal" });
    const focusButton = buttonRow.createEl("button", { text: "Focus" });

    normalButton.toggleClass("is-active", this.mode === "all");
    focusButton.toggleClass("is-active", this.mode === "focus");

    normalButton.addEventListener("click", () => this.setMode("all"));
    focusButton.addEventListener("click", () => this.setMode("focus"));

    const list = container.createDiv({ cls: "cognitive-glow-list" });

    const records = getRecords().sort((a, b) => b.glowScore - a.glowScore);
    const visible =
      this.mode === "focus" ? records.slice(0, settings.focusTopN) : records;

    if (visible.length === 0) {
      list.createEl("p", { text: "No glow stats yet." });
      return;
    }

    visible.forEach((record) => {
      const row = list.createDiv({ cls: "cognitive-glow-row" });
      row.addEventListener("click", () => this.options.onOpenPath(record.path));

      const label = row.createDiv({ cls: "cognitive-glow-label" });
      label.setText(record.path);

      const bar = row.createDiv({ cls: "cognitive-glow-bar" });
      bar.setAttr(
        "style",
        `width: ${Math.round(record.glowScore * 100)}%; opacity: ${
          0.2 + record.glowScore * 0.8
        };`,
      );
    });
  }
}
