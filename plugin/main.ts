import {
  App,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  type WorkspaceLeaf,
} from "obsidian";

import {
  computeAllGlowRecords,
  migrateStatsOnRename,
  removeStatsOnDelete,
  updateStatsOnOpen,
  type GlowRecord,
  type StatsIndex,
} from "../core/metrics";
import {
  CURRENT_VERSION,
  loadAllStats,
  saveAllStats,
} from "../core/store";
import type { PersistedData } from "../core/types";
import {
  DEFAULT_SETTINGS,
  type CognitiveGlowSettings,
} from "./settings";
import { GlowView, GLOW_VIEW_TYPE } from "../ui/glowView";

export default class CognitiveGlowPlugin extends Plugin {
  private stats: StatsIndex = { version: CURRENT_VERSION, notes: {} };
  private settings: CognitiveGlowSettings = { ...DEFAULT_SETTINGS };
  private saveTimeout: number | null = null;

  async onload(): Promise<void> {
    const persisted = await loadAllStats(
      () => this.loadData(),
      DEFAULT_SETTINGS,
      (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          return file.stat.mtime;
        }
        return undefined;
      },
    );

    this.stats = persisted.stats;
    this.settings = persisted.settings;
    const normalized = this.normalizeWeightSettings(this.settings);
    if (normalized) {
      this.scheduleSave();
    }

    this.registerView(
      GLOW_VIEW_TYPE,
      (leaf: WorkspaceLeaf) =>
        new GlowView(leaf, {
          getRecords: () => this.getGlowRecords(),
          getSettings: () => this.getSettings(),
        }),
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          this.handleFileOpen(file);
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath) => {
        if (file instanceof TFile) {
          migrateStatsOnRename(this.stats, oldPath, file.path);
          this.scheduleSave();
          this.refreshViews();
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        if (file instanceof TFile) {
          removeStatsOnDelete(this.stats, file.path);
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

    this.addCommand({
      id: "cognitive-glow-show-persisted-data",
      name: "Show Persisted Data (JSON)",
      callback: () => {
        const payload = this.getPersistedData();
        const serialized = JSON.stringify(payload, null, 2);
        new PersistedDataModal(this.app, serialized).open();
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
    const records = computeAllGlowRecords(
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
    const maxRecords = Math.max(0, Math.floor(this.settings.maxRecords));
    if (maxRecords > 0 && records.length > maxRecords) {
      return records
        .slice()
        .sort((a, b) => b.glowScore - a.glowScore)
        .slice(0, maxRecords);
    }
    return records;
  }

  getSettings(): CognitiveGlowSettings {
    return this.settings;
  }

  async updateSettings(
    updater: (settings: CognitiveGlowSettings) => void,
  ): Promise<void> {
    updater(this.settings);
    this.normalizeWeightSettings(this.settings);
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

  private handleFileOpen(file: TFile): void {
    const now = Date.now();
    updateStatsOnOpen(this.stats, file, now);
    this.scheduleSave();
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
    const payload = this.getPersistedData();
    await saveAllStats((data) => this.saveData(data), payload);
  }

  private getPersistedData(): PersistedData {
    return {
      version: CURRENT_VERSION,
      stats: this.stats,
      settings: this.settings,
    };
  }

  public setManualGravity(path: string, value: number): void {
    const record = this.stats.notes[path];
    if (!record) {
      return;
    }
    record.manualGravity = Math.min(1, Math.max(0, value));
    this.scheduleSave();
    this.refreshViews();
  }

  private normalizeWeightSettings(
    settings: CognitiveGlowSettings,
  ): boolean {
    const clamp = (value: number): number =>
      Math.min(1, Math.max(0, value));
    let nextRecency = clamp(settings.weightRecency);
    let nextFrequency = clamp(settings.weightFrequency);
    let nextGravity = clamp(settings.weightGravity);
    let changed =
      nextRecency !== settings.weightRecency ||
      nextFrequency !== settings.weightFrequency ||
      nextGravity !== settings.weightGravity;
    const total = nextRecency + nextFrequency + nextGravity;
    if (total > 1) {
      console.warn(
        "Cognitive Glow: weights exceeded 1; normalizing.",
      );
      nextRecency /= total;
      nextFrequency /= total;
      nextGravity /= total;
      changed = true;
    }
    settings.weightRecency = nextRecency;
    settings.weightFrequency = nextFrequency;
    settings.weightGravity = nextGravity;
    return changed;
  }
}

class PersistedDataModal extends Modal {
  private serializedData: string;

  constructor(app: App, serializedData: string) {
    super(app);
    this.serializedData = serializedData;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", {
      text: "Cognitive Glow Persisted Data (JSON)",
    });
    const pre = contentEl.createEl("pre");
    pre.textContent = this.serializedData;
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
    const clampNumber = (
      value: string,
      fallback: number,
      min = Number.NEGATIVE_INFINITY,
      max = Number.POSITIVE_INFINITY,
    ): number => {
      const parsed = Number.parseFloat(value);
      if (Number.isNaN(parsed)) {
        return fallback;
      }
      return Math.min(max, Math.max(min, parsed));
    };

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

    new Setting(containerEl)
      .setName("Show low-glow notes")
      .setDesc("Include notes with very low glow scores in Normal mode.")
      .addToggle((toggle) =>
        toggle
          .setValue(settings.showArchived)
          .onChange(async (value) => {
            await this.plugin.updateSettings((next) => {
              next.showArchived = value;
            });
          }),
      );

    new Setting(containerEl)
      .setName("Recency decay (ms)")
      .setDesc("Controls how quickly glow fades with time (in milliseconds).")
      .addText((text) =>
        text
          .setPlaceholder(String(settings.tauRecencyMs))
          .setValue(String(settings.tauRecencyMs))
          .onChange(async (value) => {
            const nextValue = clampNumber(value, settings.tauRecencyMs, 1);
            await this.plugin.updateSettings((next) => {
              next.tauRecencyMs = nextValue;
            });
          }),
      );

    new Setting(containerEl)
      .setName("Max records")
      .setDesc(
        "Maximum number of notes to process or render (0 disables the cap).",
      )
      .addText((text) =>
        text
          .setPlaceholder(String(settings.maxRecords))
          .setValue(String(settings.maxRecords))
          .onChange(async (value) => {
            const nextValue = clampNumber(
              value,
              settings.maxRecords,
              0,
            );
            await this.plugin.updateSettings((next) => {
              next.maxRecords = Math.floor(nextValue);
            });
          }),
      );

    new Setting(containerEl)
      .setName("Recency weight")
      .setDesc("Weight assigned to recent activity (0 to 1).")
      .addText((text) =>
        text
          .setPlaceholder(String(settings.weightRecency))
          .setValue(String(settings.weightRecency))
          .onChange(async (value) => {
            const nextValue = clampNumber(value, settings.weightRecency, 0, 1);
            await this.plugin.updateSettings((next) => {
              next.weightRecency = nextValue;
            });
          }),
      );

    new Setting(containerEl)
      .setName("Frequency weight")
      .setDesc("Weight assigned to frequency of opens (0 to 1).")
      .addText((text) =>
        text
          .setPlaceholder(String(settings.weightFrequency))
          .setValue(String(settings.weightFrequency))
          .onChange(async (value) => {
            const nextValue = clampNumber(
              value,
              settings.weightFrequency,
              0,
              1,
            );
            await this.plugin.updateSettings((next) => {
              next.weightFrequency = nextValue;
            });
          }),
      );

    new Setting(containerEl)
      .setName("Gravity weight")
      .setDesc("Weight assigned to manual importance (0 to 1).")
      .addText((text) =>
        text
          .setPlaceholder(String(settings.weightGravity))
          .setValue(String(settings.weightGravity))
          .onChange(async (value) => {
            const nextValue = clampNumber(
              value,
              settings.weightGravity,
              0,
              1,
            );
            await this.plugin.updateSettings((next) => {
              next.weightGravity = nextValue;
            });
          }),
      );
  }
}
