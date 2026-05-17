# Cognitive Glow — Project Notes

Obsidian plugin: note-activity heatmap in a sidebar. Navigate the vault by
visual glow instead of hunting filenames.

- **Repo:** https://github.com/WhatsYourWhy/Cognitive-Glow
- **Build:** `npm run build` (esbuild → `main.js` at repo root)
- **Lint:** `npm run lint` (must pass clean before any release)
- **Test:** `npm test`

## Release process — DO NOT bypass the workflow

Releases ship via `.github/workflows/release.yml`. The workflow builds, signs
the artifacts with GitHub artifact attestations, and uploads `main.js`,
`styles.css`, and `manifest.json` to the release.

To cut a release:

1. Bump `version` in BOTH `manifest.json` AND `package.json` (must stay in sync).
2. Commit: `git commit -m "chore: bump to X.Y.Z"` and push.
3. Tag (NO `v` prefix — Obsidian convention): `git tag X.Y.Z`.
4. Push tag: `git push origin X.Y.Z`. Workflow fires automatically.
5. Verify after green: `gh attestation verify main.js -R WhatsYourWhy/Cognitive-Glow`.

**Never** upload `main.js` / `styles.css` to a release by hand. That overwrites
the attested artifacts and re-introduces the "no attestation" submission warning.

The tag name MUST equal the `manifest.json` version exactly. Obsidian's plugin
store matches them as strings.

## Conventions

- **ESLint plugin:** use `eslint-plugin-import-x` (NOT the deprecated
  `eslint-plugin-import`). Rules are prefixed `import-x/` in the config.
  The Obsidian submission linter flags the old package as a deprecation.
- **Line endings:** all text files are LF (enforced via `.gitattributes` and
  `core.autocrlf=input`). Don't let editors save CRLF — it produces phantom
  diffs and breaks reproducible release-asset hashes.
- **Submission warnings:** Obsidian's plugin submission process tightened in
  May 2026. Expect lint + provenance + release-notes checks. The release
  workflow handles attestation and notes auto-generation; the lint config
  handles the rest.
