---
title: Cognitive Glow - Implementation Notes
status: active
version: 0.1.0
---

# Cognitive Glow (current behavior)

This document describes what the plugin does today.

## Scope

The plugin renders a sidebar **ranked list** (not a spatial grid) of notes, ordered by glow score.

## Data model

Per note (`path` key):

- `hitCount` (incremented on note open)
- `lastOpened` (timestamp on note open)
- `manualGravity` (optional; only used if present)
- `dwellMs` (optional field preserved in storage, not used in scoring)

Top-level persisted payload:

- `version`
- `stats`
- `settings`

Stored via Obsidian plugin data APIs in `.obsidian/plugins/cognitive-glow/data.json`.

## Scoring

For each note:

- `recency = exp(-(now - recencyAnchor) / tauRecencyMs)`
- `frequency = log(1 + hitCount) / log(1 + hitCountMaxScale)`
- `gravity = clamp(manualGravity, 0, 1)` or `0` if absent
- `glowScore = clamp(weightRecency*recency + weightFrequency*frequency + weightGravity*gravity, 0, 1)`

`recencyAnchor` uses `lastOpened`, falling back to file `mtime` during migration/loading only when needed.

## Runtime behavior

- Registers a right-sidebar view and renders rows with width/opacity based on glow score.
- Supports view-local toggle:
  - **Normal**: all notes (optionally filter very low glow)
  - **Focus**: top `focusTopN`
- Clicking a row opens that note.
- Handles vault rename/delete to migrate/remove stats entries.
- Debounced save (~5s) after updates.

## Commands

- `Open sidebar`
- `Pin or unpin active note` (toggles `manualGravity` between 1 and 0; also
  exposed via the file right-click menu)
- `Dump Glow Scores to Console`
- `Show Persisted Data (JSON)`

## Defaults

- `tauRecencyMs`: `259200000` (3 days)
- `hitCountMaxScale`: `20`
- `weightRecency`: `0.6`
- `weightFrequency`: `0.4`
- `weightGravity`: `0.0`
- `focusTopN`: `5`
- `showArchived` (UI label: Show low-glow notes): `true`
- `maxRecords`: `3000`

## Not implemented in current code

- Spatial heatmap/grid layout
- Explainability tooltips for score breakdown

Manual gravity is editable via the `Pin or unpin active note` command and the
file context menu (sets `manualGravity` to 1 or 0). User-typed include/exclude
folder paths are run through Obsidian's `normalizePath()` before matching.
