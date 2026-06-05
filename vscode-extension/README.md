# T-SQL Format (VS Code extension)

Formats T-SQL using the `sql-format` engine in this repo, driven by
RedGate-compatible JSON style configs.

## Features

- Registers a **Document Formatting Provider** for the `sql` language, so:
  - **Format Document** (`Shift+Alt+F`) reformats the file.
  - **Format on Save** works when enabled for SQL.
- **Format SQL Document** command (`sqlFormat.formatDocument`).

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `sqlFormat.styleFile` | `""` | Path to a JSON style config. Relative paths resolve against the workspace folder. |
| `sqlFormat.autoDetectStyleFile` | `true` | When no style file is set, use a `.sqlformat.json` in the workspace root if present. |

Config resolution order per format: `styleFile` → auto-detected `.sqlformat.json`
→ built-in defaults. The style file is read on every format, so edits take effect
without reloading the window.

## Develop

```bash
npm install
npm run build        # bundle src/extension.ts + the formatter into out/extension.js
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host, open a
`.sql` file, and run **Format Document**.

## Package a VSIX

```bash
npm run build
npm run package      # -> sql-format-vscode-<version>.vsix
```

Install with `code --install-extension sql-format-vscode-<version>.vsix` or via
the Extensions view → "Install from VSIX…".

## How it bundles

esbuild inlines `../../src/api.ts` (and the whole formatter) into a single
`out/extension.js`. The formatter has zero runtime dependencies, so the only
external left is the `vscode` API provided by the editor.
