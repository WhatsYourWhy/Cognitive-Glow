# Cognitive Glow — Project Notes

Obsidian plugin: note-activity heatmap in a sidebar. Navigate the vault by
visual glow instead of hunting filenames.

- **Repo:** https://github.com/WhatsYourWhy/Cognitive-Glow
- **Build:** `npm run build` (esbuild → `main.js` at repo root)
- **Lint:** `npm run lint` (must pass clean before any release)
- **Typecheck:** `npm run typecheck` — esbuild strips types WITHOUT checking them,
  so this is the only gate that catches a type error. Covers both tsconfigs.
- **Test:** `npm test`
- **Version sync:** `npm run check:versions` (see Release process below)

## Release process — DO NOT bypass the workflow

Releases ship via `.github/workflows/release.yml`. The workflow builds, signs
the artifacts with GitHub artifact attestations, and uploads `main.js`,
`styles.css`, and `manifest.json` to the release.

The release workflow runs `check:versions` + `lint` + `typecheck` + `test` before
`build`, so a broken commit cannot ship. CI also runs on push-to-main as a second
gate.

Steps 1, 2 and 4 below are enforced by `scripts/check-version-sync.mjs`, which
runs in CI (without the tag check) and as the FIRST release step, before
`npm ci` — so a mistyped tag fails in seconds. It is a guard, not a substitute:
you still have to do the bumps.

To cut a release, run the release script. It performs every step below in
one atomic local operation and refuses to tag an un-bumped or dirty tree:

    npm run release -- X.Y.Z          # bump + verify + commit + tag; prints push commands
    npm run release -- X.Y.Z --push   # ...and push main + tag; workflow fires

What it does (only do these by hand if the script cannot run):

1. Bump `version` in BOTH `manifest.json` AND `package.json` (must stay in sync).
2. Add an entry to `versions.json` mapping the new version to its
   `minAppVersion` (e.g. `"0.3.0": "1.5.0"`). Required for Obsidian to install
   the correct version on users running older Obsidian releases. Do this even
   if `minAppVersion` hasn't changed — the file's history must be continuous.
3. Run `check:versions`, `lint`, `typecheck`, `test`, `build` locally.
4. Commit: `git commit -m "chore: bump to X.Y.Z"` and push.
5. Tag (NO `v` prefix — Obsidian convention): `git tag X.Y.Z`.
6. Push tag: `git push origin X.Y.Z`. Workflow fires automatically.
7. Verify after green: `gh attestation verify main.js -R WhatsYourWhy/Cognitive-Glow`.

**Never** create the release from GitHub's "Draft a new release" UI with a new
tag. The UI creates the tag (and a published, empty release marked Latest)
*before* the workflow's version guard runs. If the guard fails you are left
with a live release that has no assets, and Obsidian's updater finds nothing
to download. That is exactly what happened with 0.6.0 on 2026-09-15. Let
`release.yml` create the release; it only does so after every gate passes.

**Never** upload `main.js` / `styles.css` to a release by hand. That overwrites
the attested artifacts and re-introduces the "no attestation" submission warning.

The tag name MUST equal the `manifest.json` version exactly. Obsidian's plugin
store matches them as strings.

## Branch rules on `main` (GitHub rulesets, set 2026-09-18)

- **Require CI on main:** the `build` check from `ci.yml` must be green before
  a PR can merge. Not strict — PRs don't need to be up to date with `main`, so
  stacked dependabot PRs don't need rebasing against each other.
- **Admin bypass is intentional.** A required check also gates direct pushes,
  and `npm run release -- X.Y.Z --push` pushes a brand-new bump commit to
  `main` before CI has run on it. Repository admins bypass the rule so that
  push succeeds; PR merges still show the check as required and need an
  explicit "bypass rules" click to merge red. Don't remove the bypass without
  switching releases to a PR-based flow.
- **Restrict Deletes:** `main` cannot be deleted.
- **Auto-delete head branches** is on. Merged PR branches vanish from origin
  automatically; don't rely on them after merge.
- Rulesets are repo settings, not code. Inspect them with
  `gh api repos/WhatsYourWhy/Cognitive-Glow/rulesets` and the effective set
  with `gh api repos/WhatsYourWhy/Cognitive-Glow/rules/branches/main`.

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
