import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { formatSql, mergeConfig, DEFAULT_CONFIG, FormatConfig } from '../../src/api';

const AUTO_DETECT_FILENAME = '.sqlformat.json';

export function activate(context: vscode.ExtensionContext): void {
  const provider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document) {
      return formatDocument(document);
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider('sql', provider),
    vscode.commands.registerCommand('sqlFormat.formatDocument', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const edits = formatDocument(editor.document);
      if (edits && edits.length > 0) {
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(editor.document.uri, edits);
        await vscode.workspace.applyEdit(workspaceEdit);
      }
    })
  );
}

export function deactivate(): void {
  // nothing to clean up
}

/**
 * Format the whole document and return a single full-range replace edit.
 * Returns an empty array on failure (never corrupts the buffer).
 */
function formatDocument(document: vscode.TextDocument): vscode.TextEdit[] {
  const original = document.getText();
  let config: FormatConfig;
  try {
    config = resolveConfig(document);
  } catch (err) {
    vscode.window.showErrorMessage(`sql-format: failed to load style config — ${errorMessage(err)}`);
    return [];
  }

  let formatted: string;
  try {
    formatted = formatSql(original, config);
  } catch (err) {
    vscode.window.showErrorMessage(`sql-format: could not format document — ${errorMessage(err)}`);
    return [];
  }

  if (formatted === original) {
    return [];
  }

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(original.length)
  );
  return [vscode.TextEdit.replace(fullRange, formatted)];
}

/**
 * Resolve the style config for a document:
 *  1. `sqlFormat.styleFile` setting (relative paths resolve against the workspace folder)
 *  2. auto-detected `.sqlformat.json` in the workspace root (if enabled)
 *  3. DEFAULT_CONFIG
 * Read per-invocation so edits to the style file take effect without reload.
 */
function resolveConfig(document: vscode.TextDocument): FormatConfig {
  const settings = vscode.workspace.getConfiguration('sqlFormat', document.uri);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const folderPath = workspaceFolder?.uri.fsPath;

  const styleFile = (settings.get<string>('styleFile') ?? '').trim();
  if (styleFile) {
    const resolved = path.isAbsolute(styleFile) || !folderPath
      ? styleFile
      : path.join(folderPath, styleFile);
    return readConfigFile(resolved);
  }

  if (settings.get<boolean>('autoDetectStyleFile') !== false && folderPath) {
    const candidate = path.join(folderPath, AUTO_DETECT_FILENAME);
    if (fs.existsSync(candidate)) {
      return readConfigFile(candidate);
    }
  }

  return DEFAULT_CONFIG;
}

function readConfigFile(filePath: string): FormatConfig {
  if (!fs.existsSync(filePath)) {
    throw new Error(`style file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return mergeConfig(JSON.parse(raw));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
