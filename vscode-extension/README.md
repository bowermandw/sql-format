# T-SQL Format (VS Code extension)

Formats T-SQL using the `sql-format` engine in this repo, driven by
RedGate-compatible JSON style configs.

## Features

- Registers a **Document Formatting Provider** for the `sql` language, so:
  - **Format Document** (`Shift+Alt+F`) reformats the file.
  - **Format on Save** works when enabled for SQL.
- **Format SQL Document** command (`sqlFormat.formatDocument`).
- **Quick formatting overrides** for the most common style choices (identifier and
  data-type bracketing, statement semicolons, line endings) — set them in Settings
  without hand-editing a JSON style file. They layer over the resolved style config,
  matching the `sql-format` CLI flags.
- **Analyzer warnings as diagnostics.** Opt-in checks (missing schema, missing alias,
  missing `SET NOCOUNT ON`, missing column nullability, `INSERT…SELECT` column
  mapping) appear as squiggles and in the **Problems** panel, updating as you type —
  independent of formatting.
- **Auto-update from GitHub Releases.** Since the extension is distributed via
  [GitHub Releases](https://github.com/bowermandw/sql-format/releases) rather than the
  Marketplace, it checks for a newer release on startup (at most once per day) and
  offers to download, install, and reload. Run **T-SQL Format: Check for Updates**
  (`sqlFormat.checkForUpdates`) to check on demand.

## Configuration

### Style config

| Setting | Default | Description |
|---------|---------|-------------|
| `sqlFormat.styleFile` | `""` | Path to a JSON style config. Relative paths resolve against the workspace folder. |
| `sqlFormat.autoDetectStyleFile` | `true` | When no style file is set, use a `.sqlformat.json` in the workspace root if present. |
| `sqlFormat.checkForUpdates` | `true` | Check GitHub Releases for a newer version on startup (once per day) and offer to install it. Disable to only update via the manual command. |

Config resolution order per format: `styleFile` → auto-detected `.sqlformat.json`
→ built-in defaults. The style file is read on every format, so edits take effect
without reloading the window.

### Formatting overrides

Each overrides the corresponding value from the resolved style config. The default
`default` leaves the style config untouched (mirrors "flag not passed" on the CLI).

| Setting | Values (default first) | CLI flag |
|---------|------------------------|----------|
| `sqlFormat.encloseIdentifiers` | `default` · `asis` · `withBrackets` · `withoutBrackets` | `--enclose-identifiers` |
| `sqlFormat.encloseDataTypes` | `default` · `asis` · `withBrackets` · `withoutBrackets` | `--enclose-datatypes` |
| `sqlFormat.insertSemicolons` | `default` · `insert` · `remove` · `asis` | `--insert-semicolons` |
| `sqlFormat.lineEnding` | `default` · `lf` · `crlf` | `--line-ending` |

### Analyzer warnings

All default to `false`. Enable any of them to see the corresponding warnings as
squiggles and **Problems** entries (source `sql-format`). Warnings refresh on open,
edit (debounced), save, and when these settings change; they clear when no check is
enabled.

| Setting | Warns when… | CLI flag |
|---------|-------------|----------|
| `sqlFormat.warnMissingSchema` | a table/view/proc reference has no schema prefix | `--warn-missing-schema` |
| `sqlFormat.warnMissingAlias` | a table/view in `FROM`/`JOIN` has no alias | `--warn-missing-alias` |
| `sqlFormat.warnMissingNocount` | a stored procedure body lacks `SET NOCOUNT ON` | `--warn-missing-nocount` |
| `sqlFormat.warnMissingNullability` | a temp-table/table-variable column omits `NULL`/`NOT NULL` | `--warn-missing-nullability` |
| `sqlFormat.checkInsertColumns` | reports `INSERT…SELECT` column mapping and flags mismatches | `--check-insert-columns` |

## Develop

```bash
npm install
npm run build        # bundle src/extension.ts + the formatter into out/extension.js
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host, open a
`.sql` file, and run **Format Document**.

## Package a VSIX

```bash
npm install          # first time only
npm run package      # bundles, then writes sql-format-vscode-<version>.vsix
```

`npm run package` runs the esbuild bundle and `vsce package` in one step (no
separate `npm run build` needed). The `.vsix` is written to this directory, named
from the `version` in `package.json`.

Install it with `code --install-extension sql-format-vscode-<version>.vsix` or via
the Extensions view → "Install from VSIX…". (The published release VSIX comes from
the `Release VSIX` GitHub Action, which runs the same command on each `v*` tag.)

The version here must match the repo root's `package.json` and the release tag — bump
both with `npm run bump <version>` from the repo root, in the same commit as your
change. CI checks the versions agree on every PR, and the release workflow refuses a
tag that does not match the committed version.

## How it bundles

esbuild inlines `../../src/api.ts` (and the whole formatter) into a single
`out/extension.js`. The formatter has zero runtime dependencies, so the only
external left is the `vscode` API provided by the editor.
