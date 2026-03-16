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
function updateStatsOnOpen(index, file, now) {
  var _a;
  const path = file.path;
  const existing = (_a = index.notes[path]) != null ? _a : {
    path,
    hitCount: 0,
    lastOpened: now
  };
  existing.hitCount += 1;
  existing.lastOpened = now;
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
    version: typeof raw.version === "number" ? raw.version : CURRENT_VERSION,
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
  maxRecords: 3e3
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
    return "Cognitive Glow";
  }
  onOpen() {
    this.render();
  }
  onClose() {
    this.contentEl.empty();
  }
  render() {
    const { getRecords, getSettings } = this.options;
    const container = this.contentEl;
    container.empty();
    const settings = getSettings();
    const header = container.createDiv({ cls: "cognitive-glow-header" });
    header.createEl("h3", { text: "Cognitive Glow" });
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
        text: `Showing top ${topN} notes by glow score.`
      });
    } else {
      header.createEl("p", {
        cls: "cognitive-glow-mode",
        text: "Showing all notes by glow score."
      });
    }
    const maxRecords = Math.max(0, Math.floor(settings.maxRecords));
    if (maxRecords > 0) {
      records = records.slice(0, maxRecords);
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
        `width: ${widthPercent}%; opacity: ${opacity};`
      );
      row.addEventListener(
        "click",
        () => this.app.workspace.openLinkText(record.path, "", false)
      );
      const label = row.createDiv({ cls: "cognitive-glow-label" });
      label.setText(record.path);
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
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof import_obsidian2.TFile) {
          this.handleFileOpen(file);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof import_obsidian2.TFile) {
          migrateStatsOnRename(this.stats, oldPath, file.path);
          this.scheduleSave();
          this.refreshViews();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof import_obsidian2.TFile) {
          removeStatsOnDelete(this.stats, file.path);
          this.scheduleSave();
          this.refreshViews();
        }
      })
    );
    this.addCommand({
      id: "cognitive-glow-dump-scores",
      name: "Dump Glow Scores to Console",
      callback: () => {
        const records = this.getGlowRecords().sort((a, b) => b.glowScore - a.glowScore).slice(0, 20);
        console.log("Cognitive Glow \u2013 Top Notes:", records);
      }
    });
    this.addCommand({
      id: "cognitive-glow-show-persisted-data",
      name: "Show Persisted Data (JSON)",
      callback: () => {
        const payload = this.getPersistedData();
        const serialized = JSON.stringify(payload, null, 2);
        new PersistedDataModal(this.app, serialized).open();
      }
    });
    this.addSettingTab(new CognitiveGlowSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      void this.activateView();
    });
  }
  onunload() {
    if (this.saveTimeout != null) {
      window.clearTimeout(this.saveTimeout);
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
    );
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
    updater(this.settings);
    this.normalizeWeightSettings(this.settings);
    this.scheduleSave();
    this.refreshViews();
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
    var _a;
    const leaves = this.app.workspace.getLeavesOfType(GLOW_VIEW_TYPE);
    if (leaves.length === 0) {
      await ((_a = this.app.workspace.getRightLeaf(false)) == null ? void 0 : _a.setViewState({
        type: GLOW_VIEW_TYPE,
        active: true
      }));
    }
    this.refreshViews();
  }
  handleFileOpen(file) {
    const now = Date.now();
    updateStatsOnOpen(this.stats, file, now);
    this.scheduleSave();
    this.refreshViews();
  }
  scheduleSave() {
    if (this.saveTimeout != null) {
      window.clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      void this.performSave();
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
      console.warn(
        "Cognitive Glow: weights exceeded 1; normalizing."
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
};
var PersistedDataModal = class extends import_obsidian2.Modal {
  constructor(app, serializedData) {
    super(app);
    this.serializedData = serializedData;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", {
      text: "Cognitive Glow Persisted Data (JSON)"
    });
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
    containerEl.createEl("h2", { text: "Cognitive Glow Settings" });
    const settings = this.plugin.getSettings();
    const clampNumber = (value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) => {
      const parsed = Number.parseFloat(value);
      if (Number.isNaN(parsed)) {
        return fallback;
      }
      return Math.min(max, Math.max(min, parsed));
    };
    new import_obsidian2.Setting(containerEl).setName("Focus mode top N").setDesc("Number of notes to show in Focus Mode.").addText(
      (text) => text.setPlaceholder("5").setValue(String(settings.focusTopN)).onChange(async (value) => {
        const n = Number.parseInt(value, 10);
        await this.plugin.updateSettings((next) => {
          next.focusTopN = Number.isNaN(n) ? 5 : Math.max(1, n);
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Show low-glow notes").setDesc("Include notes with very low glow scores in Normal mode.").addToggle(
      (toggle) => toggle.setValue(settings.showArchived).onChange(async (value) => {
        await this.plugin.updateSettings((next) => {
          next.showArchived = value;
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Recency decay (ms)").setDesc("Controls how quickly glow fades with time (in milliseconds).").addText(
      (text) => text.setPlaceholder(String(settings.tauRecencyMs)).setValue(String(settings.tauRecencyMs)).onChange(async (value) => {
        const nextValue = clampNumber(value, settings.tauRecencyMs, 1);
        await this.plugin.updateSettings((next) => {
          next.tauRecencyMs = nextValue;
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Hit count max scale").setDesc(
      "Scaling target for frequency (higher values make frequent opens matter less)."
    ).addText(
      (text) => text.setPlaceholder(String(settings.hitCountMaxScale)).setValue(String(settings.hitCountMaxScale)).onChange(async (value) => {
        const nextValue = clampNumber(
          value,
          settings.hitCountMaxScale,
          1
        );
        await this.plugin.updateSettings((next) => {
          next.hitCountMaxScale = Math.floor(nextValue);
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Max records").setDesc(
      "Maximum number of notes to process or render (0 disables the cap)."
    ).addText(
      (text) => text.setPlaceholder(String(settings.maxRecords)).setValue(String(settings.maxRecords)).onChange(async (value) => {
        const nextValue = clampNumber(
          value,
          settings.maxRecords,
          0
        );
        await this.plugin.updateSettings((next) => {
          next.maxRecords = Math.floor(nextValue);
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Recency weight").setDesc("Weight assigned to recent activity (0 to 1).").addText(
      (text) => text.setPlaceholder(String(settings.weightRecency)).setValue(String(settings.weightRecency)).onChange(async (value) => {
        const nextValue = clampNumber(value, settings.weightRecency, 0, 1);
        await this.plugin.updateSettings((next) => {
          next.weightRecency = nextValue;
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Frequency weight").setDesc("Weight assigned to frequency of opens (0 to 1).").addText(
      (text) => text.setPlaceholder(String(settings.weightFrequency)).setValue(String(settings.weightFrequency)).onChange(async (value) => {
        const nextValue = clampNumber(
          value,
          settings.weightFrequency,
          0,
          1
        );
        await this.plugin.updateSettings((next) => {
          next.weightFrequency = nextValue;
        });
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Gravity weight").setDesc("Weight assigned to manual importance (0 to 1).").addText(
      (text) => text.setPlaceholder(String(settings.weightGravity)).setValue(String(settings.weightGravity)).onChange(async (value) => {
        const nextValue = clampNumber(
          value,
          settings.weightGravity,
          0,
          1
        );
        await this.plugin.updateSettings((next) => {
          next.weightGravity = nextValue;
        });
      })
    );
  }
};
