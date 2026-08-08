# Contributing to Cognitive Glow

Thanks for your interest in improving Cognitive Glow! Bug reports, fixes, and
focused feature proposals are all welcome.

## Getting started

You'll need [Node.js](https://nodejs.org/) 20 (the version CI runs).

```bash
git clone https://github.com/WhatsYourWhy/Cognitive-Glow.git
cd Cognitive-Glow
npm install
npm run build        # one-shot compile → main.js
npm run dev          # watch mode
npm run lint         # eslint, including Obsidian plugin rules
npm test             # unit tests (node --test)
```

### Trying your build in Obsidian

Copy `manifest.json`, `main.js`, and `styles.css` into
`<your vault>/.obsidian/plugins/cognitive-glow/`, then reload Obsidian and
enable the plugin under **Settings → Community plugins**. Re-copy `main.js`
(or point a symlink at the repo) after each rebuild.

## Project layout

| Path | Purpose |
|---|---|
| `core/` | Pure scoring/persistence logic — no Obsidian imports, unit-testable |
| `plugin/` | Plugin entry point, settings, Obsidian API integration |
| `ui/` | The sidebar glow view |
| `tests/` | Unit tests for `core/` |

Keep vault- and UI-independent logic in `core/` so it stays testable.

## Before you open a PR

- **`npm run lint` and `npm test` must pass.** CI runs lint → test → build on
  every push and PR, and the release workflow refuses to ship a commit that
  fails them.
- **Line endings are LF.** Enforced via `.gitattributes`; don't let your
  editor save CRLF (it creates phantom diffs and breaks reproducible release
  hashes).
- **Lint rules are load-bearing.** The config mirrors Obsidian's plugin
  submission checks (`eslint-plugin-obsidianmd`, `eslint-plugin-import-x`) —
  please don't disable rules to get code through; ask in an issue instead.
- Keep PRs focused: one fix or feature per PR, with a short description of
  the user-visible behavior change.
- Commit messages loosely follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:` …), matching the existing history.

## Releases (maintainer-only)

Releases are cut by tagging (`X.Y.Z`, no `v` prefix — the tag must equal the
`manifest.json` version). The GitHub Actions release workflow lints, tests,
builds, signs the artifacts with GitHub artifact attestations, and uploads
them. Release artifacts are **never** uploaded by hand — that would break
attestation verification (`gh attestation verify main.js -R WhatsYourWhy/Cognitive-Glow`).

## Reporting bugs and security issues

- Bugs and feature requests: [GitHub issues](https://github.com/WhatsYourWhy/Cognitive-Glow/issues).
  Include your Obsidian version and steps to reproduce.
- Security issues: please use GitHub's
  [private vulnerability reporting](https://github.com/WhatsYourWhy/Cognitive-Glow/security)
  instead of a public issue.

## License

By contributing you agree that your contributions are licensed under the
project's [MIT license](LICENSE).
