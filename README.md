# Cognitive Glow

Cognitive Glow is an Obsidian plugin that renders a note activity list in a sidebar view. It highlights recently opened and frequently visited notes so you can navigate your vault by glow scores instead of hunting for filenames.

## Purpose

Cognitive Glow keeps recent and frequently opened notes visible without removing less active notes.

## Features

- **Glow scores**: Notes brighten based on recency and open frequency.
- **Focus mode**: Toggle to show only the top *N* notes by glow score.
- **Local data**: No network calls or external services at runtime.
- **Persisted stats**: Data is stored in your vault’s plugin data file.

## How it works

Cognitive Glow tracks:

- **Last opened time**
- **Open count**

It calculates a glow score per note using weighted recency and frequency, then renders the list in a sidebar view. Manual gravity values are only used when present in stored data and default to **0**.

## Installation (manual)

1. Clone or download this repository.
2. Run `npm install` to install dev tooling.
3. Run `npm run build`.
4. Copy the following files into your vault under `.obsidian/plugins/cognitive-glow/`:
   - `manifest.json`
   - `main.js`
   - `styles.css`
5. Enable **Cognitive Glow** in Obsidian’s Community Plugins settings.

## Usage

- Open the **Cognitive Glow** view from the right sidebar (it opens automatically if no view is open).
- Use **Normal** or **Focus** mode to switch between the full list and the top glowing notes.
- Click any note to open it.

### Commands

- **Dump Glow Scores to Console**: Logs the top glowing notes to the dev console.
- **Show Persisted Data (JSON)**: Displays the plugin’s stored data for auditing.

## Settings

You can configure the glow behavior in the settings tab:

| Setting | Description | Default |
| --- | --- | --- |
| Focus mode top N | Notes shown in Focus mode. | `5` |
| Show low-glow notes | Include very low-glow notes in Normal mode (filters glow scores below `0.05` when disabled). | `true` |
| Recency decay (ms) | How quickly glow fades over time. | `3 days` |
| Hit count max scale | Scaling target for frequency; higher values make frequent opens matter less. | `20` |
| Max records | Cap records rendered after scoring (0 disables). | `3000` |
| Recency weight | Weight assigned to recent activity. | `0.6` |
| Frequency weight | Weight assigned to open frequency. | `0.4` |
| Gravity weight | Weight assigned to manual importance. | `0.0` |

## Data storage & privacy

- **No network calls** and **no external dependencies** at runtime.
- Plugin data is stored locally in:
  - `.obsidian/plugins/cognitive-glow/data.json`

## Development

```bash
npm install
npm run dev
```

To build for distribution:

```bash
npm run build
```

## Roadmap

- **Manual gravity** controls for importance scoring.
- **Spatial heatmap / grid view**.
- **Explainable glow** (tooltips that explain why a note is glowing).

---

If you’re curious about the deeper architecture and formulae, see `00_SPEC_COGNITIVE_GLOW.md`.
