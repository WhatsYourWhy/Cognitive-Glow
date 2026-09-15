#!/usr/bin/env node
// Cuts a release in one atomic local step so a tag can never land on an
// un-bumped commit. (That is how the empty 0.6.0 release happened on
// 2026-09-15: the tag was created from the GitHub UI before any bump, the
// workflow's version guard failed, and a published release with no assets
// was left behind marked "Latest".)
//
// Usage:
//   npm run release -- 0.6.0          # bump, verify, commit, tag; prints push commands
//   npm run release -- 0.6.0 --push   # ...then push main + tag (fires release.yml)
//
// Steps, in order:
//   1. Refuse unless: on main, clean tree, not behind origin/main, tag absent
//      locally and on origin, version is plain X.Y.Z and greater than current.
//   2. Bump package.json + package-lock.json (npm version), manifest.json,
//      and append the versions.json entry.
//   3. Run check:versions, lint, typecheck, test, build — the same gates as
//      release.yml — so a green local run means a green release run.
//   4. Commit "chore: bump to X.Y.Z" and tag X.Y.Z (no `v` prefix).

import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const push = args.includes("--push");
const version = args.find((a) => !a.startsWith("--"));

const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const git = (...gitArgs) =>
  execFileSync("git", gitArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

// npm is `npm.cmd` on Windows, so it has to go through a shell.
const step = (label, command) => {
  console.log(`\n== ${label}: ${command}`);
  execSync(command, { cwd: root, stdio: "inherit" });
};

const readJson = (name) =>
  JSON.parse(readFileSync(path.join(root, name), "utf8"));
const writeJson = (name, value) =>
  writeFileSync(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`);

// ---------------------------------------------------------------- preflight

if (!version) fail("usage: npm run release -- X.Y.Z [--push]");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`version '${version}' must be plain X.Y.Z (no 'v' prefix, no prerelease)`);
}

const manifest = readJson("manifest.json");
const newer = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
};
if (!newer(version, manifest.version)) {
  fail(`version '${version}' is not greater than current '${manifest.version}'`);
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main") fail(`must release from main (on '${branch}')`);

if (git("status", "--porcelain") !== "") {
  fail("working tree is not clean; commit or stash first");
}

console.log("== fetching origin");
git("fetch", "--quiet", "--tags", "origin", "main");
try {
  git("merge-base", "--is-ancestor", "origin/main", "HEAD");
} catch {
  fail("main is behind origin/main; pull first");
}

let tagExistsLocally = true;
try {
  git("rev-parse", "--verify", "--quiet", `refs/tags/${version}`);
} catch {
  tagExistsLocally = false;
}
if (tagExistsLocally) fail(`tag '${version}' already exists locally`);
if (git("ls-remote", "--tags", "origin", `refs/tags/${version}`) !== "") {
  fail(`tag '${version}' already exists on origin`);
}

// --------------------------------------------------------------------- bump

console.log(`== bumping ${manifest.version} -> ${version}`);
step(
  "package.json + package-lock.json",
  `npm version ${version} --no-git-tag-version`,
);

manifest.version = version;
writeJson("manifest.json", manifest);

const versions = readJson("versions.json");
versions[version] = manifest.minAppVersion;
writeJson("versions.json", versions);

// ------------------------------------------------------------------- verify

step("check:versions", `node scripts/check-version-sync.mjs ${version}`);
step("lint", "npm run -s lint");
step("typecheck", "npm run -s typecheck");
step("test", "npm test");
step("build", "npm run -s build");

const bumpFiles = [
  "manifest.json",
  "package.json",
  "package-lock.json",
  "versions.json",
];
const artifactFiles = ["main.js", "styles.css"];
const changed = git("status", "--porcelain")
  .split("\n")
  .filter(Boolean)
  .map((line) => line.slice(3).trim());

const unexpected = changed.filter(
  (file) => !bumpFiles.includes(file) && !artifactFiles.includes(file),
);
if (unexpected.length > 0) {
  fail(`unexpected changes after build: ${unexpected.join(", ")}`);
}
const rebuilt = changed.filter((file) => artifactFiles.includes(file));
if (rebuilt.length > 0) {
  console.log(
    `== note: build changed ${rebuilt.join(", ")}; including in the bump commit`,
  );
}

// ------------------------------------------------------------- commit + tag

git("add", "--", ...bumpFiles, ...rebuilt);
git("commit", "--quiet", "-m", `chore: bump to ${version}`);
git("tag", version);
console.log(
  `\n== committed ${git("rev-parse", "--short", "HEAD")} and tagged ${version}`,
);

if (push) {
  step("push main", "git push origin main");
  step("push tag", `git push origin ${version}`);
  console.log(`
Release workflow is running. Watch it with:
  gh run watch -R WhatsYourWhy/Cognitive-Glow
Then verify the attested artifact:
  gh attestation verify main.js -R WhatsYourWhy/Cognitive-Glow`);
} else {
  console.log(`
Nothing pushed. To ship (release.yml creates the GitHub release; never create it by hand):
  git push origin main
  git push origin ${version}`);
}
