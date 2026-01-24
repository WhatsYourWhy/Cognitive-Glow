00_SPEC_COGNITIVE_GLOW.md

---
title: Cognitive Glow – Obsidian Plugin Spec
status: draft
version: 0.1.0
owner: Justin
tags:
  - obsidian
  - plugin
  - adhd
  - portfolio
  - security
Status: active 01-17-2026
---

# Cognitive Glow – Dynamic Heatmap Sidebar

## 1. Problem & Goal

**Problem:**  
In a large vault, especially with ADHD, notes disappear into the archive. "Out of sight, out of mind" means valuable threads die simply because they scroll off the recent list or their names are not recalled.

**Goal:**  
Create a **visual heatmap** of note activity that lives in an Obsidian sidebar. Notes that are **recently active and frequently opened "glow"**, while cold notes fade. The user can **navigate by visual/spatial memory** ("the bright cluster I was in yesterday") instead of remembering exact file names.

No external services. No hidden sync. Full auditability.

---

## 2. Design Constraints

- **Zero network**
  - No `fetch`, no web sockets, no external APIs.
- **Minimal persistence**
  - Use Obsidian’s `loadData` / `saveData` only.
  - All plugin data lives in `.obsidian/plugins/cognitive-glow/data.json`.
- **No runtime dependencies**
  - `dependencies: {}` in `package.json`.
  - Dev-only tooling allowed (TypeScript, esbuild, etc.) but not shipped.
- **Audit-friendly**
  - Clear separation of:
    - Core metrics logic
    - Persistence layer
    - UI rendering
    - Obsidian integration
- **ADHD-conscious UI**
  - Useful at a glance, not overwhelming.
  - Configurable “Focus mode” and animation limits.

---

## 3. Core Concept: The Glow Score

Each note gets a **Glow Score** between 0 and 1.

High = more “glow” (bigger / brighter in UI).  
Low = dim, small, background.

### 3.1 Inputs to Glow Score

- **Static from Obsidian**
  - `mtime`: last modified time
  - `ctime`: creation time (optional, for biasing to older notes if wanted)

- **Dynamic tracked by plugin (v0.1)**
  - `hitCount`: incremented each time the note is opened
  - `lastOpened`: timestamp of last open

> Note: `dwellMs` is explicitly deferred to a later roadmap item and is not part of the v0.1 data model or scoring inputs.

### 3.2 Initial Glow Formula (v0.1)

Let:

- `recency = exp(-(now - lastOpened) / tauRecency)`
- `freq = log(1 + hitCount) / log(1 + hitCountMaxForScaling)`

Then:

- `glowScore = clamp(0, 1, wRecency * recency + wFreq * freq)`

Weight handling:

- `wRecency` and `wFreq` are clamped to 0–1.
- If `wRecency + wFreq > 1`, the weights are normalized so their sum equals 1 (with a warning logged).

Initial constants (subject to tuning):

- `tauRecency`: 3 days (in ms)
- `hitCountMaxForScaling`: 20
- `wRecency = 0.6`, `wFreq = 0.4`

If `lastOpened` is missing, fall back to `mtime`.

---

## 4. Architecture

### 4.1 Modules

1. **`core/metrics.ts`**
   - Types: `NoteStats`, `GlowConfig`, `GlowRecord`
   - Functions:
     - `updateStatsOnOpen(stats, file, now)`
     - `computeGlowScore(stats, config, now)`

2. **`core/store.ts`**
   - Wraps `loadData` / `saveData`
   - Handles schema versioning and migrations
   - Exposes:
     - `loadAllStats(): Promise<StatsIndex>`
     - `saveAllStats(index: StatsIndex): Promise<void>`

3. **`ui/glowView.ts`**
   - Renders a sidebar view:
     - Either `<canvas>` or `<div>` grid with CSS
   - Given:
     - `GlowRecord[]` (path + score)
   - Handles:
     - Rendering
     - Click to open file
     - Focus mode filtering

4. **`plugin/main.ts`**
   - Obsidian glue:
     - Subscribes to `workspace.on("file-open", ...)`
     - Schedules/deduplicates saves
     - Registers the view (sidebar pane)
     - Exposes settings & commands

---

## 5. Data Model

```ts
export interface NoteStats {
  path: string;        // vault-relative path
  hitCount: number;    // number of times opened
  lastOpened: number;  // epoch ms
}

export interface StatsIndex {
  notes: Record<string, NoteStats>; // key = path
}

export interface PersistedData {
  version: number;
  stats: StatsIndex;
  settings: GlowConfig;
}

export interface GlowConfig {
  tauRecencyMs: number;
  hitCountMaxScale: number;
  weightRecency: number;
  weightFrequency: number;
  focusTopN: number;
}

export interface GlowRecord {
  path: string;
  glowScore: number;
}

Stored JSON shape in data.json matches PersistedData, with a root-level
`version` for migrations.



---

## 6. Event Flow

### 6.1 On Plugin Load

1. loadData() → PersistedData (or defaults).


2. Register workspace.on("file-open", onFileOpen).


3. Register a sidebar view type: COGNITIVE_GLOW_VIEW.


4. Create / restore the view instance.



### 6.2 On File Open

1. If file is a TFile:

Look up or create NoteStats for file.path.

Increment hitCount.

Set lastOpened = now.

Schedule a debounced saveData() (e.g., once per 5 seconds max).



2. Recompute glow scores for visible notes (not necessarily entire vault every time).



### 6.3 On Render (View)

1. Request GlowRecord[] from plugin (all notes).


2. Sort descending by glowScore.


3. Depending on mode:

Normal mode: render all notes, scaled by score.

Focus mode: take top focusTopN notes only.



4. Each visual element:

On click: app.workspace.openLinkText(path, "", false).





---

## 7. UI / UX

### 7.1 Sidebar View

Appears as a new pane type: “Cognitive Glow”.

At v0, simplest UI: vertical list with glow visualization:

Each note: a horizontal bar whose width/opacity maps to glowScore.

Later: switch to 2D grid / canvas map.



### 7.2 Visual Encoding

glowScore → combination of:

Opacity (0.2–1.0)

Scale (font size or bar width)


No color noise in v0; maybe single accent color.


### 7.3 Controls

Toggle buttons in view header:

[Normal] [Focus]


Settings in plugin options (CognitiveGlowSettings):

- `tauRecencyMs` (milliseconds)
- `hitCountMaxScale` (count)
- `weightRecency` (0–1)
- `weightFrequency` (0–1)
- `focusTopN` (count)
- `showArchived` (boolean)
- `maxRecords` (count)




---

## 8. Security & Audit Story

8.1 No network-layer code

No fetch, WebSocket, XMLHttpRequest, or external SDKs.



8.2 No process spawning or filesystem hacks

No child_process, no direct fs calls.



8.3 Data locality

Statistics stored exclusively in data.json under plugin directory.

No writes to user notes or frontmatter.



8.4 Minimal surface area

Only integration points:

workspace.on("file-open")

Custom view registration

Plugin settings





This is explicitly reviewable by reading:

main.ts

core/*.ts

ui/glowView.ts



---

## 9. Roadmap

v0.1 – Skeleton

Track hitCount and lastOpened.

Basic glow score.

Simple vertical-list sidebar.


v0.2 – Focus Mode

Add focus mode to show top N notes.

Add basic settings.


v0.3 – Spatial Grid

Switch to Canvas or CSS grid visualization.

Cluster by folder or tag.


v0.4+ – Advanced Metrics

Optional dwell time tracking.

Decay curves tuning.

Export/import stats.


---

## 10. TypeScript Scaffold (Event Listener + Storage)

This is a minimal but real Obsidian plugin skeleton you can drop into `main.ts` and iterate in Cursor.

It:

- Tracks opens via `workspace.on("file-open")`.
- Persists stats via `loadData` / `saveData`.
- Exposes a simple command to log current glow scores (for debugging).

```ts
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf
} from "obsidian";

// ---- Core Types ----

interface NoteStats {
  path: string;
  hitCount: number;
  lastOpened: number; // epoch ms
}

interface StatsIndex {
  notes: Record<string, NoteStats>;
}

interface PersistedData {
  version: number;
  stats: StatsIndex;
  settings: GlowConfig;
}

interface GlowConfig {
  tauRecencyMs: number;
  hitCountMaxScale: number;
  weightRecency: number;
  weightFrequency: number;
  focusTopN: number;
}

interface GlowRecord {
  path: string;
  glowScore: number;
}

// ---- Defaults ----

const CURRENT_VERSION = 1;

const DEFAULT_CONFIG: GlowConfig = {
  tauRecencyMs: 3 * 24 * 60 * 60 * 1000, // 3 days
  hitCountMaxScale: 20,
  weightRecency: 0.6,
  weightFrequency: 0.4,
  focusTopN: 5
};

// ---- Helper Functions ----

function ensureIndex(raw: unknown): StatsIndex {
  const empty: StatsIndex = { notes: {} };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Partial<StatsIndex>;
  if (!obj.notes || typeof obj.notes !== "object") return empty;
  return {
    notes: obj.notes as Record<string, NoteStats>
  };
}

function ensurePersistedData(
  raw: unknown,
  defaults: CognitiveGlowSettings
): PersistedData {
  const emptyStats: StatsIndex = { notes: {} };
  if (!raw || typeof raw !== "object") {
    return {
      version: CURRENT_VERSION,
      stats: emptyStats,
      settings: { ...defaults }
    };
  }
  const obj = raw as Partial<PersistedData>;
  const statsSource = (obj.stats ?? raw) as StatsIndex;
  return {
    version: obj.version ?? CURRENT_VERSION,
    stats: ensureIndex(statsSource),
    settings: { ...defaults, ...(obj.settings ?? {}) }
  };
}

function updateStatsOnOpen(index: StatsIndex, file: TFile, now: number): void {
  const path = file.path;
  const existing = index.notes[path] ?? {
    path,
    hitCount: 0,
    lastOpened: now
  };
  existing.hitCount += 1;
  existing.lastOpened = now;
  index.notes[path] = existing;
}

function computeGlowScore(
  stats: NoteStats,
  config: GlowConfig,
  now: number
): number {
  const { tauRecencyMs, hitCountMaxScale, weightRecency, weightFrequency } =
    config;

  const dt = Math.max(0, now - stats.lastOpened);
  const recency = Math.exp(-dt / tauRecencyMs);

  const denom = Math.log(1 + hitCountMaxScale);
  const freq =
    denom > 0 ? Math.log(1 + stats.hitCount) / denom : 0;

  const score = weightRecency * recency + weightFrequency * freq;
  return Math.max(0, Math.min(1, score));
}

function computeAllGlowRecords(
  index: StatsIndex,
  config: GlowConfig,
  now: number
): GlowRecord[] {
  return Object.values(index.notes).map((ns) => ({
    path: ns.path,
    glowScore: computeGlowScore(ns, config, now)
  }));
}

// ---- Plugin Settings Wrapper (optional for later) ----

interface CognitiveGlowSettings extends GlowConfig {}

const DEFAULT_SETTINGS: CognitiveGlowSettings = {
  ...DEFAULT_CONFIG
};

// ---- Main Plugin Class ----

export default class CognitiveGlowPlugin extends Plugin {
  private stats: StatsIndex = { notes: {} };
  private settings: CognitiveGlowSettings = { ...DEFAULT_SETTINGS };
  private saveTimeout: number | null = null;

  async onload() {
    console.log("Loading Cognitive Glow plugin...");

    // Load stats and settings (same file for now; you can separate later)
    const raw = await this.loadData();
    const persisted = ensurePersistedData(raw, DEFAULT_SETTINGS);
    this.stats = persisted.stats;
    this.settings = persisted.settings;

    // Listen for file open events
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          const now = Date.now();
          updateStatsOnOpen(this.stats, file, now);
          this.scheduleSave();
        }
      })
    );

    // Debug command to inspect glow scores in console
    this.addCommand({
      id: "cognitive-glow-dump-scores",
      name: "Dump Glow Scores to Console",
      callback: () => {
        const now = Date.now();
        const records = computeAllGlowRecords(this.stats, this.settings, now)
          .sort((a, b) => b.glowScore - a.glowScore)
          .slice(0, 20);
        console.log("Cognitive Glow – Top Notes:", records);
      }
    });

    // Settings tab (minimal for now)
    this.addSettingTab(new CognitiveGlowSettingTab(this.app, this));
  }

  onunload() {
    console.log("Unloading Cognitive Glow plugin...");
  }

  // ---- Persistence ----

  private scheduleSave() {
    if (this.saveTimeout != null) window.clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      this.performSave().catch((err) =>
        console.error("Cognitive Glow save error:", err)
      );
    }, 5000); // save at most every 5 seconds
  }

  private async performSave() {
    this.saveTimeout = null;
    const payload: PersistedData = {
      version: CURRENT_VERSION,
      stats: this.stats,
      settings: this.settings
    };
    await this.saveData(payload);
  }

  // For future UI modules to access data:
  public getGlowRecords(): GlowRecord[] {
    const now = Date.now();
    return computeAllGlowRecords(this.stats, this.settings, now);
  }

  public getSettings(): CognitiveGlowSettings {
    return this.settings;
  }

  public async updateSettings(
    updater: (s: CognitiveGlowSettings) => void
  ): Promise<void> {
    updater(this.settings);
    this.scheduleSave();
  }
}

// ---- Settings Tab ----

class CognitiveGlowSettingTab extends PluginSettingTab {
  plugin: CognitiveGlowPlugin;

  constructor(app: App, plugin: CognitiveGlowPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", {
      text: "Cognitive Glow Settings"
    });

    const settings = this.plugin.getSettings();

    new Setting(containerEl)
      .setName("Focus mode top N")
      .setDesc("Number of notes to show in Focus Mode.")
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(String(settings.focusTopN))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            await this.plugin.updateSettings((s) => {
              s.focusTopN = isNaN(n) ? 5 : Math.max(1, n);
            });
          })
      );
  }
}

You can add a dedicated view next (sidebar visualization) and wire it to getGlowRecords().


---

## 11. Advanced Ideas / Next-Level Hooks

If you want some “extra” angles for portfolio cred:

1. Explainable Glow

Add a hover tooltip: “⚡ Opened 12 times, last opened 3h ago, modified 2d ago.”

That makes the heatmap obviously not magic.



2. Folder / Tag clustering

Optional mode that aggregates stats by folder (or tag) and renders clusters.

Handy for larger systems / Codex-level structure.



3. Time-windowed modes

“Today”, “Last 7 days”, “Last 30 days” toggles that filter which stats are considered (e.g., ignoring very old hits).



4. Dry-run export

A command that dumps the full stats + config as a JSON summary for personal audit.

Good portfolio story: “Here is how I expose internal state for user trust.”



5. Performance guardrail

Limit how many files are included in the glow calculation (e.g., top 2–3k by recency).

Prevents full-vault O(N) redraw every keystroke on monster vaults.

Expose this as a configurable `maxRecords` setting so users can tune the cap.
