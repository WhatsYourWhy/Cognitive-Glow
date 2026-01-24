---
title: Cognitive Glow – Obsidian Plugin Spec
status: draft
version: 0.2.0
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

This is not a productivity tracker. It is a **spatial memory aid** so that live threads stay findable without recalling exact titles.

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
  - Dev-only tooling allowed (TypeScript, bundler) but not shipped.
- **Audit-friendly structure**
  - Clear separation of:
    - Core metrics logic
    - Persistence layer
    - UI rendering
    - Obsidian integration
- **ADHD-conscious UI**
  - Useful at a glance, not overwhelming.
  - Configurable “Focus mode” and animation limits.

---

## 3. Core Concept: Heat vs Gravity

Internally, the plugin distinguishes:

- **Heat** – how much you’ve actually been touching a note (engagement).
- **Gravity** – how much a note “should” pull you back, even if you’re avoiding it (importance / horizon).

In **v0.1**, only Heat is used in the math; Gravity is reserved for future use to avoid encoding “engagement = relevance” in the architecture.

### 3.1 HeatScore (v0.1)

Heat is derived from:

- **Static from Obsidian**
  - `mtime`: last modified time
- **Dynamic tracked by plugin**
  - `hitCount`: incremented each time the note is opened
  - `lastOpened`: timestamp of last open

### 3.2 Gravity (reserved)

Gravity is reserved for future versions:

- **Manual gravity:** user-assigned 0–1 importance per note (e.g., via a command or settings).
- **Metadata-based gravity:** optional later, derived from tags or frontmatter.

For now, gravity exists in the data model and is exposed via the plugin API; its effect is
still opt-in because the default `weightGravity` is `0` unless the user changes it in settings.

---

## 4. Glow Score Formula

The **Glow Score** used for visualization is:

```text
glowScore = clamp(0, 1, wRecency * recency + wFreq * freq + wGravity * gravity)


Where:

- `recency = exp(-(now - lastOpened) / tauRecency)`
    
- `freq = log(1 + hitCount) / log(1 + hitCountMaxScale)`
    
- `gravity = stats.manualGravity ?? 0` (v0.1: `wGravity = 0`)
```

Initial constants (subject to tuning):

- `tauRecency`: 3 days (in ms)
    
- `hitCountMaxScale`: 20
    
- `wRecency = 0.6`, `wFreq = 0.4`, `wGravity = 0.0` (no effect yet)
    

If `lastOpened` is missing, fall back to `mtime`.

---

## 5. Architecture

### 5.1 Modules

1. **`core/metrics.ts`**
    
    - Types: `NoteStats`, `GlowConfig`, `GlowRecord`
        
    - Functions:
        
        - `updateStatsOnOpen(statsIndex, file, now)`
            
        - `computeGlowScore(stats, config, now)`
            
2. **`core/store.ts`**
    
    - Wraps `loadData` / `saveData`
        
    - Handles schema versioning and migrations
        
    - API:
        
        - `loadAllStats(): Promise<StatsIndex>`
            
        - `saveAllStats(index: StatsIndex): Promise<void>`
            
3. **`ui/glowView.ts`**
    
    - Renders a sidebar view:
        
        - v0.1: vertical list + bar/opacity encoding
            
        - v0.3+: optional Canvas / grid visualization
            
    - Given:
        
        - `GlowRecord[]` (path + score)
            
    - Handles:
        
        - Rendering
            
        - Click to open file
            
        - Focus mode filtering
            
4. **`plugin/main.ts`**
    
    - Obsidian glue:
        
        - `workspace.on("file-open", ...)`
            
        - `vault.on("rename", ...)` and `vault.on("delete", ...)`
            
        - Schedules debounced saves
            
        - Registers the sidebar view
            
        - Exposes settings & commands

---

## 6. Data Model

```ts
export interface NoteStats {
  path: string;           // vault-relative path
  hitCount: number;       // number of times opened
  lastOpened: number;     // epoch ms
  manualGravity?: number; // 0–1 user importance, reserved for future
  dwellMs?: number;       // optional, total active time (future)
}

export interface StatsIndex {
  version: number;
  notes: Record<string, NoteStats>; // key = path
}

export interface GlowConfig {
  tauRecencyMs: number;
  hitCountMaxScale: number;
  weightRecency: number;
  weightFrequency: number;
  weightGravity: number; // v0.1 = 0
  focusTopN: number;
  showArchived: boolean;
  maxRecords: number;
}

export interface GlowRecord {
  path: string;
  glowScore: number;
}
```

### 6.1 Rename / Delete Behavior

- **Rename:** When a file is renamed, its `NoteStats` entry is migrated from the old path key to the new path key.
    
- **Delete:** When a file is deleted, the associated `NoteStats` entry is removed.
    

This prevents silent accumulation of stats for files that no longer exist.

---

## 7. Event Flow

### 7.1 On Plugin Load

1. `loadData()` → raw payload.
    
2. Extract `StatsIndex` and `GlowConfig`, applying defaults.
    
3. Register:
    
    - `workspace.on("file-open", onFileOpen)`
        
    - `vault.on("rename", onFileRename)`
        
    - `vault.on("delete", onFileDelete)`
        
4. Register the view type: `COGNITIVE_GLOW_VIEW` and create/restore the view.
    

### 7.2 On File Open

1. If `file` is a `TFile`:
    
    - Look up or create `NoteStats` for `file.path`.
        
    - Increment `hitCount`.
        
    - Set `lastOpened = now`.
        
    - Schedule a debounced save (e.g., once per 5 seconds max).
        
2. Recompute Glow Scores for notes as needed.
    

### 7.3 On File Rename

- If `oldPath` exists in `StatsIndex.notes`:
    
    - Move that entry to the new path key (`file.path`).
        

### 7.4 On File Delete

- If `file.path` exists in `StatsIndex.notes`:
    
    - Remove that entry.
        

### 7.5 On Render (View)

1. Ask plugin for `GlowRecord[]`.
    
2. Sort descending by `glowScore`.
    
3. Apply mode:
    
    - **Normal mode:** render all records (subject to a max cap).
        
    - **Focus mode:** render top `focusTopN` records only.
        
4. Each record:
    
    - Click → `app.workspace.openLinkText(path, "", false)`.
        

### 7.6 Performance Guardrail (Big Vaults)

- In v0.1, GlowRecord computation is **O(N)** over seen notes.
    
- To avoid issues on very large vaults:
    
    - Cap the *returned* records to `maxRecords` after computing all scores.
        
- Future optimization:
    
    - Cache GlowRecords and update incrementally when a single note changes.

---

## 8. UI / UX

### 8.1 Sidebar View (v0.1)

- New pane type: **“Cognitive Glow”**.
    
- v0.1 visualization:
    
    - Vertical list of notes.
        
    - Each note rendered as:
        
        - Title / basename.
            
        - Optional path snippet.
            
        - A bar whose width and/or opacity encodes `glowScore`.
            

### 8.2 Visual Encoding

- `glowScore` → mapping:
    
    - Opacity: 0.2–1.0
        
    - Bar width: e.g., 20%–100%
        
- No multi-color heatmaps in v0.1; one accent color only.
    
- Changes should be **smooth but not hyperactive**; v0.1 may even use hard steps (e.g., low / medium / high glow) to avoid visual noise.
    
- **Archived/low-glow filter:** when `showArchived` is disabled, notes with `glowScore < 0.05` are filtered from Normal mode.


### 8.3 Controls

- View header:
    
    - `[Normal] [Focus]` toggle.
        
- Plugin settings are defined in **CognitiveGlowSettings** (see §8.4).

### 8.4 Settings (CognitiveGlowSettings)

Each setting below lists units, intent, and default values as implemented.

| Field | Units | Intent | Default |
| --- | --- | --- | --- |
| `tauRecencyMs` | milliseconds | Recency decay constant for `exp(-dt / tauRecencyMs)`; larger = slower fade. | `3 * 24 * 60 * 60 * 1000` (3 days) |
| `hitCountMaxScale` | count | Max hit count used to scale frequency via `log(1 + hitCount) / log(1 + hitCountMaxScale)`. | `20` |
| `weightRecency` | 0–1 | Weight of recency term in glow score. | `0.6` |
| `weightFrequency` | 0–1 | Weight of frequency term in glow score. | `0.4` |
| `weightGravity` | 0–1 | Weight for manual/metadata gravity; defaults to zero in v0.1 (user can opt in). | `0.0` |
| `focusTopN` | count | Number of top-glow notes shown in Focus mode. | `5` |
| `showArchived` | boolean | Whether low-glow notes should be eligible for display. | `true` |
| `maxRecords` | count | Upper bound on records returned to the UI (performance guard for large vaults). | `3000` |

**Behavior notes**

- `weightGravity` defaults to `0` so gravity has no effect until the user opts in via settings.  
- `maxRecords` is a performance guardrail: when the index is huge, only the top `maxRecords` glow records should be returned to the view.
- Weight settings are clamped to `[0, 1]`; if their sum exceeds `1`, they are normalized proportionally.

---

## 9. Security & Behavioral Constraints

### 9.1 Security

1. **No network-layer code**
    
    - No `fetch`, `WebSocket`, `XMLHttpRequest`, or external SDKs.
        
2. **No process spawning or direct filesystem hacks**
    
    - No `child_process`, no direct `fs` usage.
        
3. **Data locality**
    
    - Statistics stored exclusively in `data.json` under plugin directory.
        
    - No writes to user notes or frontmatter.
        
4. **Minimal surface area**
    
    - Integration points:
        
        - `workspace.on("file-open")`
            
        - `vault.on("rename")`
            
        - `vault.on("delete")`
            
        - Custom view registration
            
        - Plugin settings
            

### 9.2 Behavioral Constraints

To avoid turning Cognitive Glow into a tracker or shame engine:

- No streaks, daily scores, or gamified metrics.
    
- No per-day or per-week targets.
    
- No urgency language (“You’re falling behind”, “Don’t miss this!”).
    
- No automatic _hiding_ of low-glow notes; only down-weighting / dimming.
    
- No aggregation or export of stats intended for performance reviews or external evaluation.
    

The plugin’s purpose is navigation and recall, not behavioral surveillance.

---

## 10. Roadmap

### v0.1 – Skeleton (Heat only)

- Track `hitCount` and `lastOpened`.
    
- Compute Heat-based GlowScore (with `weightGravity = 0`).
    
- Simple vertical-list sidebar.
    
- Focus mode (top N notes).
    
- Rename/delete handling.
    

### v0.2 – Gravity Hooks

- Commands/UI to set `manualGravity` per note (0–1).
    
- Introduce a small `weightGravity` (e.g., 0.2–0.3) with clear UI.
    
- Glow tooltips explaining “why” a note glows.
    

### v0.3 – Spatial Grid

- Switch/add Canvas or CSS grid visualization.
    
- Optional clustering by folder or tag.
    

### v0.4+ – Advanced Metrics

- Optional dwell time tracking (with explicit opt-in).
    
- Decay curve tuning.
    
- Export/import stats for personal analysis.

---

## 11. Updated TypeScript Scaffold (with Gravity + rename/delete)

Here’s an updated `main.ts` that:

- Adds `manualGravity` and `weightGravity` (but keeps `weightGravity = 0`).
- Adds vault listeners for rename/delete.
- Leaves a clean hook for future gravity UI.
- Keeps everything zero-network, zero-deps.

```ts
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile
} from "obsidian";

// ---- Core Types ----

interface NoteStats {
  path: string;
  hitCount: number;
  lastOpened: number;      // epoch ms
  manualGravity?: number;  // 0–1, reserved for future use
}

interface StatsIndex {
  version: number;
  notes: Record<string, NoteStats>;
}

interface GlowConfig {
  tauRecencyMs: number;
  hitCountMaxScale: number;
  weightRecency: number;
  weightFrequency: number;
  weightGravity: number; // v0.1 = 0
  focusTopN: number;
}

interface GlowRecord {
  path: string;
  glowScore: number;
}

// ---- Defaults ----

const CURRENT_VERSION = 2;

const DEFAULT_CONFIG: GlowConfig = {
  tauRecencyMs: 3 * 24 * 60 * 60 * 1000, // 3 days
  hitCountMaxScale: 20,
  weightRecency: 0.6,
  weightFrequency: 0.4,
  weightGravity: 0.0, // reserved for future
  focusTopN: 5
};

// ---- Helper Functions ----

function ensureIndex(raw: unknown): StatsIndex {
  const empty: StatsIndex = { version: CURRENT_VERSION, notes: {} };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Partial<StatsIndex>;
  if (!obj.notes || typeof obj.notes !== "object") return empty;
  return {
    version: CURRENT_VERSION,
    notes: obj.notes as Record<string, NoteStats>
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

function migrateStatsOnRename(
  index: StatsIndex,
  oldPath: string,
  newPath: string
): void {
  if (oldPath === newPath) return;
  const existing = index.notes[oldPath];
  if (!existing) return;
  delete index.notes[oldPath];
  existing.path = newPath;
  index.notes[newPath] = existing;
}

function removeStatsOnDelete(index: StatsIndex, path: string): void {
  if (index.notes[path]) {
    delete index.notes[path];
  }
}

function computeGlowScore(
  stats: NoteStats,
  config: GlowConfig,
  now: number
): number {
  const {
    tauRecencyMs,
    hitCountMaxScale,
    weightRecency,
    weightFrequency,
    weightGravity
  } = config;

  const dt = Math.max(0, now - stats.lastOpened);
  const recency = Math.exp(-dt / tauRecencyMs);

  const denom = Math.log(1 + hitCountMaxScale);
  const freq =
    denom > 0 ? Math.log(1 + stats.hitCount) / denom : 0;

  const gravity = typeof stats.manualGravity === "number"
    ? Math.max(0, Math.min(1, stats.manualGravity))
    : 0;

  const score =
    weightRecency * recency +
    weightFrequency * freq +
    weightGravity * gravity;

  return Math.max(0, Math.min(1, score));
}

function computeAllGlowRecords(
  index: StatsIndex,
  config: GlowConfig,
  now: number
): GlowRecord[] {
  const records: GlowRecord[] = [];

  for (const stats of Object.values(index.notes)) {
    const glowScore = computeGlowScore(stats, config, now);
    records.push({ path: stats.path, glowScore });
  }

  return records;
}

// ---- Plugin Settings Wrapper ----

interface CognitiveGlowSettings extends GlowConfig {}

const DEFAULT_SETTINGS: CognitiveGlowSettings = {
  ...DEFAULT_CONFIG
};

// ---- Main Plugin Class ----

export default class CognitiveGlowPlugin extends Plugin {
  private stats: StatsIndex = { version: CURRENT_VERSION, notes: {} };
  private settings: CognitiveGlowSettings = { ...DEFAULT_SETTINGS };
  private saveTimeout: number | null = null;

  async onload() {
    console.log("Loading Cognitive Glow plugin...");

    // Load stats + settings
    const raw = await this.loadData();
    const loadedIndex = raw?.stats ?? raw;
    this.stats = ensureIndex(loadedIndex);
    this.settings = { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) };

    // Events: file open
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          const now = Date.now();
          updateStatsOnOpen(this.stats, file, now);
          this.scheduleSave();
        }
      })
    );

    // Events: rename + delete
    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        if (file instanceof TFile) {
          migrateStatsOnRename(this.stats, oldPath, file.path);
          this.scheduleSave();
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        if (file instanceof TFile) {
          removeStatsOnDelete(this.stats, file.path);
          this.scheduleSave();
        }
      })
    );

    // Debug command: dump top glow scores
    this.addCommand({
      id: "cognitive-glow-dump-scores",
      name: "Dump Glow Scores to Console",
      callback: () => {
        const now = Date.now();
        const records = this.getGlowRecords()
          .sort((a, b) => b.glowScore - a.glowScore)
          .slice(0, 20);
        console.log("Cognitive Glow – Top Notes:", records);
      }
    });

    // Settings tab
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
    }, 5000);
  }

  private async performSave() {
    this.saveTimeout = null;
    const payload = {
      stats: this.stats,
      settings: this.settings
    };
    await this.saveData(payload);
  }

  // ---- Public API for UI modules ----

  public getGlowRecords(): GlowRecord[] {
    const now = Date.now();
    const all = computeAllGlowRecords(this.stats, this.settings, now);

    // Basic perf guard: if monster index, keep the top K only
    const K = 3000;
    if (all.length <= K) return all;

    // Sort by glowScore and trim
    return all
      .sort((a, b) => b.glowScore - a.glowScore)
      .slice(0, K);
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

  // ---- Future hook: set manual gravity for a path ----

  public setManualGravity(path: string, value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    const stats = this.stats.notes[path];
    if (!stats) return;
    stats.manualGravity = clamped;
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

    // Gravity weight is present but default 0 — you can expose later.
    // new Setting(containerEl)
    //   .setName("Gravity weight (experimental)")
    //   .setDesc("How much manual importance affects the glow (0–1).")
    //   .addText((text) =>
    //     text
    //       .setPlaceholder("0.0")
    //       .setValue(String(settings.weightGravity))
    //       .onChange(async (value) => {
    //         const x = parseFloat(value);
    //         await this.plugin.updateSettings((s) => {
    //           s.weightGravity = isNaN(x) ? 0 : Math.max(0, Math.min(1, x));
    //         });
    //       })
    //   );
  }
}
```

---

## 12. Advanced Ideas / Next-Level Hooks

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

---

## 13. Changelog

- Clarified motivation for schema changes and lifecycle handling to keep data evolution safe and predictable.
- Added a manual gravity concept with a default `weightGravity = 0` to keep behavior opt-in.
- Introduced a versioned `StatsIndex` schema (version = 2) with explicit migration intent for future updates.
- Documented the `maxRecords` performance guard and aligned settings to prevent heavy recalculation on large vaults.
