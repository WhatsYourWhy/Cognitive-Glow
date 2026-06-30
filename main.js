"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugin/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CognitiveGlowPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// core/metrics.ts
function updateStatsOnOpen(index, path, now, dwellMs) {
  var _a, _b;
  const existing = (_a = index.notes[path]) != null ? _a : {
    path,
    hitCount: 0,
    lastOpened: now
  };
  existing.hitCount += 1;
  existing.lastOpened = now;
  if (dwellMs !== void 0) {
    existing.dwellMs = ((_b = existing.dwellMs) != null ? _b : 0) + dwellMs;
  }
  index.notes[path] = existing;
}
function migrateStatsOnRename(index, oldPath, newPath) {
  if (oldPath === newPath) {
    return;
  }
  const existing = index.notes[oldPath];
  if (!existing) {
    return;
  }
  delete index.notes[oldPath];
  existing.path = newPath;
  index.notes[newPath] = existing;
}
function removeStatsOnDelete(index, path) {
  if (index.notes[path]) {
    delete index.notes[path];
  }
}
function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
}
function computeGlowScore(stats, config, now, fallbackMtime) {
  var _a, _b;
  const recencyAnchor = (_b = (_a = stats.lastOpened) != null ? _a : fallbackMtime) != null ? _b : now;
  const dt = Math.max(0, now - recencyAnchor);
  const recency = Math.exp(-dt / config.tauRecencyMs);
  const denom = Math.log(1 + config.hitCountMaxScale);
  const freq = denom > 0 ? Math.log(1 + stats.hitCount) / denom : 0;
  const gravity = typeof stats.manualGravity === "number" ? clamp(0, 1, stats.manualGravity) : 0;
  return clamp(
    0,
    1,
    config.weightRecency * recency + config.weightFrequency * freq + config.weightGravity * gravity
  );
}
function computeAllGlowRecords(index, config, now, fallbackMtimeForPath) {
  return Object.values(index.notes).map((stats) => ({
    path: stats.path,
    glowScore: computeGlowScore(
      stats,
      config,
      now,
      fallbackMtimeForPath == null ? void 0 : fallbackMtimeForPath(stats.path)
    )
  }));
}

// core/store.ts
var CURRENT_VERSION = 2;
var EMPTY_STATS = {
  version: CURRENT_VERSION,
  notes: {}
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isStatsIndex(value) {
  return isRecord(value) && "notes" in value && isRecord(value.notes);
}
function isPersistedData(value) {
  return isRecord(value) && "version" in value && "stats" in value && "settings" in value;
}
function ensureStatsIndex(raw, fallbackMtimeForPath, now = Date.now()) {
  var _a;
  if (!isRecord(raw)) {
    return EMPTY_STATS;
  }
  const notesSource = isRecord(raw.notes) ? raw.notes : raw;
  if (!isRecord(notesSource)) {
    return EMPTY_STATS;
  }
  const version = typeof raw.version === "number" ? raw.version : CURRENT_VERSION;
  const normalizedNotes = {};
  for (const [key, value] of Object.entries(notesSource)) {
    if (!isRecord(value)) {
      continue;
    }
    const path = typeof value.path === "string" ? value.path : key;
    const hitCount = typeof value.hitCount === "number" ? value.hitCount : 0;
    const lastOpened = typeof value.lastOpened === "number" ? value.lastOpened : (_a = fallbackMtimeForPath == null ? void 0 : fallbackMtimeForPath(path)) != null ? _a : now;
    const manualGravity = typeof value.manualGravity === "number" ? value.manualGravity : void 0;
    const dwellMs = typeof value.dwellMs === "number" ? value.dwellMs : void 0;
    normalizedNotes[path] = {
      path,
      hitCount,
      lastOpened,
      manualGravity,
      dwellMs
    };
  }
  return {
    version,
    notes: normalizedNotes
  };
}
function migrateFromStatsIndex(stats, defaultSettings) {
  return {
    version: CURRENT_VERSION,
    stats,
    settings: { ...defaultSettings }
  };
}
function ensurePersistedData(raw, defaultSettings, fallbackMtimeForPath, now = Date.now()) {
  var _a;
  const data = isRecord(raw) ? raw : {};
  const stats = ensureStatsIndex(
    (_a = data.stats) != null ? _a : raw,
    fallbackMtimeForPath,
    now
  );
  const settings = {
    ...defaultSettings,
    ...isRecord(data.settings) ? data.settings : {}
  };
  const version = typeof data.version === "number" ? data.version : CURRENT_VERSION;
  return {
    version,
    stats,
    settings
  };
}
async function loadAllStats(loadData, defaultSettings, fallbackMtimeForPath) {
  const raw = await loadData();
  if (isStatsIndex(raw) && !isPersistedData(raw)) {
    const stats = ensureStatsIndex(raw, fallbackMtimeForPath);
    return migrateFromStatsIndex(stats, defaultSettings);
  }
  return ensurePersistedData(raw, defaultSettings, fallbackMtimeForPath);
}
async function saveAllStats(saveData, data) {
  const payload = {
    version: typeof data.version === "number" ? data.version : CURRENT_VERSION,
    stats: data.stats,
    settings: data.settings
  };
  await saveData(payload);
}

// plugin/settings.ts
var DEFAULT_SETTINGS = {
  tauRecencyMs: 3 * 24 * 60 * 60 * 1e3,
  hitCountMaxScale: 20,
  weightRecency: 0.6,
  weightFrequency: 0.4,
  weightGravity: 0,
  focusTopN: 5,
  showArchived: true,
  maxRecords: 3e3,
  sidebarSide: "right",
  minDwellMs: 3e4,
  includedFolders: [],
  excludedFolders: []
};

// ui/glowView.ts
var import_obsidian = require("obsidian");
var GLOW_VIEW_TYPE = "cognitive-glow-view";
var LOW_GLOW_THRESHOLD = 0.05;
var GlowView = class extends import_obsidian.ItemView {
  constructor(leaf, options) {
    super(leaf);
    this.isFocusMode = false;
    this.options = options;
  }
  getViewType() {
    return GLOW_VIEW_TYPE;
  }
  getDisplayText() {
    return "Cognitive glow";
  }
  getIcon() {
    return "sparkles";
  }
  onOpen() {
    this.render();
    return Promise.resolve();
  }
  onClose() {
    this.contentEl.empty();
    return Promise.resolve();
  }
  render() {
    const { getRecords, getSettings } = this.options;
    const container = this.contentEl;
    container.empty();
    const settings = getSettings();
    const header = container.createDiv({ cls: "cognitive-glow-header" });
    header.createEl("h3", { text: "Cognitive glow" });
    const modeControls = header.createDiv({
      cls: "cognitive-glow-mode-controls"
    });
    const normalButton = modeControls.createEl("button", {
      cls: "cognitive-glow-toggle",
      text: "Normal"
    });
    const focusButton = modeControls.createEl("button", {
      cls: "cognitive-glow-toggle",
      text: "Focus"
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
        (record) => record.glowScore >= LOW_GLOW_THRESHOLD
      );
    }
    if (this.isFocusMode) {
      const topN = Math.max(1, Math.floor(settings.focusTopN));
      records = records.slice(0, topN);
      header.createEl("p", {
        cls: "cognitive-glow-mode",
        text: `Top ${topN} notes by glow`
      });
    } else {
      header.createEl("p", {
        cls: "cognitive-glow-mode",
        text: "All notes by glow score"
      });
    }
    const maxRecords = Math.max(0, Math.floor(settings.maxRecords));
    if (maxRecords > 0) {
      records = records.slice(0, maxRecords);
    }
    if (records.length === 0) {
      list.createEl("p", {
        cls: "cognitive-glow-empty",
        text: "No glow data yet \u2014 open some notes to get started."
      });
      return;
    }
    records.forEach((record) => {
      const glowScore = Math.min(1, Math.max(0, record.glowScore));
      const parts = record.path.split("/");
      const filename = parts[parts.length - 1];
      const displayName = filename.endsWith(".md") ? filename.slice(0, -3) : filename;
      const row = list.createDiv({ cls: "cognitive-glow-row" });
      row.style.setProperty("--glow-score", glowScore.toFixed(3));
      row.setAttr("title", record.path);
      row.addEventListener("click", () => {
        this.app.workspace.openLinkText(record.path, "", false).catch((e) => console.error("Cognitive Glow: failed to open note", e));
      });
      const label = row.createDiv({ cls: "cognitive-glow-label" });
      label.setText(displayName);
    });
  }
};

// plugin/main.ts
var CognitiveGlowPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.stats = { version: CURRENT_VERSION, notes: {} };
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveTimeout = null;
    this.pendingOpen = null;
    this.dwellTimer = null;
  }
  async onload() {
    const persisted = await loadAllStats(
      () => this.loadData(),
      DEFAULT_SETTINGS,
      (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof import_obsidian2.TFile) {
          return file.stat.mtime;
        }
        return void 0;
      }
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
      (leaf) => new GlowView(leaf, {
        getRecords: () => this.getGlowRecords(),
        getSettings: () => this.getSettings()
      })
    );
    this.addRibbonIcon("sparkles", "Cognitive glow", () => {
      this.activateView().catch((e) => console.error("Cognitive Glow: failed to activate view", e));
    });
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof import_obsidian2.TFile) {
          this.handleFileOpen(file);
        } else {
          this.commitPendingOpen(Date.now());
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        var _a;
        if (file instanceof import_obsidian2.TFile) {
          migrateStatsOnRename(this.stats, oldPath, file.path);
          if (((_a = this.pendingOpen) == null ? void 0 : _a.path) === oldPath) {
            this.pendingOpen.path = file.path;
          }
          this.scheduleSave();
          this.refreshViews();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        var _a;
        if (file instanceof import_obsidian2.TFile) {
          removeStatsOnDelete(this.stats, file.path);
          if (((_a = this.pendingOpen) == null ? void 0 : _a.path) === file.path) {
            this.pendingOpen = null;
          }
          this.scheduleSave();
          this.refreshViews();
        }
      })
    );
    this.addCommand({
      id: "open-glow-sidebar",
      name: "Open sidebar",
      callback: () => {
        this.activateView().catch((e) => console.error("Cognitive Glow: failed to activate view", e));
      }
    });
    this.addCommand({
      id: "dump-scores",
      name: "Dump glow scores to console",
      callback: () => {
        const records = this.getGlowRecords().sort((a, b) => b.glowScore - a.glowScore).slice(0, 20);
        console.debug("Cognitive Glow \u2013 Top Notes:", records);
      }
    });
    this.addCommand({
      id: "show-persisted-data",
      name: "Show persisted data (JSON)",
      callback: () => {
        const payload = this.getPersistedData();
        const serialized = JSON.stringify(payload, null, 2);
        new PersistedDataModal(this.app, serialized).open();
      }
    });
    this.addCommand({
      id: "toggle-pin-active-note",
      name: "Pin or unpin active note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          return false;
        }
        if (!checking) {
          this.togglePin(file.path);
        }
        return true;
      }
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof import_obsidian2.TFile) || file.extension !== "md") {
          return;
        }
        const pinned = this.isPinned(file.path);
        menu.addItem(
          (item) => item.setTitle(pinned ? "Unpin from glow" : "Pin for glow").setIcon("sparkles").onClick(() => this.togglePin(file.path))
        );
      })
    );
    this.addSettingTab(new CognitiveGlowSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      this.activateView().catch((e) => console.error("Cognitive Glow: failed to activate view", e));
    });
  }
  onunload() {
    this.commitPendingOpen(Date.now());
    if (this.saveTimeout != null) {
      window.clearTimeout(this.saveTimeout);
      this.performSave().catch((e) => console.error("Cognitive Glow: failed to save data", e));
    }
    this.saveTimeout = null;
  }
  getGlowRecords() {
    const now = Date.now();
    const records = computeAllGlowRecords(
      this.stats,
      this.settings,
      now,
      (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof import_obsidian2.TFile) {
          return file.stat.mtime;
        }
        return void 0;
      }
    ).filter((record) => this.isPathTracked(record.path));
    const maxRecords = Math.max(0, Math.floor(this.settings.maxRecords));
    if (maxRecords > 0 && records.length > maxRecords) {
      return records.slice().sort((a, b) => b.glowScore - a.glowScore).slice(0, maxRecords);
    }
    return records;
  }
  getSettings() {
    return this.settings;
  }
  setManualGravity(path, value) {
    var _a;
    if (!Number.isFinite(value)) {
      return;
    }
    const clamped = Math.max(0, Math.min(1, value));
    const now = Date.now();
    const existing = (_a = this.stats.notes[path]) != null ? _a : {
      path,
      hitCount: 0,
      lastOpened: now
    };
    existing.manualGravity = clamped;
    this.stats.notes[path] = existing;
    this.scheduleSave();
    this.refreshViews();
  }
  async updateSettings(updater) {
    const oldSide = this.settings.sidebarSide;
    const oldDwellMs = this.settings.minDwellMs;
    updater(this.settings);
    this.normalizeWeightSettings(this.settings);
    this.scheduleSave();
    if (this.settings.minDwellMs !== oldDwellMs && this.pendingOpen !== null) {
      this.cancelDwellTimer();
      const elapsed = Date.now() - this.pendingOpen.openedAt;
      const remaining = this.settings.minDwellMs - elapsed;
      if (remaining <= 0) {
        this.commitPendingOpen(Date.now());
      } else {
        this.dwellTimer = window.setTimeout(() => {
          this.dwellTimer = null;
          this.commitPendingOpen(Date.now());
        }, remaining);
      }
    }
    if (this.settings.sidebarSide !== oldSide) {
      this.app.workspace.getLeavesOfType(GLOW_VIEW_TYPE).forEach((leaf) => leaf.detach());
      await this.activateView();
    } else {
      this.refreshViews();
    }
  }
  refreshViews() {
    this.app.workspace.getLeavesOfType(GLOW_VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof GlowView) {
        view.render();
      }
    });
  }
  async activateView() {
    const leaves = this.app.workspace.getLeavesOfType(GLOW_VIEW_TYPE);
    if (leaves.length === 0) {
      const leaf = this.settings.sidebarSide === "left" ? this.app.workspace.getLeftLeaf(false) : this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: GLOW_VIEW_TYPE, active: true });
      }
    } else {
      void this.app.workspace.revealLeaf(leaves[0]);
    }
    this.refreshViews();
  }
  /** Returns true if this path should be tracked per current folder settings. */
  isPathTracked(path) {
    const { includedFolders, excludedFolders } = this.settings;
    const matchesFolder = (folder) => {
      const normalized = (0, import_obsidian2.normalizePath)(folder);
      if (normalized === "" || normalized === "/") {
        return false;
      }
      return path === normalized || path.startsWith(`${normalized}/`);
    };
    if (excludedFolders.some(matchesFolder)) {
      return false;
    }
    if (includedFolders.length > 0) {
      return includedFolders.some(matchesFolder);
    }
    return true;
  }
  /** A note is "pinned" when it carries a positive manual gravity boost. */
  isPinned(path) {
    const stats = this.stats.notes[path];
    return stats !== void 0 && typeof stats.manualGravity === "number" && stats.manualGravity > 0;
  }
  /** Toggle the pin state of a note, with a hint if pins are currently inert. */
  togglePin(path) {
    const pinned = this.isPinned(path);
    this.setManualGravity(path, pinned ? 0 : 1);
    if (pinned) {
      new import_obsidian2.Notice("Cognitive glow: note unpinned.");
    } else if (this.settings.weightGravity === 0) {
      new import_obsidian2.Notice(
        "Cognitive glow: note pinned. Raise the manual pin weight in advanced settings for pins to affect glow."
      );
    } else {
      new import_obsidian2.Notice("Cognitive glow: note pinned.");
    }
  }
  cancelDwellTimer() {
    if (this.dwellTimer !== null) {
      window.clearTimeout(this.dwellTimer);
      this.dwellTimer = null;
    }
  }
  commitPendingOpen(now) {
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
  handleFileOpen(file) {
    const now = Date.now();
    this.commitPendingOpen(now);
    if (/^Untitled(\s+\d+)?$/.test(file.basename)) {
      return;
    }
    if (!this.isPathTracked(file.path)) {
      return;
    }
    if (this.settings.minDwellMs === 0) {
      updateStatsOnOpen(this.stats, file.path, now);
      this.scheduleSave();
      this.refreshViews();
    } else {
      this.pendingOpen = { path: file.path, openedAt: now };
      this.dwellTimer = window.setTimeout(() => {
        this.dwellTimer = null;
        this.commitPendingOpen(Date.now());
      }, this.settings.minDwellMs);
    }
  }
  scheduleSave() {
    if (this.saveTimeout != null) {
      window.clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      this.performSave().catch((e) => console.error("Cognitive Glow: failed to save data", e));
    }, 5e3);
  }
  async performSave() {
    this.saveTimeout = null;
    const payload = this.getPersistedData();
    await saveAllStats((data) => this.saveData(data), payload);
  }
  getPersistedData() {
    return {
      version: CURRENT_VERSION,
      stats: this.stats,
      settings: this.settings
    };
  }
  normalizeWeightSettings(settings) {
    const clamp2 = (value) => Math.min(1, Math.max(0, value));
    let nextRecency = clamp2(settings.weightRecency);
    let nextFrequency = clamp2(settings.weightFrequency);
    let nextGravity = clamp2(settings.weightGravity);
    let changed = nextRecency !== settings.weightRecency || nextFrequency !== settings.weightFrequency || nextGravity !== settings.weightGravity;
    const total = nextRecency + nextFrequency + nextGravity;
    if (total > 1) {
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
};
var PersistedDataModal = class extends import_obsidian2.Modal {
  constructor(app, serializedData) {
    super(app);
    this.serializedData = serializedData;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    new import_obsidian2.Setting(contentEl).setName("Cognitive glow persisted data (JSON)").setHeading();
    const pre = contentEl.createEl("pre");
    pre.textContent = this.serializedData;
  }
};
var CognitiveGlowSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.getSettings();
    new import_obsidian2.Setting(containerEl).setName("Display").setHeading();
    const decayPresets = {
      "86400000": "1 day",
      "259200000": "3 days",
      "604800000": "1 week",
      "2592000000": "1 month"
    };
    new import_obsidian2.Setting(containerEl).setName("Glow fades after").setDesc(
      "How quickly a note loses its glow when you stop visiting it."
    ).addDropdown((drop) => {
      for (const [val, label] of Object.entries(decayPresets)) {
        drop.addOption(val, label);
      }
      drop.addOption("custom", "Custom (see advanced)");
      const isPreset = String(settings.tauRecencyMs) in decayPresets;
      drop.setValue(
        isPreset ? String(settings.tauRecencyMs) : "custom"
      );
      drop.onChange(async (value) => {
        if (value !== "custom") {
          await this.plugin.updateSettings((next) => {
            next.tauRecencyMs = Number(value);
          });
        }
      });
    });
    new import_obsidian2.Setting(containerEl).setName("Max notes in focus mode").setDesc("How many top-glowing notes appear in focus mode.").addText(
      (text) => text.setPlaceholder("5").setValue(String(settings.focusTopN)).onChange(async (value) => {
        const n = Number.parseInt(value, 10);
        await this.plugin.updateSettings((next) => {
          next.focusTopN = Number.isNaN(n) ? 5 : Math.max(1, n);
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Hide faded notes").setDesc("Only show notes with a meaningful glow score.").addToggle(
      (toggle) => toggle.setValue(!settings.showArchived).onChange(async (value) => {
        await this.plugin.updateSettings((next) => {
          next.showArchived = !value;
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Sidebar placement").setDesc(
      "Which sidebar to open the glow panel in. Takes effect immediately."
    ).addDropdown(
      (drop) => drop.addOption("right", "Right (default)").addOption("left", "Left").setValue(settings.sidebarSide).onChange(async (value) => {
        await this.plugin.updateSettings((next) => {
          next.sidebarSide = value;
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Tracking").setHeading();
    new import_obsidian2.Setting(containerEl).setName("Minimum open time (seconds)").setDesc(
      "A note must stay open this long before it counts as a visit. Prevents quick flick-throughs from inflating scores. Set to 0 to count every open instantly."
    ).addText(
      (text) => text.setPlaceholder("30").setValue(String(settings.minDwellMs / 1e3)).onChange(async (value) => {
        const parsed = Number.parseFloat(value);
        await this.plugin.updateSettings((next) => {
          next.minDwellMs = Number.isNaN(parsed) ? 3e4 : Math.max(0, Math.round(parsed * 1e3));
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Tracked folders").setDesc(
      "Only track notes in these folders (one folder path per line). Leave blank to track your entire vault."
    ).addTextArea((area) => {
      area.setPlaceholder("Projects/\ndaily/").setValue(settings.includedFolders.join("\n")).onChange(async (value) => {
        await this.plugin.updateSettings((next) => {
          next.includedFolders = value.split("\n").map((s) => s.trim()).filter(Boolean);
        });
      });
      area.inputEl.rows = 4;
    });
    new import_obsidian2.Setting(containerEl).setName("Excluded folders").setDesc(
      "Never track notes in these folders (one folder path per line)."
    ).addTextArea((area) => {
      area.setPlaceholder("Templates/\narchive/").setValue(settings.excludedFolders.join("\n")).onChange(async (value) => {
        await this.plugin.updateSettings((next) => {
          next.excludedFolders = value.split("\n").map((s) => s.trim()).filter(Boolean);
        });
      });
      area.inputEl.rows = 4;
    });
    const details = containerEl.createEl("details", {
      cls: "cognitive-glow-advanced-section"
    });
    details.createEl("summary", {
      text: "Advanced",
      cls: "cognitive-glow-advanced-summary"
    });
    new import_obsidian2.Setting(details).setName("Recency weight").setDesc(
      "How much recent activity contributes to the glow score (0\u20131). Weights are normalized automatically if their sum exceeds 1."
    ).addText(
      (text) => text.setPlaceholder("0.6").setValue(String(settings.weightRecency)).onChange(async (value) => {
        const v = Number.parseFloat(value);
        await this.plugin.updateSettings((next) => {
          next.weightRecency = Number.isNaN(v) ? 0.6 : Math.min(1, Math.max(0, v));
        });
      })
    );
    new import_obsidian2.Setting(details).setName("Frequency weight").setDesc("How much visit frequency contributes to the glow score (0\u20131).").addText(
      (text) => text.setPlaceholder("0.4").setValue(String(settings.weightFrequency)).onChange(async (value) => {
        const v = Number.parseFloat(value);
        await this.plugin.updateSettings((next) => {
          next.weightFrequency = Number.isNaN(v) ? 0.4 : Math.min(1, Math.max(0, v));
        });
      })
    );
    new import_obsidian2.Setting(details).setName("Manual pin weight").setDesc(
      "How much manually pinned notes are boosted in the score (0\u20131). Pin a note via setManualGravity in the API."
    ).addText(
      (text) => text.setPlaceholder("0").setValue(String(settings.weightGravity)).onChange(async (value) => {
        const v = Number.parseFloat(value);
        await this.plugin.updateSettings((next) => {
          next.weightGravity = Number.isNaN(v) ? 0 : Math.min(1, Math.max(0, v));
        });
      })
    );
    new import_obsidian2.Setting(details).setName("Frequency scale").setDesc(
      "The number of opens considered 'maximum frequency' for scoring. Higher values make frequent opens matter less at the top end."
    ).addText(
      (text) => text.setPlaceholder("20").setValue(String(settings.hitCountMaxScale)).onChange(async (value) => {
        const v = Number.parseInt(value, 10);
        await this.plugin.updateSettings((next) => {
          next.hitCountMaxScale = Number.isNaN(v) ? 20 : Math.max(1, v);
        });
      })
    );
    new import_obsidian2.Setting(details).setName("Max tracked notes").setDesc(
      "Cap on how many notes are kept in memory. 0 = no cap."
    ).addText(
      (text) => text.setPlaceholder("3000").setValue(String(settings.maxRecords)).onChange(async (value) => {
        const v = Number.parseInt(value, 10);
        await this.plugin.updateSettings((next) => {
          next.maxRecords = Number.isNaN(v) ? 3e3 : Math.max(0, v);
        });
      })
    );
    new import_obsidian2.Setting(details).setName("Recency decay (ms)").setDesc(
      "Raw time constant for the exponential recency decay in milliseconds. Overrides the 'Glow fades after' dropdown."
    ).addText(
      (text) => text.setPlaceholder("259200000").setValue(String(settings.tauRecencyMs)).onChange(async (value) => {
        const v = Number.parseFloat(value);
        await this.plugin.updateSettings((next) => {
          next.tauRecencyMs = Number.isNaN(v) ? 2592e5 : Math.max(1, v);
        });
      })
    );
  }
};
