import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  type WorkspaceLeaf,
} from "obsidian";

import {
  computeGlowRecords,
  updateStatsOnOpen,
  type GlowConfig,
  type GlowRecord,
  type StatsIndex,
} from "../core/metrics";
import {
  CURRENT_VERSION,
  loadAllStats,
  saveAllStats,
} from "../core/store";
import type { PersistedData } from "../core/types";
import { GlowView, GLOW_VIEW_TYPE } from "../ui/glowView";

interface CognitiveGlowSettings extends GlowConfig {}

const DEFAULT_SETTINGS: CognitiveGlowSettings = {
  tauRecencyMs: 3 * 24 * 60 * 60 * 1000,
  hitCountMaxScale: 20,
  weightRecency: 0.6,
  weightFrequency: 0.4,
  focusTopN: 5,
};

export default class CognitiveGlowPlugin extends Plugin {
  private stats: StatsIndex = { notes: {} };
  private settings: CognitiveGlowSettings = { ...DEFAULT_SETTINGS };
  private saveTimeout: number | null = null;

  async onload(): Promise<void> {
    const persisted = await loadAllStats(
      () => this.loadData(),
      DEFAULT_SETTINGS,
    );

    this.stats = persisted.stats;
    this.settings = persisted.settings;

    this.registerView(
      GLOW_VIEW_TYPE,
      (leaf: WorkspaceLeaf) =>
        new GlowView(leaf, {
          getRecords: () => this.getGlowRecords(),
          getSettings: () => this.settings,
          onOpenPath: (path) =>
            this.app.workspace.openLinkText(path, "", false),
        }),
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          const now = Date.now();
          updateStatsOnOpen(this.stats, file, now);
          this.scheduleSave();
          this.refreshViews();
        }
      }),
    );

    this.addCommand({
      id: "cognitive-glow-dump-scores",
      name: "Dump Glow Scores to Console",
      callback: () => {
        const records = this.getGlowRecords()
          .sort((a, b) => b.glowScore - a.glowScore)
          .slice(0, 20);
        console.log("Cognitive Glow – Top Notes:", records);
      },
    });

    this.addSettingTab(new CognitiveGlowSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.activateView();
    });
  }

  onunload(): void {
    this.saveTimeout = null;
  }

  getGlowRecords(): GlowRecord[] {
    const now = Date.now();
    return computeGlowRecords(
      this.stats,
      this.settings,
      now,
      (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          return file.stat.mtime;
        }
        return undefined;
      },
    );
  }

  getSettings(): CognitiveGlowSettings {
    return this.settings;
  }

  async updateSettings(
    updater: (settings: CognitiveGlowSettings) => void,
  ): Promise<void> {
    updater(this.settings);
    this.scheduleSave();
    this.refreshViews();
  }

  private refreshViews(): void {
    this.app.workspace
      .getLeavesOfType(GLOW_VIEW_TYPE)
      .forEach((leaf) => {
        const view = leaf.view;
        if (view instanceof GlowView) {
          view.render();
        }
      });
  }

  private async activateView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(GLOW_VIEW_TYPE);
    if (leaves.length === 0) {
      await this.app.workspace.getRightLeaf(false)?.setViewState({
        type: GLOW_VIEW_TYPE,
        active: true,
      });
    }
    this.refreshViews();
  }

  private scheduleSave(): void {
    if (this.saveTimeout != null) {
      window.clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      void this.performSave();
    }, 5000);
  }

  private async performSave(): Promise<void> {
    this.saveTimeout = null;
    const payload: PersistedData = {
      version: CURRENT_VERSION,
      stats: this.stats,
      settings: this.settings,
    };
    await saveAllStats((data) => this.saveData(data), payload);
  }
}

class CognitiveGlowSettingTab extends PluginSettingTab {
  private plugin: CognitiveGlowPlugin;

  constructor(app: App, plugin: CognitiveGlowPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Cognitive Glow Settings" });

    const settings = this.plugin.getSettings();

    new Setting(containerEl)
      .setName("Focus mode top N")
      .setDesc("Number of notes to show in Focus Mode.")
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(String(settings.focusTopN))
          .onChange(async (value) => {
            const n = Number.parseInt(value, 10);
            await this.plugin.updateSettings((next) => {
              next.focusTopN = Number.isNaN(n) ? 5 : Math.max(1, n);
            });
          }),
      );
  }
}
