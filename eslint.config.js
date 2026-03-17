import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import sdl from "@microsoft/eslint-plugin-sdl";
import importPlugin from "eslint-plugin-import";

// Mirror Obsidian plugin recommended rules (full set, no "extends")
const obsidianmdRules = {
  "obsidianmd/commands/no-command-in-command-id": "error",
  "obsidianmd/commands/no-command-in-command-name": "error",
  "obsidianmd/commands/no-default-hotkeys": "error",
  "obsidianmd/commands/no-plugin-id-in-command-id": "error",
  "obsidianmd/commands/no-plugin-name-in-command-name": "error",
  "obsidianmd/settings-tab/no-manual-html-headings": "error",
  "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
  "obsidianmd/vault/iterate": "error",
  "obsidianmd/detach-leaves": "error",
  "obsidianmd/hardcoded-config-path": "error",
  "obsidianmd/no-forbidden-elements": "error",
  "obsidianmd/no-plugin-as-component": "error",
  "obsidianmd/no-sample-code": "error",
  "obsidianmd/no-tfile-tfolder-cast": "error",
  "obsidianmd/no-view-references-in-plugin": "error",
  "obsidianmd/no-static-styles-assignment": "error",
  "obsidianmd/object-assign": "error",
  "obsidianmd/platform": "error",
  "obsidianmd/prefer-file-manager-trash-file": "warn",
  "obsidianmd/prefer-abstract-input-suggest": "error",
  "obsidianmd/regex-lookbehind": "error",
  "obsidianmd/sample-names": "error",
  "obsidianmd/validate-manifest": "error",
  "obsidianmd/validate-license": ["error"],
  "obsidianmd/ui/sentence-case": ["error", { enforceCamelCaseLower: true }],
};

const generalRules = {
  "no-unused-vars": "off",
  "no-prototype-builtins": "off",
  "no-self-compare": "warn",
  "no-eval": "error",
  "no-implied-eval": "error",
  "prefer-const": "off",
  "no-implicit-globals": "error",
  "no-console": ["error", { allow: ["warn", "error", "debug"] }],
  "no-restricted-globals": [
    "error",
    {
      name: "app",
      message:
        "Avoid using the global app object. Instead use the reference provided by your plugin instance.",
    },
    {
      name: "fetch",
      message:
        "Use the built-in `requestUrl` function instead of `fetch` for network requests in Obsidian.",
    },
    {
      name: "localStorage",
      message:
        "Prefer `App#saveLocalStorage` / `App#loadLocalStorage` functions to write / read localStorage data that's unique to a vault.",
    },
  ],
  "no-restricted-imports": [
    "error",
    { name: "axios", message: "Use the built-in `requestUrl` function instead of `axios`." },
    { name: "superagent", message: "Use the built-in `requestUrl` function instead of `superagent`." },
    { name: "got", message: "Use the built-in `requestUrl` function instead of `got`." },
    { name: "ofetch", message: "Use the built-in `requestUrl` function instead of `ofetch`." },
    { name: "ky", message: "Use the built-in `requestUrl` function instead of `ky`." },
    { name: "node-fetch", message: "Use the built-in `requestUrl` function instead of `node-fetch`." },
    {
      name: "moment",
      message: "The 'moment' package is bundled with Obsidian. Please import it from 'obsidian' instead.",
    },
  ],
  "no-alert": "error",
  "no-undef": "error",
  "@typescript-eslint/ban-ts-comment": "off",
  "@typescript-eslint/no-deprecated": "error",
  "@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],
  "@typescript-eslint/require-await": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/no-explicit-any": ["error", { fixToUnknown: true }],
  "@microsoft/sdl/no-document-write": "error",
  "@microsoft/sdl/no-inner-html": "error",
};

export default [
  { ignores: ["main.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      obsidianmd,
      "@microsoft/sdl": sdl,
      import: importPlugin,
    },
    languageOptions: {
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        console: "readonly",
        window: "readonly",
      },
    },
    rules: {
      ...generalRules,
      ...obsidianmdRules,
      // isDesktopOnly: true in manifest, so allow Node modules on desktop
      "import/no-nodejs-modules": "off",
      "import/no-extraneous-dependencies": "error",
    },
  },
];
