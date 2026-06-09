import { tokenize, attachComments } from './tokenizer';
import { parse } from './parser';
import { format } from './formatter';
import { DEFAULT_CONFIG, FormatConfig, mergeConfig } from './config';
import { analyze, Warning, AnalyzeOptions } from './analyzer';

/**
 * Format a SQL string end-to-end: tokenize -> attachComments -> parse -> format.
 *
 * @param sql     The SQL source text.
 * @param config  Either a full FormatConfig, or a partial set of overrides that
 *                will be deep-merged over DEFAULT_CONFIG. Omit for defaults.
 * @returns       The formatted SQL.
 */
export function formatSql(sql: string, config?: Partial<FormatConfig>): string {
  // Merging over DEFAULT_CONFIG is idempotent for a full config and fills gaps
  // for a partial one, so we always merge.
  const resolved = mergeConfig(config);
  const rawTokens = tokenize(sql);
  const tokens = attachComments(rawTokens);
  const ast = parse(tokens);
  return format(ast, resolved);
}

/**
 * Analyze a SQL string end-to-end: tokenize -> attachComments -> parse -> analyze.
 * Mirrors the CLI analyze pipeline. Throws if the SQL cannot be parsed; callers
 * running on in-progress edits (e.g. an editor) should wrap this in try/catch.
 */
export function analyzeSql(sql: string, options: AnalyzeOptions): Warning[] {
  const rawTokens = tokenize(sql);
  const tokens = attachComments(rawTokens);
  const ast = parse(tokens);
  return analyze(ast, options);
}

export { DEFAULT_CONFIG, mergeConfig };
export type { FormatConfig, Warning, AnalyzeOptions };
