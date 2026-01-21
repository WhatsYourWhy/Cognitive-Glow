import { ItemView, type WorkspaceLeaf } from "obsidian";

import type { GlowRecord } from "../core/types";

export const GLOW_VIEW_TYPE = "cognitive-glow-view";

interface GlowViewOptions {
  getRecords: () => GlowRecord[];
}

export class GlowView extends ItemView {
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

  render(): void {
    const { getRecords } = this.options;
    const container = this.contentEl;
    container.empty();

    const header = container.createDiv({ cls: "cognitive-glow-header" });
    header.createEl("h3", { text: "Cognitive Glow" });

    const list = container.createDiv({ cls: "cognitive-glow-list" });

    const records = getRecords().sort((a, b) => b.glowScore - a.glowScore);

    if (records.length === 0) {
      list.createEl("p", { text: "No glow stats yet." });
      return;
    }

    records.forEach((record) => {
      const widthPercent = Math.round(record.glowScore * 100);
      const opacity = 0.2 + record.glowScore * 0.8;
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
