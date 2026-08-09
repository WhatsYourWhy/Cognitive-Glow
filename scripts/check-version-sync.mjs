#!/usr/bin/env node
// Enforces the release version invariants from CLAUDE.md so a mis-bump cannot
// reach a tag:
//
//   1. manifest.json version === package.json version
//   2. versions.json has an entry for that version, mapping to minAppVersion
//   3. when a tag is supplied, tag === manifest.json version
//
// Obsidian's plugin store matches the release tag against manifest.json as a
// plain string, so a mismatch publishes a release the store cannot resolve.
//
// Usage:
//   node scripts/check-version-sync.mjs            # checks 1 + 2 (CI, any branch)
//   node scripts/check-version-sync.mjs 0.5.0      # also checks 3 (release)

import { readFileSync } from "node:fs";

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));

const manifest = read("manifest.json");
const pkg = read("package.json");
const versions = read("versions.json");

const tag = (process.argv[2] ?? "").trim();
const errors = [];

if (pkg.version !== manifest.version) {
  errors.push(
    `package.json version '${pkg.version}' does not match manifest.json version '${manifest.version}'`,
  );
}

const mapped = versions[manifest.version];
if (mapped === undefined) {
  errors.push(
    `versions.json has no entry for '${manifest.version}'. Add "${manifest.version}": "${manifest.minAppVersion}".`,
  );
} else if (mapped !== manifest.minAppVersion) {
  errors.push(
    `versions.json['${manifest.version}'] is '${mapped}' but manifest.json minAppVersion is '${manifest.minAppVersion}'`,
  );
}

if (tag && tag !== manifest.version) {
  errors.push(
    `tag '${tag}' does not match manifest.json version '${manifest.version}'`,
  );
}

if (errors.length > 0) {
  const prefix = process.env.GITHUB_ACTIONS ? "::error::" : "error: ";
  for (const message of errors) console.error(`${prefix}${message}`);
  process.exit(1);
}

console.log(
  `version sync OK — manifest=${manifest.version} package=${pkg.version} ` +
    `minAppVersion=${manifest.minAppVersion} versions.json=${mapped}` +
    (tag ? ` tag=${tag}` : " (no tag checked)"),
);
