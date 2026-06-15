import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  formatSql, mergeConfig, DEFAULT_CONFIG, FormatConfig,
  analyzeSql, Warning, AnalyzeOptions,
} from '../../src/api';
import { registerAutoUpdate } from './updater';

const AUTO_DETECT_FILENAME = '.sqlformat.json';

/** Boolean settings that map 1:1 to AnalyzeOptions (and the CLI analyze flags). */
const ANALYZE_SETTING_KEYS = [
  'warnMissingSchema',
  'warnMissingAlias',
  'warnMissingNocount',
  'warnMissingNullability',
  'checkInsertColumns',
] as const;

const DEBOUNCE_MS = 300;

let diagnostics: vscode.DiagnosticCollection | undefined;
const debounceTimers = new Map<string, NodeJS.Timeout>();

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

  // Analyzer warnings surface as diagnostics (squiggles + Problems panel),
  // independent of formatting: refreshed on open/change/save and when settings change.
  diagnostics = vscode.languages.createDiagnosticCollection('sqlFormat');
  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(doc => refreshDiagnostics(doc)),
    vscode.workspace.onDidChangeTextDocument(e => scheduleRefresh(e.document)),
    vscode.workspace.onDidSaveTextDocument(doc => refreshDiagnostics(doc)),
    vscode.workspace.onDidCloseTextDocument(doc => {
      cancelScheduled(doc);
      diagnostics?.delete(doc.uri);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration('sqlFormat')) {
        return;
      }
      for (const doc of vscode.workspace.textDocuments) {
        refreshDiagnostics(doc);
      }
    })
  );

  // Cover SQL documents already open at activation.
  for (const doc of vscode.workspace.textDocuments) {
    refreshDiagnostics(doc);
  }

  registerAutoUpdate(context);
}

export function deactivate(): void {
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
  diagnostics?.dispose();
  diagnostics = undefined;
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
 * Per-setting overrides (encloseIdentifiers, encloseDataTypes, insertSemicolons,
 * lineEnding) are then layered on top, mirroring the CLI flags' precedence.
 * Read per-invocation so edits to the style file take effect without reload.
 */
function resolveConfig(document: vscode.TextDocument): FormatConfig {
  const settings = vscode.workspace.getConfiguration('sqlFormat', document.uri);
  return applySettingOverrides(resolveBaseConfig(document, settings), settings);
}

function resolveBaseConfig(
  document: vscode.TextDocument,
  settings: vscode.WorkspaceConfiguration
): FormatConfig {
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

/**
 * Layer the discrete formatting settings over a resolved config, matching the
 * CLI flags `--enclose-identifiers`, `--enclose-datatypes`, `--insert-semicolons`
 * and `--line-ending`. The sentinel `"default"` leaves the style config untouched.
 * Spreads (never mutation) keep DEFAULT_CONFIG and any cached config intact.
 */
function applySettingOverrides(
  config: FormatConfig,
  settings: vscode.WorkspaceConfiguration
): FormatConfig {
  let result = config;

  const encloseIdentifiers = settings.get<string>('encloseIdentifiers');
  if (encloseIdentifiers && encloseIdentifiers !== 'default') {
    result = {
      ...result,
      identifiers: {
        ...result.identifiers,
        encloseIdentifiers: encloseIdentifiers as FormatConfig['identifiers']['encloseIdentifiers'],
      },
    };
  }

  const encloseDataTypes = settings.get<string>('encloseDataTypes');
  if (encloseDataTypes && encloseDataTypes !== 'default') {
    result = {
      ...result,
      dataTypes: {
        ...result.dataTypes,
        encloseDataTypes: encloseDataTypes as FormatConfig['dataTypes']['encloseDataTypes'],
      },
    };
  }

  const insertSemicolons = settings.get<string>('insertSemicolons');
  if (insertSemicolons && insertSemicolons !== 'default') {
    result = {
      ...result,
      whitespace: {
        ...result.whitespace,
        insertSemicolons: insertSemicolons as FormatConfig['whitespace']['insertSemicolons'],
      },
    };
  }

  const lineEnding = settings.get<string>('lineEnding');
  if (lineEnding && lineEnding !== 'default') {
    result = {
      ...result,
      whitespace: {
        ...result.whitespace,
        lineEnding: lineEnding as FormatConfig['whitespace']['lineEnding'],
      },
    };
  }

  return result;
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

/** Debounce a diagnostics refresh for a document (e.g. on every keystroke). */
function scheduleRefresh(document: vscode.TextDocument): void {
  if (document.languageId !== 'sql') {
    return;
  }
  const key = document.uri.toString();
  const existing = debounceTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }
  debounceTimers.set(key, setTimeout(() => {
    debounceTimers.delete(key);
    refreshDiagnostics(document);
  }, DEBOUNCE_MS));
}

function cancelScheduled(document: vscode.TextDocument): void {
  const key = document.uri.toString();
  const existing = debounceTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    debounceTimers.delete(key);
  }
}

/**
 * Re-run the analyzer for a SQL document and publish its warnings as diagnostics.
 * Reads the per-document `sqlFormat.warn*` / `checkInsertColumns` settings; if none
 * are enabled the collection is cleared. Failure-safe: a parse error on in-progress
 * edits leaves the previous diagnostics in place rather than throwing.
 */
function refreshDiagnostics(document: vscode.TextDocument): void {
  if (!diagnostics || document.languageId !== 'sql') {
    return;
  }

  const settings = vscode.workspace.getConfiguration('sqlFormat', document.uri);
  const options: AnalyzeOptions = {
    warnMissingSchema: settings.get<boolean>('warnMissingSchema') === true,
    warnMissingAlias: settings.get<boolean>('warnMissingAlias') === true,
    warnMissingNocount: settings.get<boolean>('warnMissingNocount') === true,
    warnMissingNullability: settings.get<boolean>('warnMissingNullability') === true,
    checkInsertColumns: settings.get<boolean>('checkInsertColumns') === true,
  };

  const anyEnabled = ANALYZE_SETTING_KEYS.some(key => options[key]);
  if (!anyEnabled) {
    diagnostics.delete(document.uri);
    return;
  }

  let warnings: Warning[];
  try {
    warnings = analyzeSql(document.getText(), options);
  } catch {
    // Mid-edit SQL may not parse — keep the last good diagnostics, skip this update.
    return;
  }

  diagnostics.set(document.uri, warnings.map(w => toDiagnostic(document, w)));
}

function toDiagnostic(document: vscode.TextDocument, w: Warning): vscode.Diagnostic {
  const diag = new vscode.Diagnostic(
    wholeLineRange(document, w.line),
    w.message,
    vscode.DiagnosticSeverity.Warning
  );
  diag.source = 'sql-format';
  return diag;
}

/**
 * Map an analyzer warning's 1-based (optional) line to a whole-line range.
 * Line-less warnings anchor at line 0; lines past the current buffer are clamped.
 */
function wholeLineRange(document: vscode.TextDocument, line?: number): vscode.Range {
  const zeroBased = line && line > 0 ? line - 1 : 0;
  const clamped = Math.min(zeroBased, Math.max(0, document.lineCount - 1));
  return document.lineAt(clamped).range;
}
