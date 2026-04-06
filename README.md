# Cognitive Glow

Cognitive Glow is an Obsidian plugin that shows a sidebar panel of notes ranked by a computed glow score — a blend of how recently and frequently you've visited them. Notes you actively work with glow brighter; ones you haven't touched in a while fade out.

## Features

- **Visual glow** — notes emit a luminous glow proportional to their score. High-activity notes shine; old ones quietly dim.
- **Normal and Focus modes** — Normal shows your full ranked list; Focus narrows it to your top N notes.
- **Smarter tracking** — visits are only counted after a configurable minimum open time (default 30 s), so quick flick-throughs don't inflate scores. Untitled notes are never tracked.
- **Folder scope** — restrict tracking to specific folders, or exclude folders like `Templates/` or `Archive/`.
- **Sidebar placement** — open the panel in the left or right sidebar, whichever fits your workflow.
- **Ribbon button** — a sparkles icon in the left ribbon opens the panel instantly.

## Installation (manual)

1. `npm install`
2. `npm run build`
3. Copy these files into `.obsidian/plugins/cognitive-glow/`:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. Enable **Cognitive Glow** in Settings → Community plugins.

## Usage

1. Open notes normally in Obsidian — Cognitive Glow tracks visits automatically.
2. Open the **Cognitive glow** panel from the ribbon (sparkles icon) or the command palette (`Open sidebar`).
3. Switch between **Normal** and **Focus** using the toggle buttons in the panel header.
4. Click any row to open that note.

## Settings

### Display

| Setting | Default | Description |
|---|---|---|
| Glow fades after | 3 days | How quickly a note loses its glow when you stop visiting it. Choose from 1 day / 3 days / 1 week / 1 month. |
| Max notes in focus mode | `5` | How many top-glowing notes appear in focus mode. |
| Hide faded notes | Off | Only show notes with a meaningful glow score. |
| Sidebar placement | Right | Open the panel in the left or right sidebar. |

### Tracking

| Setting | Default | Description |
|---|---|---|
| Minimum open time | `30` s | A note must stay open this long before the visit counts. Set to `0` to count every open instantly. |
| Tracked folders | _(blank)_ | Only track notes inside these folders. One path per line. Leave blank to track your entire vault. |
| Excluded folders | _(blank)_ | Never track notes in these folders. One path per line. Takes priority over tracked folders. |

### Advanced

Raw scoring parameters — most users won't need to touch these.

| Setting | Default | Description |
|---|---|---|
| Recency weight | `0.6` | How much recent activity contributes to the score (0–1). |
| Frequency weight | `0.4` | How much visit frequency contributes to the score (0–1). |
| Manual pin weight | `0` | How much manually pinned notes are boosted (0–1). |
| Frequency scale | `20` | Number of opens treated as "maximum frequency". |
| Max tracked notes | `3000` | Cap on notes kept in memory. `0` = no cap. |
| Recency decay (ms) | `259200000` | Raw time constant for decay. Overrides the "Glow fades after" dropdown. |

## Commands

| Command | Description |
|---|---|
| Open sidebar | Opens or reveals the Cognitive Glow panel. |
| Dump glow scores to console | Logs the top 20 notes by score to the developer console. |
| Show persisted data (JSON) | Opens a modal showing the full saved data payload. |

## Data location

`.obsidian/plugins/cognitive-glow/data.json`

## How scoring works

For each note:

```
recency   = exp(-(now - lastOpened) / tauRecencyMs)
frequency = log(1 + hitCount) / log(1 + hitCountMaxScale)
gravity   = manualGravity  (0 if not set)

glowScore = recencyWeight * recency
          + frequencyWeight * frequency
          + gravityWeight * gravity
```

All weights are normalized automatically if their sum exceeds 1.

For implementation details, see `00_SPEC_COGNITIVE_GLOW.md`.
