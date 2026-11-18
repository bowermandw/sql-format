import {
  SqlNode,
  BatchNode,
  SelectNode,
  InsertNode,
  UpdateNode,
  DeleteNode,
  CteNode,
  JoinNode,
  IdentifierNode,
  RawTokenNode,
  ParenGroupNode,
  BeginEndNode,
  IfElseNode,
  CreateProcedureNode,
  CreateTableNode,
  DeclareNode,
  ColumnDefNode,
  ConstraintNode,
  SetNode,
  LiteralNode,
  ExpressionNode,
  FunctionCallNode,
} from './ast';
import { Token } from './tokens';

export interface Warning {
  message: string;
  line?: number;
  col?: number;
}

export interface AnalyzeOptions {
  warnMissingSchema: boolean;
  warnMissingAlias: boolean;
  warnMissingNocount: boolean;
  warnMissingNullability: boolean;
  checkInsertColumns: boolean;
  /** Line up the select lists of UNION / EXCEPT / INTERSECT branches and flag count mismatches. */
  checkUnionColumns?: boolean;
}

type TempColumnRegistry = Map<string, string[]>;

export function analyze(ast: BatchNode, options: AnalyzeOptions): Warning[] {
  const warnings: Warning[] = [];
  const registry: TempColumnRegistry = new Map();

  for (const batch of ast.batches) {
    for (const stmt of batch.statements) {
      walkStatement(stmt, options, warnings, new Set<string>(), registry);
    }
  }

  return warnings;
}

function getIdentifierName(node: IdentifierNode): string {
  return node.parts.map(p => p.value).join('.');
}

function getIdentifierLine(node: IdentifierNode): number | undefined {
  return node.parts[0]?.line;
}

function isTempOrVariable(node: IdentifierNode): boolean {
  const first = node.parts[0]?.value;
  if (!first) return false;
  // Strip leading bracket for quoted identifiers like [#temp] or [@var]
  const name = first.startsWith('[') ? first.slice(1) : first;
  return name.startsWith('#') || name.startsWith('@');
}

function checkTableReference(
  node: SqlNode,
  options: AnalyzeOptions,
  warnings: Warning[],
  cteNames: Set<string>,
  checkAlias: boolean,
): void {
  if (node.type !== 'identifier') return;

  const ident = node as IdentifierNode;
  if (isTempOrVariable(ident)) return;

  const name = getIdentifierName(ident);
  if (cteNames.has(name.toUpperCase())) return;

  const line = getIdentifierLine(ident);

  if (options.warnMissingSchema && ident.parts.length === 1) {
    const msg = `Warning: Schema is missing from ${name}`;
    warnings.push({ message: line ? `${msg} (line ${line})` : msg, line });
  }

  if (checkAlias && options.warnMissingAlias && !ident.alias) {
    const msg = `Warning: ${name} is not aliased`;
    warnings.push({ message: line ? `${msg} (line ${line})` : msg, line });
  }
}

function walkStatement(
  node: SqlNode,
  options: AnalyzeOptions,
  warnings: Warning[],
  cteNames: Set<string>,
  registry: TempColumnRegistry,
): void {
  if (!node) return;

  switch (node.type) {
    case 'cte': {
      const cte = node as CteNode;
      const names = new Set(cteNames);
      for (const c of cte.ctes) {
        names.add(c.name.value.toUpperCase());
        // Walk inside the CTE query itself (it can reference earlier CTEs)
        walkStatement(c.query, options, warnings, names, registry);
      }
      walkStatement(cte.statement, options, warnings, names, registry);
      break;
    }

    case 'select': {
      const sel = node as SelectNode;
      if (options.checkUnionColumns && sel.union && !unionTails.has(sel)) {
        checkUnionColumnAlignment(sel, warnings);
      }
      if (sel.from) {
        checkTableReference(sel.from.source, options, warnings, cteNames, true);
        walkSubquerySource(sel.from.source, options, warnings, cteNames, registry);
        for (const j of sel.from.joins) {
          checkTableReference(j.table, options, warnings, cteNames, true);
          walkSubquerySource(j.table, options, warnings, cteNames, registry);
        }
      }
      // Walk columns for subqueries
      for (const col of sel.columns) {
        walkExpression(col, options, warnings, cteNames, registry);
      }
      if (sel.where) walkExpression(sel.where.condition, options, warnings, cteNames, registry);
      if (sel.union) walkStatement(sel.union.select, options, warnings, cteNames, registry);
      break;
    }

    case 'insert': {
      const ins = node as InsertNode;
      checkTableReference(ins.target, options, warnings, cteNames, false);
      if (options.checkInsertColumns) {
        checkInsertColumnMapping(ins, registry, warnings);
      }
      if (ins.select) walkStatement(ins.select, options, warnings, cteNames, registry);
      break;
    }

    case 'update': {
      const upd = node as UpdateNode;
      checkTableReference(upd.target, options, warnings, cteNames, false);
      if (upd.from) {
        checkTableReference(upd.from.source, options, warnings, cteNames, true);
        walkSubquerySource(upd.from.source, options, warnings, cteNames, registry);
        for (const j of upd.from.joins) {
          checkTableReference(j.table, options, warnings, cteNames, true);
          walkSubquerySource(j.table, options, warnings, cteNames, registry);
        }
      }
      if (upd.where) walkExpression(upd.where.condition, options, warnings, cteNames, registry);
      break;
    }

    case 'delete': {
      const del = node as DeleteNode;
      checkTableReference(del.target, options, warnings, cteNames, false);
      if (del.where) walkExpression(del.where.condition, options, warnings, cteNames, registry);
      break;
    }

    case 'rawToken': {
      const raw = node as RawTokenNode;
      // Check EXEC/EXECUTE for proc name schema
      if (options.warnMissingSchema && raw.token.value.toUpperCase().match(/^EXEC(UTE)?$/)) {
        checkExecProcSchema(raw, warnings);
      }
      break;
    }

    case 'beginEnd': {
      const begin = node as BeginEndNode;
      for (const s of begin.statements) {
        walkStatement(s, options, warnings, cteNames, registry);
      }
      break;
    }

    case 'ifElse': {
      const ifElse = node as IfElseNode;
      walkStatement(ifElse.thenStatement, options, warnings, cteNames, registry);
      if (ifElse.elseClause) {
        walkStatement(ifElse.elseClause.statement, options, warnings, cteNames, registry);
      }
      break;
    }

    case 'createTable': {
      const ct = node as CreateTableNode;
      if (ct.name.type === 'identifier') {
        const id = ct.name as IdentifierNode;
        if (isTempOrVariable(id)) {
          if (options.warnMissingNullability) {
            checkMissingNullability(getIdentifierName(id), ct.columns, warnings);
          }
          if (options.checkInsertColumns) {
            registry.set(normalizeTableKey(getIdentifierName(id)), extractColumnNames(ct.columns));
          }
        }
      }
      break;
    }

    case 'declare': {
      const decl = node as DeclareNode;
      for (const v of decl.variables) {
        if (v.tableColumns) {
          if (options.warnMissingNullability) {
            checkMissingNullability(v.name.value, v.tableColumns, warnings);
          }
          if (options.checkInsertColumns) {
            registry.set(normalizeTableKey(v.name.value), extractColumnNames(v.tableColumns));
          }
        }
      }
      break;
    }

    case 'createProcedure': {
      const proc = node as CreateProcedureNode;
      if (options.warnMissingNocount) {
        checkMissingNocount(proc, warnings);
      }
      // Procedure body is its own scope — temp tables defined inside must
      // not leak to the outer batch (the body is not executed inline).
      walkStatement(proc.body, options, warnings, cteNames, new Map());
      break;
    }
  }
}

function walkSubquerySource(
  node: SqlNode,
  options: AnalyzeOptions,
  warnings: Warning[],
  cteNames: Set<string>,
  registry: TempColumnRegistry,
): void {
  if (node.type === 'parenGroup') {
    const pg = node as ParenGroupNode;
    for (const inner of pg.inner) {
      walkStatement(inner, options, warnings, cteNames, registry);
    }
  }
}

function walkExpression(
  node: SqlNode,
  options: AnalyzeOptions,
  warnings: Warning[],
  cteNames: Set<string>,
  registry: TempColumnRegistry,
): void {
  if (!node) return;

  if (node.type === 'parenGroup') {
    const pg = node as ParenGroupNode;
    for (const inner of pg.inner) {
      walkStatement(inner, options, warnings, cteNames, registry);
    }
  } else if (node.type === 'expression') {
    const expr = node as import('./ast').ExpressionNode;
    walkExpression(expr.left, options, warnings, cteNames, registry);
    walkExpression(expr.right, options, warnings, cteNames, registry);
  } else if (node.type === 'exists') {
    const ex = node as import('./ast').ExistsNode;
    walkExpression(ex.subquery, options, warnings, cteNames, registry);
  } else if (node.type === 'functionCall') {
    const fn = node as import('./ast').FunctionCallNode;
    for (const arg of fn.args) {
      walkExpression(arg, options, warnings, cteNames, registry);
    }
  } else if (node.type === 'inExpression') {
    const inExpr = node as import('./ast').InExpressionNode;
    walkExpression(inExpr.expression, options, warnings, cteNames, registry);
    for (const v of inExpr.values) {
      walkExpression(v, options, warnings, cteNames, registry);
    }
  }
}

function checkMissingNocount(proc: CreateProcedureNode, warnings: Warning[]): void {
  // Get the top-level statements from the procedure body
  let statements: SqlNode[] = [];
  if (proc.body.type === 'beginEnd') {
    statements = (proc.body as BeginEndNode).statements;
  }

  const hasNocount = statements.some(s => {
    if (s.type !== 'set') return false;
    const set = s as SetNode;
    if (!set.isSpecial) return false;
    if (set.target.type !== 'identifier') return false;
    const target = set.target as IdentifierNode;
    const name = target.parts[0]?.value;
    if (!name || name.toUpperCase() !== 'NOCOUNT') return false;
    // Check value is ON
    if (set.value.type === 'identifier') {
      return (set.value as IdentifierNode).parts[0]?.value.toUpperCase() === 'ON';
    }
    if (set.value.type === 'rawToken') {
      return (set.value as RawTokenNode).token.value.toUpperCase() === 'ON';
    }
    return false;
  });

  if (!hasNocount) {
    const procName = proc.name.type === 'identifier'
      ? getIdentifierName(proc.name as IdentifierNode)
      : 'unknown';
    const line = proc.keywords[0]?.line;
    const msg = `Warning: Stored procedure ${procName} does not contain SET NOCOUNT ON`;
    warnings.push({ message: line ? `${msg} (line ${line})` : msg, line });
  }
}

function checkMissingNullability(
  tableName: string,
  columns: (ColumnDefNode | ConstraintNode)[],
  warnings: Warning[],
): void {
  for (const col of columns) {
    if (col.type !== 'columnDef') continue;
    const colDef = col as ColumnDefNode;

    const hasNullability = colDef.constraints.some(c => {
      if (c.type !== 'constraint') return false;
      const constraint = c as ConstraintNode;
      const upper = constraint.tokens.map(t => t.value.toUpperCase());
      // Check for NULL or NOT NULL
      if (upper.includes('NULL')) return true;
      return false;
    });

    if (!hasNullability) {
      const colName = colDef.name.value;
      const line = colDef.name.line;
      const msg = `Warning: Column ${colName} in ${tableName} is missing NULL or NOT NULL`;
      warnings.push({ message: line ? `${msg} (line ${line})` : msg, line });
    }
  }
}

function normalizeColumnName(token: Token | undefined): string | undefined {
  if (!token) return undefined;
  let v = token.value;
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  else if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

function getSourceItemName(item: SqlNode): string | undefined {
  const aliased = (item as { alias?: { name: Token } }).alias;
  if (aliased?.name) return normalizeColumnName(aliased.name);
  if (item.type === 'identifier') {
    const id = item as IdentifierNode;
    return normalizeColumnName(id.parts[id.parts.length - 1]);
  }
  return undefined;
}

function getTargetColumnName(node: SqlNode): string | undefined {
  if (node.type !== 'identifier') return undefined;
  const id = node as IdentifierNode;
  return normalizeColumnName(id.parts[id.parts.length - 1]);
}

function normalizeTableKey(name: string): string {
  let v = name;
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  return v.toUpperCase();
}

function extractColumnNames(cols: (ColumnDefNode | ConstraintNode)[]): string[] {
  const out: string[] = [];
  for (const c of cols) {
    if (c.type !== 'columnDef') continue;
    const name = normalizeColumnName((c as ColumnDefNode).name);
    if (name) out.push(name);
  }
  return out;
}

function getInsertTargetNames(
  ins: InsertNode,
  registry: TempColumnRegistry,
): string[] | undefined {
  if (ins.columns && ins.columns.length > 0) {
    return ins.columns.map(c => getTargetColumnName(c) ?? '?');
  }
  if (ins.target.type !== 'identifier') return undefined;
  const id = ins.target as IdentifierNode;
  if (!isTempOrVariable(id)) return undefined;
  return registry.get(normalizeTableKey(getIdentifierName(id)));
}

function checkInsertColumnMapping(
  ins: InsertNode,
  registry: TempColumnRegistry,
  warnings: Warning[],
): void {
  if (!ins.select) return;

  const targetNames = getInsertTargetNames(ins, registry);
  if (!targetNames || targetNames.length === 0) return;

  const sources = ins.select.columns;
  const line = ins.insertToken?.line;
  const tableName =
    ins.target.type === 'identifier'
      ? getIdentifierName(ins.target as IdentifierNode)
      : 'target';

  const n = Math.max(targetNames.length, sources.length);
  const sourceLabels: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i < sources.length) {
      sourceLabels.push(getSourceItemName(sources[i]) ?? '<expr>');
    } else {
      sourceLabels.push('(missing)');
    }
  }
  const pad = sourceLabels.reduce((m, s) => Math.max(m, s.length), 0);

  const lines: string[] = [];
  lines.push(`INSERT into ${tableName}${line ? ` (line ${line})` : ''}:`);

  for (let i = 0; i < n; i++) {
    const src = sourceLabels[i];
    const tgt = i < targetNames.length ? targetNames[i] : '(no target)';
    const srcRaw = i < sources.length ? getSourceItemName(sources[i]) : undefined;
    const isMismatch =
      i >= targetNames.length ||
      i >= sources.length ||
      srcRaw === undefined ||
      srcRaw.toLowerCase() !== tgt.toLowerCase();
    lines.push(`  ${src.padEnd(pad)} -> ${tgt}${isMismatch ? '   [MISMATCH]' : ''}`);
  }

  if (targetNames.length !== sources.length) {
    lines.push(
      `  Warning: INSERT has ${targetNames.length} target column(s) but SELECT has ${sources.length} item(s).`
    );
  }

  warnings.push({ message: lines.join('\n'), line });
}

/** SELECTs reached as the 2nd+ branch of a UNION chain; the chain is reported once, from its head. */
const unionTails = new WeakSet<SelectNode>();

const MAX_LABEL = 30;

/** Render a select item compactly (e.g. `CAST(a.Amt AS int)`, `NULL`, `a.Qty * 2`). */
function exprText(node: SqlNode | undefined): string {
  if (!node) return '';
  switch (node.type) {
    case 'literal':
    case 'rawToken':
      return (node as LiteralNode).token.value;
    case 'identifier': {
      const id = node as IdentifierNode;
      const inner = (id as { _expression?: SqlNode })._expression;
      if (id.parts.length === 0 && inner) return exprText(inner);
      return id.parts.map(p => p.value).join('.');
    }
    case 'expression': {
      const e = node as ExpressionNode;
      return `${exprText(e.left)} ${e.operator.value} ${exprText(e.right)}`;
    }
    case 'functionCall': {
      const fn = node as FunctionCallNode;
      return `${exprText(fn.name)}(${fn.args.map(exprText).join(', ')})`;
    }
    case 'case':
      return 'CASE…END';
    case 'parenGroup':
      return '(…)';
    default:
      return '<expr>';
  }
}

function truncate(s: string): string {
  const flat = s.replace(/\s+/g, ' ');
  return flat.length > MAX_LABEL ? flat.slice(0, MAX_LABEL - 1) + '…' : flat;
}

/**
 * The output column name of a select item, if it has one: an alias (`expr AS x`,
 * `x = expr`) or a bare column reference. Undefined for unnamed expressions.
 */
function getUnionItemName(item: SqlNode): string | undefined {
  if (item.type === 'expression') {
    const e = item as ExpressionNode;
    if (e.operator.value === '=' && e.left.type === 'identifier') {
      const left = e.left as IdentifierNode;
      if (left.parts.length === 1 && !left.parts[0].value.startsWith('@')) {
        return normalizeColumnName(left.parts[0]);
      }
    }
    return undefined;
  }
  if (item.type === 'identifier') {
    const id = item as IdentifierNode;
    if (id.parts.length === 0 && !id.alias) return undefined;
  }
  return getSourceItemName(item);
}

function isStarItem(item: SqlNode): boolean {
  if (item.type === 'identifier') {
    const parts = (item as IdentifierNode).parts;
    return parts.length > 0 && parts[parts.length - 1].value === '*';
  }
  return (item.type === 'rawToken' || item.type === 'literal') && (item as RawTokenNode).token.value === '*';
}

interface UnionBranch {
  select: SelectNode;
  operator: string;          // operator joining this branch to the previous one ('' for the first)
  names: (string | undefined)[];
  labels: string[];
}

function checkUnionColumnAlignment(head: SelectNode, warnings: Warning[]): void {
  const branches: UnionBranch[] = [];
  let operator = '';
  for (let sel: SelectNode | undefined = head; sel; ) {
    branches.push({
      select: sel,
      operator,
      names: sel.columns.map(getUnionItemName),
      labels: sel.columns.map(c => truncate(getUnionItemName(c) ?? exprText(c))),
    });
    if (!sel.union) break;
    operator = sel.union.token.value.toUpperCase() + (sel.union.all ? ' ALL' : '');
    unionTails.add(sel.union.select);
    sel = sel.union.select;
  }

  const line = head.selectToken.line;
  const counts = branches.map(b => b.select.columns.length);
  const hasStar = branches.some(b => b.select.columns.some(isStarItem));
  const countMismatch = !hasStar && counts.some(c => c !== counts[0]);
  const ops = [...new Set(branches.slice(1).map(b => b.operator))].join('/');

  const out: string[] = [];
  let header = `${ops} column check${line ? ` (line ${line})` : ''}: ${branches.length} SELECTs`;
  if (hasStar) header += ` — contains *, column count cannot be verified`;
  else if (countMismatch) header += ` — COLUMN COUNT MISMATCH (${counts.join(', ')})`;
  else header += ` — ${counts[0]} column(s) each`;
  out.push(header);

  // Position-by-position grid: one row per column position, one column per branch.
  const headings = branches.map((b, i) => {
    const l = b.select.selectToken.line;
    return `SELECT ${i + 1}${l ? ` (line ${l})` : ''}`;
  });
  const rows = Math.max(...counts);
  const cell = (b: UnionBranch, r: number) => (r < b.labels.length ? b.labels[r] : '(missing)');
  const widths = branches.map((b, i) => {
    let w = headings[i].length;
    for (let r = 0; r < rows; r++) w = Math.max(w, cell(b, r).length);
    return w;
  });
  const numW = String(rows).length;
  out.push(`  ${'#'.padStart(numW)}  ${headings.map((h, i) => h.padEnd(widths[i])).join('  ')}`.trimEnd());
  for (let r = 0; r < rows; r++) {
    const flags: string[] = [];
    if (branches.some(b => r >= b.labels.length)) flags.push('[MISSING]');
    const named = branches.map(b => b.names[r]).filter((n): n is string => n !== undefined);
    if (new Set(named.map(n => n.toLowerCase())).size > 1) flags.push('[NAMES DIFFER]');
    const cells = branches.map((b, i) => cell(b, r).padEnd(widths[i])).join('  ');
    out.push(`  ${String(r + 1).padStart(numW)}  ${cells}${flags.length ? '  ' + flags.join(' ') : ''}`.trimEnd());
  }

  if (countMismatch) {
    for (let i = 1; i < branches.length; i++) {
      const hint = describeDrift(branches[0], branches[i], i + 1);
      if (hint) out.push(`  ${hint}`);
    }
    out.push(
      `  Warning: All queries combined using ${ops} must have an equal number of expressions in their target lists.`
    );
  }

  warnings.push({ message: out.join('\n'), line });
}

/**
 * Explain where branch `b` drifts from the first branch, when their counts differ.
 * Uses column names: the first position where both are named but disagree, and
 * whether the rest lines up after a shift (a dropped or extra column).
 */
function describeDrift(first: UnionBranch, b: UnionBranch, n: number): string | undefined {
  const a = first.names.map(x => x?.toLowerCase());
  const c = b.names.map(x => x?.toLowerCase());
  const diff = c.length - a.length;
  if (diff === 0) return undefined;
  const count = `SELECT ${n} has ${c.length} column(s) vs ${a.length} in SELECT 1`;

  const shiftMatches = (k: number, shift: number): boolean => {
    // Do the named columns after position k line up once branch b is shifted by `shift`?
    let compared = 0;
    for (let i = k; i < a.length; i++) {
      const j = i + shift;
      if (j < 0 || j >= c.length) continue;
      if (a[i] === undefined || c[j] === undefined) continue;
      if (a[i] !== c[j]) return false;
      compared++;
    }
    return compared > 0;
  };

  const limit = Math.min(a.length, c.length);
  for (let k = 0; k < limit; k++) {
    if (a[k] === undefined || c[k] === undefined || a[k] === c[k]) continue;
    if (diff < 0 && shiftMatches(k - diff, diff)) {
      const missing = first.labels.slice(k, k - diff).join(', ');
      return `${count}; it looks to be missing ${missing} at column ${k + 1}.`;
    }
    if (diff > 0 && shiftMatches(k, diff)) {
      const extra = b.labels.slice(k, k + diff).join(', ');
      return `${count}; it looks to have extra ${extra} at column ${k + 1}.`;
    }
    return `${count}; names first diverge at column ${k + 1} (${first.labels[k]} vs ${b.labels[k]}).`;
  }
  return `${count}.`;
}

function checkExecProcSchema(raw: RawTokenNode, warnings: Warning[]): void {
  if (!raw.extraTokens || raw.extraTokens.length === 0) return;

  // Collect tokens before first @param to find proc name
  const nameTokens: string[] = [];
  let hasDot = false;
  for (const t of raw.extraTokens) {
    if (t.value.startsWith('@')) break;
    if (t.value === '=') break;
    if (t.value === ',') break;
    if (t.value === '.') {
      hasDot = true;
    }
    nameTokens.push(t.value);
  }

  if (nameTokens.length === 0) return;

  // If there's no dot in the name tokens, schema is missing
  if (!hasDot) {
    const procName = nameTokens.join('');
    if (procName.startsWith('#') || procName.startsWith('@')) return;
    const line = raw.extraTokens[0]?.line;
    const msg = `Warning: Schema is missing from ${procName}`;
    warnings.push({ message: line ? `${msg} (line ${line})` : msg, line });
  }
}
