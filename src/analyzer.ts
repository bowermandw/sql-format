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
