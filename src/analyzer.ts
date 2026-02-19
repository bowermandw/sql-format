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
} from './ast';

export interface Warning {
  message: string;
  line?: number;
  col?: number;
}

export interface AnalyzeOptions {
  warnMissingSchema: boolean;
  warnMissingAlias: boolean;
}

export function analyze(ast: BatchNode, options: AnalyzeOptions): Warning[] {
  const warnings: Warning[] = [];

  for (const batch of ast.batches) {
    for (const stmt of batch.statements) {
      walkStatement(stmt, options, warnings, new Set<string>());
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
  return first.startsWith('#') || first.startsWith('@');
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
): void {
  if (!node) return;

  switch (node.type) {
    case 'cte': {
      const cte = node as CteNode;
      const names = new Set(cteNames);
      for (const c of cte.ctes) {
        names.add(c.name.value.toUpperCase());
        // Walk inside the CTE query itself (it can reference earlier CTEs)
        walkStatement(c.query, options, warnings, names);
      }
      walkStatement(cte.statement, options, warnings, names);
      break;
    }

    case 'select': {
      const sel = node as SelectNode;
      if (sel.from) {
        checkTableReference(sel.from.source, options, warnings, cteNames, true);
        walkSubquerySource(sel.from.source, options, warnings, cteNames);
        for (const j of sel.from.joins) {
          checkTableReference(j.table, options, warnings, cteNames, true);
          walkSubquerySource(j.table, options, warnings, cteNames);
        }
      }
      // Walk columns for subqueries
      for (const col of sel.columns) {
        walkExpression(col, options, warnings, cteNames);
      }
      if (sel.where) walkExpression(sel.where.condition, options, warnings, cteNames);
      if (sel.union) walkStatement(sel.union.select, options, warnings, cteNames);
      break;
    }

    case 'insert': {
      const ins = node as InsertNode;
      checkTableReference(ins.target, options, warnings, cteNames, false);
      if (ins.select) walkStatement(ins.select, options, warnings, cteNames);
      break;
    }

    case 'update': {
      const upd = node as UpdateNode;
      checkTableReference(upd.target, options, warnings, cteNames, false);
      if (upd.from) {
        checkTableReference(upd.from.source, options, warnings, cteNames, true);
        walkSubquerySource(upd.from.source, options, warnings, cteNames);
        for (const j of upd.from.joins) {
          checkTableReference(j.table, options, warnings, cteNames, true);
          walkSubquerySource(j.table, options, warnings, cteNames);
        }
      }
      if (upd.where) walkExpression(upd.where.condition, options, warnings, cteNames);
      break;
    }

    case 'delete': {
      const del = node as DeleteNode;
      checkTableReference(del.target, options, warnings, cteNames, false);
      if (del.where) walkExpression(del.where.condition, options, warnings, cteNames);
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
        walkStatement(s, options, warnings, cteNames);
      }
      break;
    }

    case 'ifElse': {
      const ifElse = node as IfElseNode;
      walkStatement(ifElse.thenStatement, options, warnings, cteNames);
      if (ifElse.elseClause) {
        walkStatement(ifElse.elseClause.statement, options, warnings, cteNames);
      }
      break;
    }

    case 'createProcedure': {
      const proc = node as CreateProcedureNode;
      walkStatement(proc.body, options, warnings, cteNames);
      break;
    }
  }
}

function walkSubquerySource(
  node: SqlNode,
  options: AnalyzeOptions,
  warnings: Warning[],
  cteNames: Set<string>,
): void {
  if (node.type === 'parenGroup') {
    const pg = node as ParenGroupNode;
    for (const inner of pg.inner) {
      walkStatement(inner, options, warnings, cteNames);
    }
  }
}

function walkExpression(
  node: SqlNode,
  options: AnalyzeOptions,
  warnings: Warning[],
  cteNames: Set<string>,
): void {
  if (!node) return;

  if (node.type === 'parenGroup') {
    const pg = node as ParenGroupNode;
    for (const inner of pg.inner) {
      walkStatement(inner, options, warnings, cteNames);
    }
  } else if (node.type === 'expression') {
    const expr = node as import('./ast').ExpressionNode;
    walkExpression(expr.left, options, warnings, cteNames);
    walkExpression(expr.right, options, warnings, cteNames);
  } else if (node.type === 'exists') {
    const ex = node as import('./ast').ExistsNode;
    walkExpression(ex.subquery, options, warnings, cteNames);
  } else if (node.type === 'functionCall') {
    const fn = node as import('./ast').FunctionCallNode;
    for (const arg of fn.args) {
      walkExpression(arg, options, warnings, cteNames);
    }
  } else if (node.type === 'inExpression') {
    const inExpr = node as import('./ast').InExpressionNode;
    walkExpression(inExpr.expression, options, warnings, cteNames);
    for (const v of inExpr.values) {
      walkExpression(v, options, warnings, cteNames);
    }
  }
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
