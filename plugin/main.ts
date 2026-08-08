import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
  type SettingDefinitionItem,
  type WorkspaceLeaf,
} from "obsidian";

import {
  computeAllGlowRecords,
  migrateStatsOnRename,
  removeStatsOnDelete,
  updateStatsOnOpen,
} from "../core/metrics";
import {
  CURRENT_VERSION,
  loadAllStats,
  saveAllStats,
} from "../core/store";
import type { GlowRecord, PersistedData, StatsIndex } from "../core/types";
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
  // Public typed override of Plugin.settings (added in Obsidian 1.13.0);
  // the base class declares it `settings?: unknown` and the settings
  // framework reads it by convention. Mutate via updateSettings() only.
  settings: CognitiveGlowSettings = { ...DEFAULT_SETTINGS };
  private saveTimeout: number | null = null;
  private pendingOpen: PendingOpen | null = null;
  private dwellTimer: number | null = null;

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
      this.activateView().catch((e: unknown) => console.error("Cognitive Glow: failed to activate view", e));
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
        this.activateView().catch((e: unknown) => console.error("Cognitive Glow: failed to activate view", e));
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

    this.addCommand({
      id: "toggle-pin-active-note",
      name: "Pin or unpin active note",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          return false;
        }
        if (!checking) {
          this.togglePin(file.path);
        }
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }
        const pinned = this.isPinned(file.path);
        menu.addItem((item) =>
          item
            .setTitle(pinned ? "Unpin from glow" : "Pin for glow")
            .setIcon("sparkles")
            .onClick(() => this.togglePin(file.path)),
        );
      }),
    );

    this.addSettingTab(new CognitiveGlowSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.activateView().catch((e: unknown) => console.error("Cognitive Glow: failed to activate view", e));
    });
  }

  onunload(): void {
    // Commit any pending dwell visit before unloading (also cancels dwellTimer)
    this.commitPendingOpen(Date.now());

    if (this.saveTimeout != null) {
      window.clearTimeout(this.saveTimeout);
      // Flush immediately rather than letting the debounce lapse
      this.performSave().catch((e: unknown) => console.error("Cognitive Glow: failed to save data", e));
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
    const existing = this.stats.notes[path];
    if (existing) {
      existing.manualGravity = clamped;
      // Drop records that no longer carry any signal: never opened and unpinned.
      if (existing.hitCount === 0 && clamped === 0) {
        delete this.stats.notes[path];
      }
    } else if (clamped > 0) {
      // New pin-only record: no open history. hitCount stays 0 so scoring
      // contributes no recency — the pin's only effect is via gravity weight.
      this.stats.notes[path] = {
        path,
        hitCount: 0,
        lastOpened: Date.now(),
        manualGravity: clamped,
      };
    }
    // Unpinning a note with no record is a no-op.
    this.scheduleSave();
    this.refreshViews();
  }

  async updateSettings(
    updater: (settings: CognitiveGlowSettings) => void,
  ): Promise<void> {
    const oldSide = this.settings.sidebarSide;
    const oldDwellMs = this.settings.minDwellMs;
    updater(this.settings);
    this.normalizeWeightSettings(this.settings);
    this.scheduleSave();

    // If the dwell threshold changed while a note is already pending,
    // reschedule the timer so the new threshold is respected.
    if (this.settings.minDwellMs !== oldDwellMs && this.pendingOpen !== null) {
      this.cancelDwellTimer();
      const elapsed = Date.now() - this.pendingOpen.openedAt;
      const remaining = this.settings.minDwellMs - elapsed;
      if (remaining <= 0) {
        // Already exceeds new threshold — commit now
        this.commitPendingOpen(Date.now());
      } else {
        this.dwellTimer = window.setTimeout(() => {
          this.dwellTimer = null;
          this.commitPendingOpen(Date.now());
        }, remaining);
      }
    }

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
      void this.app.workspace.revealLeaf(leaves[0]);
    }
    this.refreshViews();
  }

  /** Returns true if this path should be tracked per current folder settings. */
  private isPathTracked(path: string): boolean {
    const { includedFolders, excludedFolders } = this.settings;

    // Normalize user-typed folder paths so backslashes, redundant slashes,
    // and stray whitespace match the vault's forward-slash paths. Obsidian's
    // submission review flags raw, unnormalized user paths.
    const matchesFolder = (folder: string): boolean => {
      const normalized = normalizePath(folder);
      if (normalized === "" || normalized === "/") {
        return false;
      }
      return path === normalized || path.startsWith(`${normalized}/`);
    };

    // Exclusions take priority
    if (excludedFolders.some(matchesFolder)) {
      return false;
    }

    // If inclusions are specified, path must match at least one
    if (includedFolders.length > 0) {
      return includedFolders.some(matchesFolder);
    }

    return true;
  }

  /** A note is "pinned" when it carries a positive manual gravity boost. */
  private isPinned(path: string): boolean {
    const stats = this.stats.notes[path];
    return (
      stats !== undefined &&
      typeof stats.manualGravity === "number" &&
      stats.manualGravity > 0
    );
  }

  /** Toggle the pin state of a note, with a hint if pins are currently inert. */
  private togglePin(path: string): void {
    const pinned = this.isPinned(path);
    this.setManualGravity(path, pinned ? 0 : 1);
    if (pinned) {
      new Notice("Cognitive glow: note unpinned.");
    } else if (this.settings.weightGravity === 0) {
      new Notice(
        "Cognitive glow: note pinned. Raise the manual pin weight in advanced settings for pins to affect glow.",
      );
    } else {
      new Notice("Cognitive glow: note pinned.");
    }
  }

  private cancelDwellTimer(): void {
    if (this.dwellTimer !== null) {
      window.clearTimeout(this.dwellTimer);
      this.dwellTimer = null;
    }
  }

  private commitPendingOpen(now: number): void {
    this.cancelDwellTimer();
    if (this.pendingOpen === null) {
      return;
    }
    const { path, openedAt } = this.pendingOpen;
    this.pendingOpen = null;
    const elapsed = now - openedAt;
    const threshold = this.settings.minDwellMs;
    if ((threshold === 0 || elapsed >= threshold) && this.isPathTracked(path)) {
      updateStatsOnOpen(this.stats, path, openedAt, elapsed);
      this.scheduleSave();
      this.refreshViews();
    }
  }

  private handleFileOpen(file: TFile): void {
    const now = Date.now();

    // Commit previous pending open before doing anything else, so switching
    // to an Untitled note (or an excluded folder) doesn't leave the prior
    // note's dwell timer running indefinitely.
    this.commitPendingOpen(now);

    // Never track Untitled notes
    if (/^Untitled(\s+\d+)?$/.test(file.basename)) {
      return;
    }

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
      // Dwell mode: mark as pending and schedule a threshold-time commit so
      // the visit is recorded even if no subsequent file-open event occurs
      // (long reading sessions, unexpected shutdowns after threshold, etc.).
      this.pendingOpen = { path: file.path, openedAt: now };
      this.dwellTimer = window.setTimeout(() => {
        this.dwellTimer = null;
        this.commitPendingOpen(Date.now());
      }, this.settings.minDwellMs);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout != null) {
      window.clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      this.performSave().catch((e: unknown) => console.error("Cognitive Glow: failed to save data", e));
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

/** Preset durations for the "Glow fades after" dropdown, ms → label. */
const DECAY_PRESETS: Record<string, string> = {
  "86400000": "1 day",
  "259200000": "3 days",
  "604800000": "1 week",
  "2592000000": "1 month",
};

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseFolderList(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Settings are declared once in buildSettingDefinitions() and rendered by
 * two paths: Obsidian ≥ 1.13.0 consumes getSettingDefinitions() natively
 * (which also makes every setting findable via settings search), while
 * older versions fall back to display(), which interprets the same
 * definitions imperatively. Reads and writes for both paths go through
 * getControlValue()/setControlValue(), including the virtual keys that
 * translate between control values and stored settings (hideFaded,
 * minDwellSeconds, the folder textareas, and the decay preset dropdown).
 */
class CognitiveGlowSettingTab extends PluginSettingTab {
  private plugin: CognitiveGlowPlugin;

  constructor(app: App, plugin: CognitiveGlowPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.buildSettingDefinitions();
  }

  getControlValue(key: string): unknown {
    const settings = this.plugin.getSettings();
    switch (key) {
      case "tauRecencyPreset":
        return String(settings.tauRecencyMs) in DECAY_PRESETS
          ? String(settings.tauRecencyMs)
          : "custom";
      case "focusTopN":
        return settings.focusTopN;
      case "hideFaded":
        return !settings.showArchived;
      case "sidebarSide":
        return settings.sidebarSide;
      case "minDwellSeconds":
        return settings.minDwellMs / 1000;
      case "includedFoldersText":
        return settings.includedFolders.join("\n");
      case "excludedFoldersText":
        return settings.excludedFolders.join("\n");
      case "weightRecency":
        return settings.weightRecency;
      case "weightFrequency":
        return settings.weightFrequency;
      case "weightGravity":
        return settings.weightGravity;
      case "hitCountMaxScale":
        return settings.hitCountMaxScale;
      case "maxRecords":
        return settings.maxRecords;
      case "tauRecencyMs":
        return settings.tauRecencyMs;
      default:
        return undefined;
    }
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    await this.plugin.updateSettings((next) => {
      switch (key) {
        case "tauRecencyPreset":
          // "Custom" is a display state, not a value — selecting it keeps
          // whatever raw constant the advanced setting holds.
          if (typeof value === "string" && value in DECAY_PRESETS) {
            next.tauRecencyMs = Number(value);
          }
          break;
        case "focusTopN":
          next.focusTopN = Math.max(
            1,
            Math.round(toFiniteNumber(value, DEFAULT_SETTINGS.focusTopN)),
          );
          break;
        case "hideFaded":
          next.showArchived = value !== true;
          break;
        case "sidebarSide":
          next.sidebarSide = value === "left" ? "left" : "right";
          break;
        case "minDwellSeconds":
          next.minDwellMs = Math.max(
            0,
            Math.round(
              toFiniteNumber(value, DEFAULT_SETTINGS.minDwellMs / 1000) * 1000,
            ),
          );
          break;
        case "includedFoldersText":
          next.includedFolders = parseFolderList(value);
          break;
        case "excludedFoldersText":
          next.excludedFolders = parseFolderList(value);
          break;
        case "weightRecency":
          next.weightRecency = clamp01(
            toFiniteNumber(value, DEFAULT_SETTINGS.weightRecency),
          );
          break;
        case "weightFrequency":
          next.weightFrequency = clamp01(
            toFiniteNumber(value, DEFAULT_SETTINGS.weightFrequency),
          );
          break;
        case "weightGravity":
          next.weightGravity = clamp01(
            toFiniteNumber(value, DEFAULT_SETTINGS.weightGravity),
          );
          break;
        case "hitCountMaxScale":
          next.hitCountMaxScale = Math.max(
            1,
            Math.round(toFiniteNumber(value, DEFAULT_SETTINGS.hitCountMaxScale)),
          );
          break;
        case "maxRecords":
          next.maxRecords = Math.max(
            0,
            Math.round(toFiniteNumber(value, DEFAULT_SETTINGS.maxRecords)),
          );
          break;
        case "tauRecencyMs":
          next.tauRecencyMs = Math.max(
            1,
            toFiniteNumber(value, DEFAULT_SETTINGS.tauRecencyMs),
          );
          break;
        default:
          break;
      }
    });
  }

  private buildSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "Display",
        items: [
          {
            name: "Glow fades after",
            desc: "How quickly a note loses its glow when you stop visiting it.",
            control: {
              type: "dropdown",
              key: "tauRecencyPreset",
              options: { ...DECAY_PRESETS, custom: "Custom (see advanced)" },
            },
          },
          {
            name: "Max notes in focus mode",
            desc: "How many top-glowing notes appear in focus mode.",
            control: {
              type: "number",
              key: "focusTopN",
              placeholder: "5",
              defaultValue: DEFAULT_SETTINGS.focusTopN,
              min: 1,
              step: 1,
            },
          },
          {
            name: "Hide faded notes",
            desc: "Only show notes with a meaningful glow score.",
            control: { type: "toggle", key: "hideFaded", defaultValue: false },
          },
          {
            name: "Sidebar placement",
            desc: "Which sidebar to open the glow panel in. Takes effect immediately.",
            control: {
              type: "dropdown",
              key: "sidebarSide",
              options: { right: "Right (default)", left: "Left" },
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Tracking",
        items: [
          {
            name: "Minimum open time (seconds)",
            desc:
              "A note must stay open this long before it counts as a visit. " +
              "Prevents quick flick-throughs from inflating scores. Set to 0 to count every open instantly.",
            control: {
              type: "number",
              key: "minDwellSeconds",
              placeholder: "30",
              defaultValue: DEFAULT_SETTINGS.minDwellMs / 1000,
              min: 0,
              step: "any",
            },
          },
          {
            name: "Tracked folders",
            desc:
              "Only track notes in these folders (one folder path per line). " +
              "Leave blank to track your entire vault.",
            control: {
              type: "textarea",
              key: "includedFoldersText",
              placeholder: "Projects/\ndaily/",
              rows: 4,
            },
          },
          {
            name: "Excluded folders",
            desc: "Never track notes in these folders (one folder path per line).",
            control: {
              type: "textarea",
              key: "excludedFoldersText",
              placeholder: "Templates/\narchive/",
              rows: 4,
            },
          },
        ],
      },
      {
        type: "page",
        name: "Advanced",
        desc: "Scoring weights and raw tuning constants.",
        items: [
          {
            name: "Recency weight",
            desc:
              "How much recent activity contributes to the glow score (0–1). " +
              "Weights are normalized automatically if their sum exceeds 1.",
            control: {
              type: "number",
              key: "weightRecency",
              placeholder: "0.6",
              defaultValue: DEFAULT_SETTINGS.weightRecency,
              min: 0,
              max: 1,
              step: "any",
            },
          },
          {
            name: "Frequency weight",
            desc: "How much visit frequency contributes to the glow score (0–1).",
            control: {
              type: "number",
              key: "weightFrequency",
              placeholder: "0.4",
              defaultValue: DEFAULT_SETTINGS.weightFrequency,
              min: 0,
              max: 1,
              step: "any",
            },
          },
          {
            name: "Manual pin weight",
            desc:
              "How much manually pinned notes are boosted in the score (0–1). " +
              "Pin a note via setManualGravity in the API.",
            control: {
              type: "number",
              key: "weightGravity",
              placeholder: "0",
              defaultValue: DEFAULT_SETTINGS.weightGravity,
              min: 0,
              max: 1,
              step: "any",
            },
          },
          {
            name: "Frequency scale",
            desc:
              "The number of opens considered 'maximum frequency' for scoring. " +
              "Higher values make frequent opens matter less at the top end.",
            control: {
              type: "number",
              key: "hitCountMaxScale",
              placeholder: "20",
              defaultValue: DEFAULT_SETTINGS.hitCountMaxScale,
              min: 1,
              step: 1,
            },
          },
          {
            name: "Max tracked notes",
            desc: "Cap on how many notes are kept in memory. 0 = no cap.",
            control: {
              type: "number",
              key: "maxRecords",
              placeholder: "3000",
              defaultValue: DEFAULT_SETTINGS.maxRecords,
              min: 0,
              step: 1,
            },
          },
          {
            name: "Recency decay (ms)",
            desc:
              "Raw time constant for the exponential recency decay in milliseconds. " +
              "Overrides the 'Glow fades after' dropdown.",
            control: {
              type: "number",
              key: "tauRecencyMs",
              placeholder: "259200000",
              defaultValue: DEFAULT_SETTINGS.tauRecencyMs,
              min: 1,
              step: "any",
            },
          },
        ],
      },
    ];
  }

  /**
   * Fallback renderer for Obsidian < 1.13.0, which never calls
   * getSettingDefinitions(). Newer versions render the definitions
   * declaratively and skip display() entirely. Both paths are driven by
   * buildSettingDefinitions(), so they cannot drift apart.
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    for (const item of this.buildSettingDefinitions()) {
      if (!("type" in item)) {
        this.renderLegacySetting(containerEl, item);
        continue;
      }
      if (item.type === "page") {
        // Pages render as the pre-1.13 collapsible advanced section.
        const details = containerEl.createEl("details", {
          cls: "cognitive-glow-advanced-section",
        });
        details.createEl("summary", {
          text: item.name,
          cls: "cognitive-glow-advanced-summary",
        });
        for (const child of item.items ?? []) {
          this.renderLegacySetting(details, child);
        }
      } else {
        if (item.heading !== undefined) {
          new Setting(containerEl).setName(item.heading).setHeading();
        }
        for (const child of item.items ?? []) {
          this.renderLegacySetting(containerEl, child);
        }
      }
    }
  }

  private renderLegacySetting(
    containerEl: HTMLElement,
    def: SettingDefinitionItem,
  ): void {
    if (!("control" in def) || def.control === undefined) {
      return;
    }
    const control = def.control;
    const setting = new Setting(containerEl).setName(def.name);
    if (typeof def.desc === "string") {
      setting.setDesc(def.desc);
    }
    switch (control.type) {
      case "toggle":
        setting.addToggle((toggle) =>
          toggle
            .setValue(this.getControlValue(control.key) === true)
            .onChange(async (value) => {
              await this.setControlValue(control.key, value);
            }),
        );
        break;
      case "dropdown":
        setting.addDropdown((drop) => {
          for (const [optionValue, label] of Object.entries(control.options)) {
            drop.addOption(optionValue, label);
          }
          const current = this.getControlValue(control.key);
          drop.setValue(typeof current === "string" ? current : "");
          drop.onChange(async (value) => {
            await this.setControlValue(control.key, value);
          });
        });
        break;
      case "number":
        setting.addText((text) => {
          const current = this.getControlValue(control.key);
          text
            .setPlaceholder(control.placeholder ?? "")
            .setValue(typeof current === "number" ? String(current) : "")
            .onChange(async (value) => {
              await this.setControlValue(
                control.key,
                Number.parseFloat(value),
              );
            });
        });
        break;
      case "textarea":
        setting.addTextArea((area) => {
          const current = this.getControlValue(control.key);
          area
            .setPlaceholder(control.placeholder ?? "")
            .setValue(typeof current === "string" ? current : "")
            .onChange(async (value) => {
              await this.setControlValue(control.key, value);
            });
          if (control.rows !== undefined) {
            area.inputEl.rows = control.rows;
          }
        });
        break;
      default:
        // Control types this plugin doesn't declare (text, slider, file,
        // folder, color) have no legacy rendering.
        break;
    }
  }
}
