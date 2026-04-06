import {
  App,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
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

/** Tracks the most-recently opened note for dwell-time gating. */
interface PendingOpen {
  path: string;
  openedAt: number;
}

export default class CognitiveGlowPlugin extends Plugin {
  private stats: StatsIndex = { version: CURRENT_VERSION, notes: {} };
  private settings: CognitiveGlowSettings = { ...DEFAULT_SETTINGS };
  private saveTimeout: number | null = null;
  private pendingOpen: PendingOpen | null = null;

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
    if (this.stats.version !== CURRENT_VERSION) {
      this.stats.version = CURRENT_VERSION;
      this.scheduleSave();
    }
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

    this.addRibbonIcon("sparkles", "Cognitive glow", () => {
      this.activateView().catch(() => {});
    });

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          this.handleFileOpen(file);
        } else {
          // No file open — commit pending if threshold met
          this.commitPendingOpen(Date.now());
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          migrateStatsOnRename(this.stats, oldPath, file.path);
          // Update pending open if the renamed file was pending
          if (this.pendingOpen?.path === oldPath) {
            this.pendingOpen.path = file.path;
          }
          this.scheduleSave();
          this.refreshViews();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          removeStatsOnDelete(this.stats, file.path);
          if (this.pendingOpen?.path === file.path) {
            this.pendingOpen = null;
          }
          this.scheduleSave();
          this.refreshViews();
        }
      }),
    );

    this.addCommand({
      id: "open-glow-sidebar",
      name: "Open sidebar",
      callback: () => {
        this.activateView().catch(() => {});
      },
    });

    this.addCommand({
      id: "dump-scores",
      name: "Dump glow scores to console",
      callback: () => {
        const records = this.getGlowRecords()
          .sort((a, b) => b.glowScore - a.glowScore)
          .slice(0, 20);
        console.debug("Cognitive Glow – Top Notes:", records);
      },
    });

    this.addCommand({
      id: "show-persisted-data",
      name: "Show persisted data (JSON)",
      callback: () => {
        const payload = this.getPersistedData();
        const serialized = JSON.stringify(payload, null, 2);
        new PersistedDataModal(this.app, serialized).open();
      },
    });

    this.addSettingTab(new CognitiveGlowSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.activateView().catch(() => {});
    });
  }

  onunload(): void {
    // Commit any pending dwell visit before unloading
    this.commitPendingOpen(Date.now());

    if (this.saveTimeout != null) {
      window.clearTimeout(this.saveTimeout);
      // Flush immediately rather than letting the debounce lapse
      this.performSave().catch(() => {});
    }
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
    ).filter((record) => this.isPathTracked(record.path));

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

  setManualGravity(path: string, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    const clamped = Math.max(0, Math.min(1, value));
    const now = Date.now();
    const existing = this.stats.notes[path] ?? {
      path,
      hitCount: 0,
      lastOpened: now,
    };
    existing.manualGravity = clamped;
    this.stats.notes[path] = existing;
    this.scheduleSave();
    this.refreshViews();
  }

  async updateSettings(
    updater: (settings: CognitiveGlowSettings) => void,
  ): Promise<void> {
    const oldSide = this.settings.sidebarSide;
    updater(this.settings);
    this.normalizeWeightSettings(this.settings);
    this.scheduleSave();

    if (this.settings.sidebarSide !== oldSide) {
      // Move the view to the new sidebar side
      this.app.workspace
        .getLeavesOfType(GLOW_VIEW_TYPE)
        .forEach((leaf) => leaf.detach());
      await this.activateView();
    } else {
      this.refreshViews();
    }
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
      const leaf =
        this.settings.sidebarSide === "left"
          ? this.app.workspace.getLeftLeaf(false)
          : this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: GLOW_VIEW_TYPE, active: true });
      }
    } else {
      this.app.workspace.revealLeaf(leaves[0]);
    }
    this.refreshViews();
  }

  /** Returns true if this path should be tracked per current folder settings. */
  private isPathTracked(path: string): boolean {
    const { includedFolders, excludedFolders } = this.settings;

    // Exclusions take priority
    for (const folder of excludedFolders) {
      const prefix = folder.endsWith("/") ? folder : `${folder}/`;
      if (path.startsWith(prefix) || path === folder) {
        return false;
      }
    }

    // If inclusions are specified, path must match at least one
    if (includedFolders.length > 0) {
      for (const folder of includedFolders) {
        const prefix = folder.endsWith("/") ? folder : `${folder}/`;
        if (path.startsWith(prefix) || path === folder) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  private commitPendingOpen(now: number): void {
    if (this.pendingOpen === null) {
      return;
    }
    const { path, openedAt } = this.pendingOpen;
    this.pendingOpen = null;
    const elapsed = now - openedAt;
    const threshold = this.settings.minDwellMs;
    if (threshold === 0 || elapsed >= threshold) {
      updateStatsOnOpen(this.stats, path, openedAt, elapsed);
      this.scheduleSave();
      this.refreshViews();
    }
  }

  private handleFileOpen(file: TFile): void {
    const now = Date.now();

    // Never track Untitled notes
    if (/^Untitled(\s+\d+)?$/.test(file.basename)) {
      return;
    }

    // Commit previous pending open (before replacing it)
    this.commitPendingOpen(now);

    // Only track notes that pass folder scope rules
    if (!this.isPathTracked(file.path)) {
      return;
    }

    if (this.settings.minDwellMs === 0) {
      // Immediate mode: track now without waiting for next open
      updateStatsOnOpen(this.stats, file.path, now);
      this.scheduleSave();
      this.refreshViews();
    } else {
      // Dwell mode: mark as pending, commit when next file opens
      this.pendingOpen = { path: file.path, openedAt: now };
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout != null) {
      window.clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      this.performSave().catch(() => {});
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
      // weights exceeded 1; normalizing silently
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
    new Setting(contentEl)
      .setName("Cognitive glow persisted data (JSON)")
      .setHeading();
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

    const settings = this.plugin.getSettings();

    // ── Display ──────────────────────────────────────────
    new Setting(containerEl).setName("Display").setHeading();

    const decayPresets: Record<string, string> = {
      "86400000": "1 day",
      "259200000": "3 days",
      "604800000": "1 week",
      "2592000000": "1 month",
    };

    new Setting(containerEl)
      .setName("Glow fades after")
      .setDesc(
        "How quickly a note loses its glow when you stop visiting it.",
      )
      .addDropdown((drop) => {
        for (const [val, label] of Object.entries(decayPresets)) {
          drop.addOption(val, label);
        }
        drop.addOption("custom", "Custom (see advanced)");
        const isPreset = String(settings.tauRecencyMs) in decayPresets;
        drop.setValue(
          isPreset ? String(settings.tauRecencyMs) : "custom",
        );
        drop.onChange(async (value) => {
          if (value !== "custom") {
            await this.plugin.updateSettings((next) => {
              next.tauRecencyMs = Number(value);
            });
          }
        });
      });

    new Setting(containerEl)
      .setName("Max notes in focus mode")
      .setDesc("How many top-glowing notes appear in focus mode.")
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
      .setName("Hide faded notes")
      .setDesc("Only show notes with a meaningful glow score.")
      .addToggle((toggle) =>
        toggle
          .setValue(!settings.showArchived)
          .onChange(async (value) => {
            await this.plugin.updateSettings((next) => {
              next.showArchived = !value;
            });
          }),
      );

    new Setting(containerEl)
      .setName("Sidebar placement")
      .setDesc(
        "Which sidebar to open the glow panel in. Takes effect immediately.",
      )
      .addDropdown((drop) =>
        drop
          .addOption("right", "Right (default)")
          .addOption("left", "Left")
          .setValue(settings.sidebarSide)
          .onChange(async (value) => {
            await this.plugin.updateSettings((next) => {
              next.sidebarSide = value as "left" | "right";
            });
          }),
      );

    // ── Tracking ─────────────────────────────────────────
    new Setting(containerEl).setName("Tracking").setHeading();

    new Setting(containerEl)
      .setName("Minimum open time (seconds)")
      .setDesc(
        "A note must stay open this long before it counts as a visit. " +
          "Prevents quick flick-throughs from inflating scores. Set to 0 to count every open instantly.",
      )
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(settings.minDwellMs / 1000))
          .onChange(async (value) => {
            const parsed = Number.parseFloat(value);
            await this.plugin.updateSettings((next) => {
              next.minDwellMs = Number.isNaN(parsed)
                ? 30000
                : Math.max(0, Math.round(parsed * 1000));
            });
          }),
      );

    new Setting(containerEl)
      .setName("Tracked folders")
      .setDesc(
        "Only track notes in these folders (one folder path per line). " +
          "Leave blank to track your entire vault.",
      )
      .addTextArea((area) => {
        area
          .setPlaceholder("Projects/\ndaily/")
          .setValue(settings.includedFolders.join("\n"))
          .onChange(async (value) => {
            await this.plugin.updateSettings((next) => {
              next.includedFolders = value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
            });
          });
        area.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc(
        "Never track notes in these folders (one folder path per line).",
      )
      .addTextArea((area) => {
        area
          .setPlaceholder("Templates/\narchive/")
          .setValue(settings.excludedFolders.join("\n"))
          .onChange(async (value) => {
            await this.plugin.updateSettings((next) => {
              next.excludedFolders = value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
            });
          });
        area.inputEl.rows = 4;
      });

    // ── Advanced (collapsible) ────────────────────────────
    const details = containerEl.createEl("details", {
      cls: "cognitive-glow-advanced-section",
    });
    details.createEl("summary", {
      text: "Advanced",
      cls: "cognitive-glow-advanced-summary",
    });

    new Setting(details)
      .setName("Recency weight")
      .setDesc(
        "How much recent activity contributes to the glow score (0–1). " +
          "Weights are normalized automatically if their sum exceeds 1.",
      )
      .addText((text) =>
        text
          .setPlaceholder("0.6")
          .setValue(String(settings.weightRecency))
          .onChange(async (value) => {
            const v = Number.parseFloat(value);
            await this.plugin.updateSettings((next) => {
              next.weightRecency = Number.isNaN(v)
                ? 0.6
                : Math.min(1, Math.max(0, v));
            });
          }),
      );

    new Setting(details)
      .setName("Frequency weight")
      .setDesc("How much visit frequency contributes to the glow score (0–1).")
      .addText((text) =>
        text
          .setPlaceholder("0.4")
          .setValue(String(settings.weightFrequency))
          .onChange(async (value) => {
            const v = Number.parseFloat(value);
            await this.plugin.updateSettings((next) => {
              next.weightFrequency = Number.isNaN(v)
                ? 0.4
                : Math.min(1, Math.max(0, v));
            });
          }),
      );

    new Setting(details)
      .setName("Manual pin weight")
      .setDesc(
        "How much manually pinned notes are boosted in the score (0–1). " +
          "Pin a note via setManualGravity in the API.",
      )
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(settings.weightGravity))
          .onChange(async (value) => {
            const v = Number.parseFloat(value);
            await this.plugin.updateSettings((next) => {
              next.weightGravity = Number.isNaN(v)
                ? 0
                : Math.min(1, Math.max(0, v));
            });
          }),
      );

    new Setting(details)
      .setName("Frequency scale")
      .setDesc(
        "The number of opens considered 'maximum frequency' for scoring. " +
          "Higher values make frequent opens matter less at the top end.",
      )
      .addText((text) =>
        text
          .setPlaceholder("20")
          .setValue(String(settings.hitCountMaxScale))
          .onChange(async (value) => {
            const v = Number.parseInt(value, 10);
            await this.plugin.updateSettings((next) => {
              next.hitCountMaxScale = Number.isNaN(v) ? 20 : Math.max(1, v);
            });
          }),
      );

    new Setting(details)
      .setName("Max tracked notes")
      .setDesc(
        "Cap on how many notes are kept in memory. 0 = no cap.",
      )
      .addText((text) =>
        text
          .setPlaceholder("3000")
          .setValue(String(settings.maxRecords))
          .onChange(async (value) => {
            const v = Number.parseInt(value, 10);
            await this.plugin.updateSettings((next) => {
              next.maxRecords = Number.isNaN(v) ? 3000 : Math.max(0, v);
            });
          }),
      );

    new Setting(details)
      .setName("Recency decay (ms)")
      .setDesc(
        "Raw time constant for the exponential recency decay in milliseconds. " +
          "Overrides the 'Glow fades after' dropdown.",
      )
      .addText((text) =>
        text
          .setPlaceholder("259200000")
          .setValue(String(settings.tauRecencyMs))
          .onChange(async (value) => {
            const v = Number.parseFloat(value);
            await this.plugin.updateSettings((next) => {
              next.tauRecencyMs = Number.isNaN(v) ? 259200000 : Math.max(1, v);
            });
          }),
      );
  }
}
