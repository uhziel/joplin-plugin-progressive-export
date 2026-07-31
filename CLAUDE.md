# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Joplin desktop plugin ("Progressive Export") that registers a custom export module exporting Joplin notes into an **Obsidian-compatible directory tree** (YAML frontmatter, `assets/joplin/` resource folder, notebook hierarchy mapped to subdirectories). The plugin source is a single file: `src/index.ts`.

## Commands

- `npm run dist` — build the plugin. Runs webpack three times in sequence (`buildMain` → `buildExtraScripts` → `createArchive`); emits compiled JS to `dist/` and the final distributable `publish/<plugin-id>.jpl` + `<plugin-id>.json`. This is the only build step.
- `npm run updateVersion` — bump the patch version in **both** `package.json` and `src/manifest.json` (they must stay in sync).
- `npm run update` — regenerate the plugin framework via `generator-joplin` (yo). **Overwrites `webpack.config.js`** and merges `package.json`/`.gitignore`; leaves `src/` and `README.md` untouched.

There is **no test runner and no linter configured** — do not look for `npm test` / `npm run lint`. Verification is done by building and loading the `.jpl` into Joplin.

## Architecture

Everything lives in `src/index.ts`. The plugin calls `joplin.interop.registerExportModule` in `onStart`, registering an `obsidian` format exporter targeting `FileSystemItem.Directory`. The export is driven by Joplin through these lifecycle hooks:

- `onInit` — creates `context.destPath` and the `assets/joplin/` resource dir.
- `onProcessItem(context, itemType, item)` — dispatched on `itemType`:
  - `ModelType.Folder` (2) → `mkdirp` a subdir from `relativeDirPath(item)`, which walks the notebook `parent_id` chain via `joplin.data.get(['folders', id])` to build a `Parent/Child/.../` path.
  - `ModelType.Note` (1) → writes `<destPath>/<notebook path>/<safeFilename>.md` with `serialize(...)` output. Tags are fetched per-note via `joplin.data.get(['notes', id, 'tags'])`.
- `onProcessResource(context, resource, filePath)` — copies the resource file into `assets/joplin/`; if the resource has a `title` or `filename`, writes a sibling `<file>.metadata` JSON sidecar recording them.
- `onClose` — no-op.

### Conventions worth preserving

- **`ModelType` is locally defined** in `index.ts` (Note=1, Folder=2, Resource=4, Tag=5, NoteTag=6) rather than imported from the API — match existing values if extending.
- **Frontmatter** (`frontMatter`/`serialize`): emits `updated`, `created` (RFC3339, hardcoded `+08:00` offset in `rfc3339`), `tags`, `source` (from `note.source_url`), `location` (when lat/long ≠ 0), and `aliases`.
- **`aliases`** is set to the original note title when `safeFilename` had to sanitize it (currently `/` → `_`). The unsanitized title is preserved as an alias so Obsidian links still resolve — keep this behavior when changing filename handling.
- **`safeFilename`** takes a bare filename only (not a path).

## Repository layout & gotchas

- **`api/`** — vendored Joplin plugin API TypeScript definitions, aliased to `'api'` by both `webpack.config.js` and `tsconfig.json` (`baseUrl: "."`). These come from `generator-joplin`; do not edit.
- **`webpack.config.js`** — generator-managed; per `GENERATOR_DOC.md`, avoid editing directly (it's overwritten by `npm run update`). If build customization is needed, factor it into a separate required file.
- **`plugin.config.json`** — only contains `extraScripts` (currently empty). Content/webview scripts that need compilation go here, paths relative to `src/`.
- `dist/`, `publish/`, `node_modules/` are gitignored build artifacts.

Commit messages in this repo are written in Chinese.
