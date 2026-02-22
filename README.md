# Cognitive Glow

Cognitive Glow is an Obsidian plugin that shows a sidebar list of notes ranked by a computed glow score.

## What it currently does

- Tracks note opens (`hitCount`, `lastOpened`) from Obsidian `file-open` events.
- Computes `glowScore` from recency + frequency (+ manual gravity only if present in saved note stats).
- Shows a **Normal** mode (all scored notes) and **Focus** mode (top `N` notes).
- Saves stats/settings with Obsidian `loadData` / `saveData`.
- Updates tracked paths on rename and removes stats on delete.

## Installation (manual)

1. `npm install`
2. `npm run build`
3. Copy files into `.obsidian/plugins/cognitive-glow/`:
   - `plugin/manifest.json` (rename to `manifest.json` in the target folder)
   - `plugin/main.js` (rename to `main.js` in the target folder)
   - `styles.css`
4. Enable **Cognitive Glow** in Community Plugins.

## Usage

1. Open notes normally in Obsidian.
2. Open the **Cognitive Glow** sidebar view (it auto-opens once on layout ready if no glow view exists).
3. Switch between **Normal** and **Focus**.
4. Click a row to open that note.

### Command examples

- **Dump Glow Scores to Console**
  - Logs up to 20 notes sorted by glow score:

```js
[
  { path: "Notes/Project.md", glowScore: 0.73 },
  { path: "Daily/2024-06-01.md", glowScore: 0.51 }
]
```

- **Show Persisted Data (JSON)**
  - Opens a modal with the exact saved payload (`version`, `stats`, `settings`).

## Settings

| Setting | Default |
| --- | --- |
| Focus mode top N | `5` |
| Show low-glow notes | `true` |
| Recency decay (ms) | `259200000` (3 days) |
| Hit count max scale | `20` |
| Max records | `3000` (`0` disables cap) |
| Recency weight | `0.6` |
| Frequency weight | `0.4` |
| Gravity weight | `0.0` |

## Data location

- `.obsidian/plugins/cognitive-glow/data.json`

For implementation details, see `00_SPEC_COGNITIVE_GLOW.md`.
