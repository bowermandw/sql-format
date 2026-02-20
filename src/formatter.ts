import { Token, TokenType } from './tokens';
import { SqlNode, BatchNode, SelectNode, CreateProcedureNode, BeginEndNode, IfElseNode, SetNode, DeclareNode, PrintNode, ReturnNode, CaseNode, ExpressionNode, FunctionCallNode, IdentifierNode, LiteralNode, RawTokenNode, WhereNode, GroupByNode, OrderByNode, HavingNode, JoinNode, InsertNode, UpdateNode, DeleteNode, CteNode, InExpressionNode, BetweenNode, ExistsNode, ParenGroupNode, CreateTableNode, ColumnDefNode, DropTableNode, AlterTableNode, ConstraintNode, PivotNode } from './ast';
import { FormatConfig } from './config';
import { caseWord, categorizeWord } from './casing';

export function format(ast: BatchNode, config: FormatConfig): string {
  const f = new Formatter(config);
  let result = f.formatBatch(ast);
  // Normalize all line endings to \n first (block comments may retain \r\n from input),
  // then convert to \r\n if configured for CRLF output.
  result = result.replace(/\r\n/g, '\n');
  if (config.whitespace.lineEnding === 'crlf') {
    result = result.replace(/\n/g, '\r\n');
  }
  return result;
}

class Formatter {
  private config: FormatConfig;
  private indent: number = 0;
  private tabStr: string;

  constructor(config: FormatConfig) {
    this.config = config;
    this.tabStr = config.whitespace.tabBehavior === 'onlyTabs'
      ? '\t'
      : ' '.repeat(config.whitespace.numberOfSpacesInTab);
  }

  private indentStr(level?: number): string {
    const lvl = level ?? this.indent;
    return this.tabStr.repeat(lvl);
  }

  private kw(word: string): string {
    return caseWord(word, this.config.casing);
  }

  private tokenValue(token: Token): string {
    if (token.type === TokenType.Word) {
      return caseWord(token.value, this.config.casing);
    }
    return token.value;
  }

  /** Build the semicolon suffix string based on whitespaceBeforeSemicolon config. */
  private semicolonStr(): string {
    switch (this.config.whitespace.whitespaceBeforeSemicolon) {
      case 'spaceBefore': return ' ;';
      case 'newLineBefore': return '\n' + this.indentStr() + ';';
      default: return ';';
    }
  }

  /**
   * Append a semicolon to the end of a formatted statement string
   * if insertSemicolons === 'insert'. Handles multi-line strings by
   * appending to the last line.
   */
  private withSemicolon(formatted: string, node?: SqlNode): string {
    const mode = this.config.whitespace.insertSemicolons;
    if (mode === 'insert') {
      return formatted + this.semicolonStr();
    }
    if (mode === 'asis' && node && (node as any)._hasSemicolon) {
      return formatted + this.semicolonStr();
    }
    return formatted;
  }

  private padToWidth(s: string, width: number): string {
    const padding = width - s.length;
    return padding > 0 ? s + ' '.repeat(padding) : s;
  }

  /**
   * Returns true if a node type is a "leaf statement" that should receive
   * a trailing semicolon (as opposed to compound/container statements).
   */
  private isLeafStatement(node: SqlNode): boolean {
    switch (node.type) {
      case 'select':
      case 'insert':
      case 'update':
      case 'delete':
      case 'set':
      case 'declare':
      case 'print':
      case 'return':
      case 'rawToken':
      case 'dropTable':
      case 'createTable':
      case 'alterTable':
        return true;
      default:
        return false;
    }
  }

  /** Get the first token from an AST node (for extracting leading comments). */
  private getFirstToken(node: SqlNode): Token | undefined {
    switch (node.type) {
      case 'select': return node.selectToken;
      case 'insert': return node.insertToken;
      case 'update': return node.updateToken;
      case 'delete': return node.deleteToken;
      case 'set': return node.token;
      case 'declare': return node.token;
      case 'print': return node.token;
      case 'return': return node.token;
      case 'beginEnd': return node.beginToken;
      case 'ifElse': return node.ifToken;
      case 'cte': return node.withToken;
      case 'createProcedure': return node.keywords[0];
      case 'createTable': return node.keywords[0];
      case 'dropTable': return node.keywords[0];
      case 'alterTable': return node.keywords[0];
      case 'case': return node.caseToken;
      case 'identifier': {
        if (node.parts.length === 0 && (node as any)._expression) {
          return this.getFirstToken((node as any)._expression);
        }
        return node.parts[0];
      }
      case 'literal': return node.token;
      case 'rawToken': return node.token;
      case 'pivot': return node.pivotToken;
      case 'expression': return this.getFirstToken(node.left);
      case 'functionCall': return this.getFirstToken(node.name);
      default: return undefined;
    }
  }

  /** Get the last token from an AST node (for extracting trailing comments). */
  private getLastToken(node: SqlNode): Token | undefined {
    switch (node.type) {
      case 'select': {
        if (node.orderBy) return this.getLastToken(node.orderBy.items[node.orderBy.items.length - 1].direction ? { type: 'rawToken', token: node.orderBy.items[node.orderBy.items.length - 1].direction! } as RawTokenNode : node.orderBy.items[node.orderBy.items.length - 1].expr);
        if (node.having) return this.getLastToken(node.having.condition);
        if (node.groupBy) return this.getLastToken(node.groupBy.items[node.groupBy.items.length - 1]);
        if (node.where) return this.getLastToken(node.where.condition);
        if (node.from) {
          const joins = node.from.joins;
          if (joins.length > 0) return this.getLastToken(joins[joins.length - 1]);
          return this.getLastToken(node.from.source);
        }
        if (node.columns.length > 0) return this.getLastToken(node.columns[node.columns.length - 1]);
        return node.selectToken;
      }
      case 'insert': {
        if (node.select) return this.getLastToken(node.select);
        return undefined; // VALUES rows are complex
      }
      case 'update': {
        if (node.where) return this.getLastToken(node.where.condition);
        const lastAssign = node.assignments[node.assignments.length - 1];
        if (lastAssign) return this.getLastToken(lastAssign.value);
        return undefined;
      }
      case 'delete': {
        if (node.where) return this.getLastToken(node.where.condition);
        return this.getLastToken(node.target);
      }
      case 'set': return this.getLastToken(node.value);
      case 'declare': {
        const lastVar = node.variables[node.variables.length - 1];
        if (lastVar.default) return this.getLastToken(lastVar.default);
        return this.getLastToken(lastVar.dataType);
      }
      case 'print': return this.getLastToken(node.expression);
      case 'return': return node.expression ? this.getLastToken(node.expression) : node.token;
      case 'createTable': {
        if (node.onFilegroup?.length) return node.onFilegroup[node.onFilegroup.length - 1];
        return undefined;
      }
      case 'dropTable': return this.getLastToken(node.name);
      case 'alterTable': {
        if (node.action.length > 0) return node.action[node.action.length - 1];
        return this.getLastToken(node.name);
      }
      case 'rawToken': {
        if (node.extraTokens?.length) return node.extraTokens[node.extraTokens.length - 1];
        return node.token;
      }
      case 'identifier': {
        if (node.alias) return node.alias.name;
        if (node.parts.length > 0) return node.parts[node.parts.length - 1];
        if ((node as any)._expression) return this.getLastToken((node as any)._expression);
        return undefined;
      }
      case 'literal': return node.token;
      case 'expression': return this.getLastToken(node.right);
      case 'functionCall': {
        if (node.alias) return node.alias.name;
        return undefined; // closing paren isn't stored as a token
      }
      case 'inExpression': return undefined; // closing paren
      case 'between': return this.getLastToken(node.high);
      case 'case': return node.endToken;
      case 'join': {
        if (node.on) return this.getLastToken(node.on.condition);
        return this.getLastToken(node.table);
      }
      case 'parenGroup': {
        if (node.alias) return node.alias.name;
        return undefined;
      }
      default: return undefined;
    }
  }

  /** Check if a node had a blank line before it in the original source. */
  private hasPrecedingBlankLine(node: SqlNode): boolean {
    const token = this.getFirstToken(node);
    return !!token?.precedingBlankLine;
  }

  /** Format leading comments for a node, using the current indentation. */
  private formatLeadingComments(node: SqlNode): string {
    const token = this.getFirstToken(node);
    if (!token?.leadingComments?.length) return '';
    const indent = this.indentStr();
    const preserve = this.config.whitespace.newLines.preserveExistingEmptyLinesBetweenComments;
    const lines: string[] = [];
    for (const c of token.leadingComments) {
      if (preserve && c.precedingBlankLine && lines.length > 0) {
        lines.push('');
      }
      lines.push(indent + c.value);
    }
    if (preserve && token.blankLineAfterLeadingComments) {
      lines.push('');
    }
    return lines.join('\n') + '\n';
  }

  /** Format leading comments from a token directly, at a given indent level. */
  private formatTokenLeadingComments(token: Token, indentLevel?: number): string {
    if (!token?.leadingComments?.length) return '';
    const indent = this.indentStr(indentLevel);
    const preserve = this.config.whitespace.newLines.preserveExistingEmptyLinesBetweenComments;
    const lines: string[] = [];
    for (const c of token.leadingComments) {
      if (preserve && c.precedingBlankLine && lines.length > 0) {
        lines.push('');
      }
      lines.push(indent + c.value);
    }
    if (preserve && token.blankLineAfterLeadingComments) {
      lines.push('');
    }
    return lines.join('\n') + '\n';
  }

  /** Format comments that appeared before a closing parenthesis. */
  private formatCloseComments(comments: Token[] | undefined, indentLevel: number): string {
    if (!comments?.length) return '';
    const indent = this.indentStr(indentLevel + 1);
    return '\n' + comments.map(c => indent + c.value).join('\n');
  }

  /** Get the trailing inline comment from the last token of a node (if any). */
  private getTrailingComment(node: SqlNode): string {
    const token = this.getLastToken(node);
    if (token?.trailingComment) {
      return ' ' + token.trailingComment.value;
    }
    return '';
  }

  /**
   * Format a statement and append a semicolon if it's a leaf statement
   * and insertSemicolons is 'insert'.
   */
  private formatStatement(node: SqlNode): string {
    const comments = this.formatLeadingComments(node);
    const formatted = this.formatNode(node);
    const trailing = this.getTrailingComment(node);
    if (this.isLeafStatement(node)) {
      return comments + this.withSemicolon(formatted, node) + trailing;
    }
    return comments + formatted + trailing;
  }

  // --- Batch ---

  formatBatch(node: BatchNode): string {
    const preserve = this.config.whitespace.newLines.preserveExistingEmptyLinesBetweenStatements;
    const parts: string[] = [];
    for (const batch of node.batches) {
      const stmtLines: string[] = [];
      for (let i = 0; i < batch.statements.length; i++) {
        const s = batch.statements[i];
        const formatted = this.formatStatement(s);
        if (formatted.length === 0) continue;
        if (preserve && stmtLines.length > 0 && this.hasPrecedingBlankLine(s)) {
          stmtLines.push('');
        }
        stmtLines.push(formatted);
      }
      parts.push(stmtLines.join('\n'));
      if (batch.separator) {
        parts.push(this.kw('GO'));
      }
    }
    // Output any trailing comments at the end of the file
    if (node.trailingComments?.length) {
      // Add blank line before trailing comments if there was one in the source
      for (const c of node.trailingComments) {
        parts.push(c.value);
      }
    }
    return parts.join('\n') + '\n';
  }

  // --- Node dispatch ---

  formatNode(node: SqlNode, indent?: number): string {
    if (indent !== undefined) {
      const prev = this.indent;
      this.indent = indent;
      const result = this.formatNodeInner(node);
      this.indent = prev;
      return result;
    }
    return this.formatNodeInner(node);
  }

  private formatNodeInner(node: SqlNode): string {
    switch (node.type) {
      case 'batch': return this.formatBatch(node);
      case 'createProcedure': return this.formatCreateProcedure(node);
      case 'createTable': return this.formatCreateTable(node);
      case 'dropTable': return this.formatDropTable(node);
      case 'alterTable': return this.formatAlterTable(node);
      case 'select': return this.formatSelect(node);
      case 'insert': return this.formatInsert(node);
      case 'update': return this.formatUpdate(node);
      case 'delete': return this.formatDelete(node);
      case 'cte': return this.formatCTE(node);
      case 'beginEnd': return this.formatBeginEnd(node);
      case 'ifElse': return this.formatIfElse(node);
      case 'declare': return this.formatDeclare(node);
      case 'set': return this.formatSet(node);
      case 'print': return this.formatPrint(node);
      case 'return': return this.formatReturn(node);
      case 'case': return this.formatCase(node);
      case 'expression': return this.formatExpression(node);
      case 'functionCall': return this.formatFunctionCall(node);
      case 'identifier': return this.formatIdentifier(node);
      case 'literal': return this.formatLiteral(node);
      case 'inExpression': return this.formatInExpression(node);
      case 'between': return this.formatBetween(node);
      case 'exists': return this.formatExists(node);
      case 'pivot': return this.formatPivot(node);
      case 'parenGroup': return this.formatParenGroup(node);
      case 'where': return this.formatWhere(node);
      case 'groupBy': return this.formatGroupBy(node);
      case 'orderBy': return this.formatOrderBy(node);
      case 'having': return this.formatHaving(node);
      case 'join': return this.formatJoin(node);
      case 'rawToken': return this.formatRawToken(node);
      case 'columnDef': return this.formatColumnDef(node);
      case 'constraint': return this.formatConstraint(node);
      default: return '';
    }
  }

  // --- CREATE PROCEDURE ---

  private formatCreateProcedure(node: CreateProcedureNode): string {
    const parts: string[] = [];
    const kwStr = node.keywords.map(t => this.kw(t.value)).join(' ');
    const nameStr = this.formatNode(node.name);

    // Parameters
    if (node.parameters.length === 0) {
      parts.push(`${kwStr} ${nameStr}`);
    } else {
      let nameWidth = 0;
      if (this.config.ddl.alignDataTypesAndConstraints && node.parameters.length > 1) {
        nameWidth = Math.max(...node.parameters.map(p => p.name.value.length));
      }
      const paramLines = node.parameters.map(p => this.formatProcParam(p, nameWidth));

      // Check if first param should go on new line
      const placeFirst = this.config.ddl.placeFirstProcedureParameterOnNewLine;
      if (placeFirst === 'always' || (placeFirst === 'ifSeveralItems' && node.parameters.length > 1)) {
        parts.push(`${kwStr} ${nameStr}`);
        parts.push('(');
        const indent = this.indentStr(1);
        parts.push(paramLines.map(p => indent + p).join(',\n'));
        parts.push(')');
      } else {
        // All on one line
        parts.push(`${kwStr} ${nameStr} (${paramLines.join(', ')})`);
      }
    }

    parts.push(this.kw('AS'));

    // Body
    parts.push(this.formatNode(node.body));

    return parts.join('\n');
  }

  private formatProcParam(param: { name: Token; dataType: SqlNode; default?: SqlNode; output?: Token }, nameWidth: number = 0): string {
    const name = nameWidth > 0 ? this.padToWidth(param.name.value, nameWidth) : param.name.value;
    let s = `${name} ${this.formatDataType(param.dataType)}`;
    if (param.default) {
      s += ` = ${this.formatNode(param.default)}`;
    }
    if (param.output) {
      s += ` ${this.kw(param.output.value)}`;
    }
    return s;
  }

  // --- CREATE TABLE ---

  private formatCreateTable(node: CreateTableNode): string {
    const baseIndent = this.indentStr();
    const kw = node.keywords.map(t => this.kw(t.value)).join(' ');
    const name = this.formatNode(node.name);

    // Try collapse
    if (this.config.ddl.collapseShortStatements) {
      const collapsed = this.collapseCreateTable(node, kw, name);
      if (collapsed.length <= this.config.ddl.collapseStatementsShorterThan) {
        return baseIndent + collapsed;
      }
    }

    const parts: string[] = [`${baseIndent}${kw} ${name}`];
    parts.push(baseIndent + '(');
    const colIndent = this.indentStr(this.indent + 1);
    let nameWidth = 0;
    if (this.config.ddl.alignDataTypesAndConstraints && node.columns.length > 1) {
      nameWidth = Math.max(...node.columns.map(c => {
        if (c.type === 'columnDef') {
          return this.formatIdentifierPart((c as ColumnDefNode).name).length;
        }
        return 0;
      }));
    }
    const colStrs = node.columns.map(c => {
      if (c.type === 'constraint') {
        return colIndent + this.formatConstraint(c as ConstraintNode);
      }
      return colIndent + this.formatColumnDef(c as ColumnDefNode, nameWidth);
    });
    parts.push(colStrs.join(',\n'));
    parts.push(baseIndent + ')');
    if (node.onFilegroup && node.onFilegroup.length > 0) {
      parts.push(baseIndent + node.onFilegroup.map(t => this.kw(t.value)).join(' '));
    }
    return parts.join('\n');
  }

  private collapseCreateTable(node: CreateTableNode, kw: string, name: string): string {
    const cols = node.columns.map(c => {
      if (c.type === 'constraint') return this.formatConstraint(c as ConstraintNode);
      return this.formatColumnDef(c as ColumnDefNode);
    });
    let s = `${kw} ${name} (${cols.join(', ')})`;
    if (node.onFilegroup && node.onFilegroup.length > 0) {
      s += ' ' + node.onFilegroup.map(t => this.kw(t.value)).join(' ');
    }
    return s;
  }

  private formatColumnDef(node: ColumnDefNode, nameWidth: number = 0): string {
    const colName = this.formatIdentifierPart(node.name);
    const name = nameWidth > 0 ? this.padToWidth(colName, nameWidth) : colName;
    let s = `${name} ${this.formatDataType(node.dataType)}`;
    for (const c of node.constraints) {
      s += ' ' + this.formatNode(c);
    }
    return s;
  }

  // --- DROP TABLE ---

  private formatDropTable(node: DropTableNode): string {
    const indent = this.indentStr();
    const kw = node.keywords.map(t => this.kw(t.value)).join(' ');
    const name = this.formatNode(node.name);
    return `${indent}${kw} ${name}`;
  }

  // --- ALTER TABLE ---

  private formatAlterTable(node: AlterTableNode): string {
    const indent = this.indentStr();
    const kw = node.keywords.map(t => this.kw(t.value)).join(' ');
    const name = this.formatNode(node.name);

    // Format action tokens with proper spacing
    const parts: string[] = [];
    for (let i = 0; i < node.action.length; i++) {
      const t = node.action[i];
      if (t.type === TokenType.LeftParen) {
        // Remove trailing space before '(' if preceded by a keyword
        if (parts.length > 0 && parts[parts.length - 1] === ' ') {
          parts.pop();
        }
        parts.push('(');
      } else if (t.type === TokenType.RightParen) {
        parts.push(')');
      } else if (t.type === TokenType.Comma) {
        parts.push(', ');
      } else if (t.type === TokenType.Dot) {
        parts.push('.');
      } else if (t.type === TokenType.Equals) {
        parts.push(' = ');
      } else {
        if (parts.length > 0 && !parts[parts.length - 1].endsWith('(') && !parts[parts.length - 1].endsWith('.')) {
          parts.push(' ');
        }
        parts.push(this.tokenValue(t));
      }
    }
    const actionStr = parts.join('');
    return `${indent}${kw} ${name} ${actionStr}`.trimEnd();
  }

  // --- CONSTRAINT ---

  private formatConstraint(node: ConstraintNode): string {
    const parts: string[] = [];
    for (let i = 0; i < node.tokens.length; i++) {
      const t = node.tokens[i];
      if (t.type === TokenType.LeftParen) {
        // Remove trailing space before '(' and attach directly
        parts.push('(');
      } else if (t.type === TokenType.RightParen) {
        parts.push(')');
      } else if (t.type === TokenType.Comma) {
        parts.push(',');
      } else if (t.type === TokenType.Word || t.type === TokenType.QuotedIdentifier) {
        const category = t.type === TokenType.QuotedIdentifier ? 'identifier' : categorizeWord(t.value);
        if (category === 'identifier') {
          parts.push(this.formatIdentifierPart(t));
        } else {
          parts.push(this.kw(t.value));
        }
      } else {
        parts.push(t.value);
      }
    }
    // Join with spaces but collapse around commas and closing parens
    let result = '';
    for (const part of parts) {
      if (part === ')') {
        result = result.trimEnd();
        result += ')';
      } else if (part === ',') {
        result = result.trimEnd();
        result += ', ';
      } else {
        if (result.length > 0 && !result.endsWith(' ') && !result.endsWith('(')) {
          result += ' ';
        }
        result += part;
      }
    }
    return result.trimEnd();
  }

  // --- Raw Token (EXEC, fallback statements) ---

  private formatRawToken(node: RawTokenNode): string {
    let s = this.tokenValue(node.token);
    if (node.extraTokens) {
      for (let i = 0; i < node.extraTokens.length; i++) {
        const t = node.extraTokens[i];
        // Preserve dots without spaces (qualified names)
        if (t.type === TokenType.Dot) {
          s += '.';
        } else if (s.endsWith('.')) {
          // Token after a dot is an identifier part
          s += this.formatIdentifierPart(t);
        } else if (t.type === TokenType.Comma) {
          s += ',';
        } else if (t.type === TokenType.Equals) {
          s += ' =';
        } else if (t.type === TokenType.LeftParen) {
          s += ' (';
        } else if (t.type === TokenType.RightParen) {
          s += ')';
        } else if ((t.type === TokenType.Word && !t.value.startsWith('@') || t.type === TokenType.QuotedIdentifier) &&
                   i + 1 < node.extraTokens.length && node.extraTokens[i + 1].type === TokenType.Dot) {
          // Token before a dot is an identifier part (e.g. schema name)
          s += ' ' + this.formatIdentifierPart(t);
        } else {
          s += ' ' + this.tokenValue(t);
        }
      }
      return this.indentStr() + s;
    }
    return s;
  }

  // --- SELECT ---

  private formatSelect(node: SelectNode): string {
    const lines: string[] = [];
    const baseIndent = this.indent;
    const indent = this.indentStr(baseIndent);
    const clauseIndent = this.indentStr(baseIndent + 1);

    // Try collapse (skip if any clause tokens have leading comments)
    if (this.config.dml.collapseShortStatements && !this.selectHasClauseComments(node)) {
      const collapsed = this.collapseSelect(node);
      if (collapsed.length <= this.config.dml.collapseStatementsShorterThan) {
        return indent + collapsed;
      }
    }

    // SELECT keyword
    let selectLine = indent + this.kw('SELECT');
    if (node.distinct) selectLine += ' ' + this.kw('DISTINCT');
    if (node.top) {
      selectLine += ' ' + this.kw('TOP') + ' (' + this.formatNode(node.top.value) + ')';
    }

    // Column list
    const firstOnNewLine = this.config.lists.placeFirstItemOnNewLine;

    // Compute alias alignment width if configured.
    // For multi-line expressions (e.g. wrapped CONCAT), only the last line
    // matters, but its width already includes baked-in indentation.  We
    // normalise every width to "characters after the clause indent" so
    // single-line and multi-line items are compared on equal footing.
    let aliasAlignWidth: number | undefined;
    if (this.config.lists.alignAliases) {
      let maxExprWidth = 0;
      const clauseIndentLen = this.indentStr(baseIndent + 1).length;
      const indentLevel = baseIndent + 1;
      const savedIndent = this.indent;
      this.indent = indentLevel;
      for (const c of node.columns) {
        const aliased = c as any;
        if (aliased.alias) {
          let exprStr = aliased._expression
            ? this.wrapExpression(aliased._expression, indentLevel)
            : aliased.parts ? aliased.parts.map((p: Token) => this.formatIdentifierPart(p)).join('.') : '';
          if (aliased._expression?._parenthesized) {
            exprStr = '(' + exprStr + ')';
          }
          // If the expression + alias would overflow, re-format with CASE
          // collapsing disabled so the width reflects the expanded form.
          if (aliased._expression && !exprStr.includes('\n') && this.config.whitespace.wrapLongLines) {
            const aliasExtra = aliased.alias.asToken
              ? 1 + 2 + 1 + aliased.alias.name.value.length  // ' AS [name]'
              : 1 + aliased.alias.name.value.length;          // ' [name]'
            const lineLen = exprStr.length + aliasExtra + indentLevel * this.tabStr.length;
            if (lineLen > this.config.whitespace.wrapLinesLongerThan) {
              const savedCaseCollapse = this.config.caseExpressions.collapseShortCaseExpressions;
              (this.config.caseExpressions as any).collapseShortCaseExpressions = false;
              exprStr = this.wrapExpression(aliased._expression, indentLevel);
              if (aliased._expression._parenthesized) {
                exprStr = '(' + exprStr + ')';
              }
              (this.config.caseExpressions as any).collapseShortCaseExpressions = savedCaseCollapse;
            }
          }
          let effectiveWidth: number;
          if (exprStr.includes('\n')) {
            // Last line already contains indentation — subtract it
            const lastLine = exprStr.slice(exprStr.lastIndexOf('\n') + 1);
            effectiveWidth = lastLine.length - clauseIndentLen;
          } else {
            effectiveWidth = exprStr.length;
          }
          if (effectiveWidth > maxExprWidth) maxExprWidth = effectiveWidth;
        }
      }
      this.indent = savedIndent;
      if (maxExprWidth > 0) aliasAlignWidth = maxExprWidth;
    }

    this.indent = baseIndent + 1;
    const cols = node.columns.map(c => this.formatSelectItem(c, aliasAlignWidth, true));
    // Collect leading comments for each column (e.g. commented-out columns)
    const colComments = node.columns.map(c => this.formatLeadingComments(c));
    this.indent = baseIndent;

    const leadingCommas = this.config.lists.commas.placeCommasBeforeItems;

    if (firstOnNewLine === 'always' || (firstOnNewLine === 'onlyIfSubsequentItems' && cols.length > 1)) {
      lines.push(selectLine);
      for (let i = 0; i < cols.length; i++) {
        if (colComments[i]) lines.push(colComments[i].replace(/\n$/, ''));
        if (leadingCommas && i > 0) {
          lines.push(clauseIndent.slice(0, -1) + ',' + cols[i]);
        } else {
          lines.push(clauseIndent + cols[i] + (!leadingCommas && i < cols.length - 1 ? ',' : ''));
        }
      }
    } else {
      // First item on same line as SELECT
      if (cols.length === 1) {
        if (colComments[0]) lines.push(colComments[0].replace(/\n$/, ''));
        lines.push(selectLine + ' ' + cols[0]);
      } else {
        if (leadingCommas) {
          if (colComments[0]) lines.push(colComments[0].replace(/\n$/, ''));
          lines.push(selectLine + ' ' + cols[0]);
          for (let i = 1; i < cols.length; i++) {
            if (colComments[i]) lines.push(colComments[i].replace(/\n$/, ''));
            lines.push(clauseIndent.slice(0, -1) + ',' + cols[i]);
          }
        } else {
          if (colComments[0]) lines.push(colComments[0].replace(/\n$/, ''));
          lines.push(selectLine + ' ' + cols[0] + ',');
          for (let i = 1; i < cols.length; i++) {
            if (colComments[i]) lines.push(colComments[i].replace(/\n$/, ''));
            lines.push(clauseIndent + cols[i] + (i < cols.length - 1 ? ',' : ''));
          }
        }
      }
    }

    // FROM
    if (node.from) {
      const fromComments = this.formatTokenLeadingComments(node.from.token, baseIndent);
      if (fromComments) lines.push(fromComments.trimEnd());
      lines.push(indent + this.kw('FROM'));
      const source = node.from.source;
      if (source.type === 'parenGroup' && source.inner.length === 1 && source.inner[0].type === 'select') {
        lines.push(clauseIndent + this.formatParenGroup(source, baseIndent + 1));
      } else {
        lines.push(clauseIndent + this.formatNode(source));
      }
      for (const join of node.from.joins) {
        lines.push(this.formatJoin(join, baseIndent));
      }
    }

    // WHERE
    if (node.where) {
      const whereComments = this.formatTokenLeadingComments(node.where.token, baseIndent);
      if (whereComments) lines.push(whereComments.trimEnd());
      lines.push(this.formatWhere(node.where, baseIndent));
    }

    // GROUP BY
    if (node.groupBy) {
      const gbComments = this.formatTokenLeadingComments(node.groupBy.tokens[0], baseIndent);
      if (gbComments) lines.push(gbComments.trimEnd());
      lines.push(this.formatGroupBy(node.groupBy, baseIndent));
    }

    // HAVING
    if (node.having) {
      const havingComments = this.formatTokenLeadingComments(node.having.token, baseIndent);
      if (havingComments) lines.push(havingComments.trimEnd());
      lines.push(this.formatHaving(node.having, baseIndent));
    }

    // ORDER BY
    if (node.orderBy) {
      const obComments = this.formatTokenLeadingComments(node.orderBy.tokens[0], baseIndent);
      if (obComments) lines.push(obComments.trimEnd());
      lines.push(this.formatOrderBy(node.orderBy, baseIndent));
    }

    return lines.join('\n');
  }

  /** Check if any clause token in a SELECT has leading comments that must be preserved. */
  private selectHasClauseComments(node: SelectNode): boolean {
    if (node.from?.token?.leadingComments?.length) return true;
    if (node.where?.token?.leadingComments?.length) return true;
    if (node.groupBy?.tokens[0]?.leadingComments?.length) return true;
    if (node.having?.token?.leadingComments?.length) return true;
    if (node.orderBy?.tokens[0]?.leadingComments?.length) return true;
    return false;
  }

  private collapseSelect(node: SelectNode): string {
    let s = this.kw('SELECT');
    if (node.distinct) s += ' ' + this.kw('DISTINCT');
    if (node.top) s += ' ' + this.kw('TOP') + ' (' + this.formatNode(node.top.value) + ')';
    s += ' ' + node.columns.map(c => this.formatSelectItem(c)).join(', ');
    if (node.from) {
      s += ' ' + this.kw('FROM') + ' ' + this.formatNode(node.from.source);
      for (const j of node.from.joins) {
        s += ' ' + this.collapseJoin(j);
      }
    }
    if (node.where) s += ' ' + this.kw('WHERE') + ' ' + this.formatNode(node.where.condition);
    if (node.groupBy) s += ' ' + this.kw('GROUP') + ' ' + this.kw('BY') + ' ' + node.groupBy.items.map(i => this.formatNode(i)).join(', ');
    if (node.having) s += ' ' + this.kw('HAVING') + ' ' + this.formatNode(node.having.condition);
    if (node.orderBy) s += ' ' + this.kw('ORDER') + ' ' + this.kw('BY') + ' ' + node.orderBy.items.map(i => this.formatNode(i.expr) + (i.direction ? ' ' + this.kw(i.direction.value) : '')).join(', ');
    return s;
  }

  /** Get the length of the last line of a possibly multi-line string. */
  private lastLineLength(s: string): number {
    const nlIdx = s.lastIndexOf('\n');
    return nlIdx === -1 ? s.length : s.length - nlIdx - 1;
  }

  private appendSelectItemAlias(s: string, alias: { asToken?: Token; name: Token }, alignWidth?: number): string {
    const isMultiLine = s.includes('\n');
    const lastLen = this.lastLineLength(s);
    const effectiveLen = isMultiLine
      ? lastLen - this.indentStr().length
      : lastLen;
    if (alignWidth !== undefined && alignWidth > effectiveLen) {
      s = s + ' '.repeat(alignWidth - effectiveLen);
    }
    if (alias.asToken) {
      s += ' ' + this.kw('AS') + ' ' + this.formatIdentifierPart(alias.name);
    } else {
      s += ' ' + this.formatIdentifierPart(alias.name);
    }
    return s;
  }

  private formatSelectItem(node: SqlNode, alignWidth?: number, wrap?: boolean): string {
    const aliased = node as any;
    if (aliased._expression) {
      let s = wrap
        ? this.wrapExpression(aliased._expression, this.indent)
        : this.formatNode(aliased._expression);
      if (aliased._expression._parenthesized) {
        s = '(' + s + ')';
      }
      if (aliased.alias) {
        s = this.appendSelectItemAlias(s, aliased.alias, alignWidth);
      }
      // If the full line (expression + alias) still exceeds max width and the
      // expression stayed on one line, re-format with CASE collapsing disabled
      // so the CASE expands to multiple lines.
      if (wrap && !s.includes('\n') && this.config.whitespace.wrapLongLines) {
        const lineLen = s.length + this.indent * this.tabStr.length;
        if (lineLen > this.config.whitespace.wrapLinesLongerThan) {
          const savedCaseCollapse = this.config.caseExpressions.collapseShortCaseExpressions;
          (this.config.caseExpressions as any).collapseShortCaseExpressions = false;
          s = this.wrapExpression(aliased._expression, this.indent);
          if (aliased._expression._parenthesized) {
            s = '(' + s + ')';
          }
          (this.config.caseExpressions as any).collapseShortCaseExpressions = savedCaseCollapse;
          if (aliased.alias) {
            s = this.appendSelectItemAlias(s, aliased.alias, alignWidth);
          }
        }
      }
      return s;
    }
    // IdentifierNode with alias — handle alignment
    if (node.type === 'identifier' && (node as IdentifierNode).alias && alignWidth !== undefined) {
      const idNode = node as IdentifierNode;
      let s = idNode.parts.map(p => this.formatIdentifierPart(p)).join('.');
      if (alignWidth > s.length) {
        s = s + ' '.repeat(alignWidth - s.length);
      }
      if (idNode.alias!.asToken) {
        s += ' ' + this.kw('AS') + ' ' + this.formatIdentifierPart(idNode.alias!.name);
      } else {
        s += ' ' + this.formatIdentifierPart(idNode.alias!.name);
      }
      return s;
    }
    return this.formatNode(node);
  }

  // --- FROM / JOIN ---

  private formatJoin(node: JoinNode, baseIndent?: number): string {
    const bi = baseIndent ?? this.indent;
    const clauseIndent = this.indentStr(bi + 1);
    const joinKw = node.joinKeywords.map(t => this.kw(t.value)).join(' ');
    const tableNode = node.table;
    let line: string;
    if (tableNode.type === 'parenGroup' && tableNode.inner.length === 1 && tableNode.inner[0].type === 'select') {
      const formatted = this.formatParenGroup(tableNode, bi + 1);
      if (formatted.includes('\n')) {
        // Multi-line subquery: put on next line
        line = clauseIndent + joinKw + '\n' + clauseIndent + formatted;
      } else {
        // Collapsed subquery: keep on same line
        line = clauseIndent + joinKw + ' ' + formatted;
      }
    } else {
      line = clauseIndent + joinKw + ' ' + this.formatNode(tableNode);
    }
    if (node.on) {
      const onIndent = this.indentStr(bi + 2);
      const onPrefix = this.kw('ON') + ' ';
      const savedIndent = this.indent;
      this.indent = bi + 2;
      const condStr = this.formatNode(node.on.condition);
      this.indent = savedIndent;
      const onLine = onIndent + onPrefix + condStr;

      if (this.config.whitespace.wrapLongLines && onLine.length > this.config.whitespace.wrapLinesLongerThan) {
        const condFormatted = this.config.operators.comparison.align
          ? this.formatConditionAligned(node.on.condition, bi + 2, onPrefix.length)
          : this.formatCondition(node.on.condition, bi + 2);
        line += '\n' + onIndent + onPrefix + condFormatted;
      } else {
        line += '\n' + onLine;
      }
    }
    return line;
  }

  private collapseJoin(node: JoinNode): string {
    const joinKw = node.joinKeywords.map(t => this.kw(t.value)).join(' ');
    const table = this.formatNode(node.table);
    let s = joinKw + ' ' + table;
    if (node.on) s += ' ' + this.kw('ON') + ' ' + this.formatNode(node.on.condition);
    return s;
  }

  // --- WHERE ---

  formatWhere(node: WhereNode, baseIndent?: number): string {
    const bi = baseIndent ?? this.indent;
    const indent = this.indentStr(bi);
    const clauseIndent = this.indentStr(bi + 1);

    // Format condition with AND/OR handling
    const condStr = this.formatCondition(node.condition, bi + 1);
    return indent + this.kw('WHERE') + '\n' + clauseIndent + condStr;
  }

  private formatCondition(node: SqlNode, indentLevel: number): string {
    // If this node was parenthesized in the source, format the inner expression
    // and wrap it in parens to preserve grouping
    if ((node as any)._parenthesized) {
      const inner = this.formatConditionInner(node, indentLevel);
      return '(' + inner + ')';
    }
    return this.formatConditionInner(node, indentLevel);
  }

  private formatConditionInner(node: SqlNode, indentLevel: number): string {
    if (node.type === 'expression') {
      const expr = node as ExpressionNode;
      const opUpper = expr.operator.value.toUpperCase();
      if (opUpper === 'AND' || opUpper === 'OR') {
        // If comparison alignment is enabled, collect all conditions in the
        // AND/OR chain and pad the left-hand sides of comparison expressions
        // so that the comparison operators (=, <, >, etc.) line up vertically.
        if (this.config.operators.comparison.align) {
          return this.formatConditionAligned(node, indentLevel, 0);
        }
        const left = this.formatCondition(expr.left, indentLevel);
        const right = this.formatCondition(expr.right, indentLevel);
        const indent = this.indentStr(indentLevel);
        const opComments = this.formatTokenLeadingComments(expr.operator, indentLevel);
        return left + '\n' + (opComments ? opComments : '') + indent + this.kw(opUpper) + ' ' + right;
      }
    }
    return this.formatNode(node);
  }

  /**
   * Collect leaf conditions from an AND/OR chain, compute the max left-hand
   * width of comparison expressions, and format with padding to align
   * comparison operators vertically.
   */
  private formatConditionAligned(node: SqlNode, indentLevel: number, initialPrefixWidth: number): string {
    const items: { node: SqlNode; op: string; opComments: string; parenthesized: boolean }[] = [];
    this.collectConditionChain(node, items, indentLevel);

    // For each leaf, compute the formatted left-hand side of comparisons
    const COMPARISON_OPS = ['=', '<', '>', '<=', '>=', '<>', '!='];
    const formattedItems: { left: string; op: string; right: string; isComparison: boolean; logicalOp: string; opComments: string }[] = [];

    for (const item of items) {
      let innerNode = item.node;
      let parenthesized = item.parenthesized || (innerNode as any)._parenthesized;
      if (innerNode.type === 'expression') {
        const expr = innerNode as ExpressionNode;
        if (COMPARISON_OPS.includes(expr.operator.value)) {
          const left = this.maybeParenthesize(expr.left, this.formatNode(expr.left));
          const right = this.maybeParenthesize(expr.right, this.formatNode(expr.right));
          const op = this.tokenValue(expr.operator);
          let leftStr = left;
          let rightStr = op + ' ' + right;
          if (parenthesized) {
            leftStr = '(' + leftStr;
            rightStr = rightStr + ')';
          }
          formattedItems.push({ left: leftStr, op, right: rightStr, isComparison: true, logicalOp: item.op, opComments: item.opComments });
          continue;
        }
      }
      // Non-comparison leaf — format normally
      let formatted = this.formatNode(innerNode);
      if (parenthesized) formatted = '(' + formatted + ')';
      formattedItems.push({ left: formatted, op: '', right: '', isComparison: false, logicalOp: item.op, opComments: item.opComments });
    }

    // Find max total width (prefix + left-hand side) among comparison
    // expressions so that the comparison operators align vertically.
    // The first item uses initialPrefixWidth (e.g. width of "ON ") while
    // subsequent items use their logical operator prefix width (e.g. "AND ").
    let maxTotalWidth = 0;
    for (let i = 0; i < formattedItems.length; i++) {
      const item = formattedItems[i];
      if (item.isComparison) {
        const prefixWidth = i === 0 ? initialPrefixWidth : (item.logicalOp ? item.logicalOp.length + 1 : 0);
        const totalWidth = prefixWidth + item.left.length;
        if (totalWidth > maxTotalWidth) {
          maxTotalWidth = totalWidth;
        }
      }
    }

    // Build output
    const indent = this.indentStr(indentLevel);
    let result = '';
    for (let i = 0; i < formattedItems.length; i++) {
      const item = formattedItems[i];
      const prefixWidth = i === 0 ? initialPrefixWidth : (item.logicalOp ? item.logicalOp.length + 1 : 0);
      if (i > 0) {
        result += '\n' + (item.opComments ? item.opComments : '') + indent + this.kw(item.logicalOp) + ' ';
      }
      if (item.isComparison) {
        const targetLeftWidth = maxTotalWidth - prefixWidth;
        const padded = item.left + ' '.repeat(Math.max(0, targetLeftWidth - item.left.length));
        result += padded + ' ' + item.right;
      } else {
        result += item.left;
      }
    }
    return result;
  }

  /** Flatten an AND/OR chain into a list of leaf condition nodes. */
  private collectConditionChain(
    node: SqlNode,
    items: { node: SqlNode; op: string; opComments: string; parenthesized: boolean }[],
    indentLevel: number,
  ): void {
    const parenthesized = !!(node as any)._parenthesized;
    if (node.type === 'expression') {
      const expr = node as ExpressionNode;
      const opUpper = expr.operator.value.toUpperCase();
      if ((opUpper === 'AND' || opUpper === 'OR') && !parenthesized) {
        this.collectConditionChain(expr.left, items, indentLevel);
        const opComments = this.formatTokenLeadingComments(expr.operator, indentLevel);
        // For the right side, push with this logical op
        const rightItems: { node: SqlNode; op: string; opComments: string; parenthesized: boolean }[] = [];
        this.collectConditionChain(expr.right, rightItems, indentLevel);
        if (rightItems.length > 0) {
          rightItems[0].op = opUpper;
          rightItems[0].opComments = opComments;
          items.push(...rightItems);
        }
        return;
      }
    }
    items.push({ node, op: '', opComments: '', parenthesized });
  }

  // --- GROUP BY ---

  formatGroupBy(node: GroupByNode, baseIndent?: number): string {
    const bi = baseIndent ?? this.indent;
    const indent = this.indentStr(bi);
    const clauseIndent = this.indentStr(bi + 1);
    const items = node.items.map(i => this.formatNode(i));
    return indent + this.kw('GROUP') + ' ' + this.kw('BY') + '\n' +
      items.map(i => clauseIndent + i).join(',\n');
  }

  // --- ORDER BY ---

  formatOrderBy(node: OrderByNode, baseIndent?: number): string {
    const bi = baseIndent ?? this.indent;
    const indent = this.indentStr(bi);
    const clauseIndent = this.indentStr(bi + 1);
    const items = node.items.map(i => {
      let s = this.formatNode(i.expr);
      if (i.direction) s += ' ' + this.kw(i.direction.value);
      return s;
    });
    return indent + this.kw('ORDER') + ' ' + this.kw('BY') + '\n' +
      items.map(i => clauseIndent + i).join(',\n');
  }

  // --- HAVING ---

  formatHaving(node: HavingNode, baseIndent?: number): string {
    const bi = baseIndent ?? this.indent;
    const indent = this.indentStr(bi);
    const clauseIndent = this.indentStr(bi + 1);
    return indent + this.kw('HAVING') + '\n' + clauseIndent + this.formatNode(node.condition);
  }

  // --- INSERT ---

  private formatInsert(node: InsertNode): string {
    const indent = this.indentStr();
    const clauseIndent = this.indentStr(this.indent + 1);

    // Try collapse
    if (this.config.dml.collapseShortStatements) {
      const collapsed = this.collapseInsert(node);
      if (collapsed !== null && collapsed.length <= this.config.dml.collapseStatementsShorterThan) {
        return indent + collapsed;
      }
    }

    const lines: string[] = [];

    let insertLine = indent + this.kw('INSERT');
    if (node.intoToken) insertLine += ' ' + this.kw('INTO');
    insertLine += ' ' + this.formatNode(node.target);
    lines.push(insertLine);

    if (node.columns) {
      lines.push(indent + '(');
      const colLines: string[] = [];
      for (let i = 0; i < node.columns.length; i++) {
        const c = node.columns[i];
        const comments = this.formatTokenLeadingComments(this.getFirstToken(c)!, this.indent + 1);
        const comma = i < node.columns.length - 1 ? ',' : '';
        colLines.push(comments + clauseIndent + this.formatNode(c) + comma);
      }
      lines.push(colLines.join('\n'));
      lines.push(indent + ')');
    }

    if (node.values) {
      lines.push(indent + this.kw('VALUES'));
      for (const row of node.values.rows) {
        const hasComments = row.some(v => (v as any)._trailingComment);
        if (hasComments) {
          // Format each value on its own line with comments
          const formatted = row.map(v => ({
            text: this.formatNode(v),
            comment: (v as any)._trailingComment as Token | undefined,
          }));

          // Compute alignment width for comments
          let alignWidth = 0;
          if (this.config.lists.alignComments) {
            for (let i = 0; i < formatted.length; i++) {
              const suffix = i < formatted.length - 1 ? ',' : '';
              const lineLen = formatted[i].text.length + suffix.length;
              if (formatted[i].comment && lineLen > alignWidth) alignWidth = lineLen;
            }
          }

          lines.push(indent + '(');
          for (let i = 0; i < formatted.length; i++) {
            const comma = i < formatted.length - 1 ? ',' : '';
            let valueLine = clauseIndent + formatted[i].text + comma;
            if (formatted[i].comment) {
              if (this.config.lists.alignComments && alignWidth > 0) {
                const contentLen = formatted[i].text.length + comma.length;
                const pad = alignWidth - contentLen;
                if (pad > 0) valueLine += ' '.repeat(pad);
              }
              valueLine += ' ' + formatted[i].comment!.value;
            }
            lines.push(valueLine);
          }
          lines.push(indent + ')');
        } else {
          lines.push(indent + '(' + row.map(v => this.formatNode(v)).join(', ') + ')');
        }
      }
    }

    if (node.select) {
      lines.push(this.formatSelect(node.select));
    }

    if (node.exec) {
      lines.push(indent + this.formatNode(node.exec));
    }

    return lines.join('\n');
  }

  private collapseInsert(node: InsertNode): string | null {
    let s = this.kw('INSERT');
    if (node.intoToken) s += ' ' + this.kw('INTO');
    s += ' ' + this.formatNode(node.target);
    if (node.columns) {
      s += ' (' + node.columns.map(c => this.formatNode(c)).join(', ') + ')';
    }
    if (node.values) {
      if (node.values.rows.length !== 1) return null; // multi-row VALUES don't collapse
      // Skip collapse if any value has trailing comments
      if (node.values.rows[0].some(v => (v as any)._trailingComment)) return null;
      s += ' ' + this.kw('VALUES') + ' (' + node.values.rows[0].map(v => this.formatNode(v)).join(', ') + ')';
    }
    if (node.select) {
      s += ' ' + this.collapseSelect(node.select);
    }
    if (node.exec) {
      s += ' ' + this.formatNode(node.exec);
    }
    return s;
  }

  // --- UPDATE ---

  private formatUpdate(node: UpdateNode): string {
    const indent = this.indentStr();
    const clauseIndent = this.indentStr(this.indent + 1);

    // Try collapse
    if (this.config.dml.collapseShortStatements) {
      const collapsed = this.collapseUpdate(node);
      if (collapsed.length <= this.config.dml.collapseStatementsShorterThan) {
        return indent + collapsed;
      }
    }

    const lines: string[] = [];

    lines.push(indent + this.kw('UPDATE') + ' ' + this.formatNode(node.target));
    lines.push(indent + this.kw('SET'));
    for (let i = 0; i < node.assignments.length; i++) {
      const a = node.assignments[i];
      const comma = i < node.assignments.length - 1 ? ',' : '';
      lines.push(clauseIndent + this.formatNode(a.column) + ' = ' + this.formatNode(a.value) + comma);
    }

    if (node.from) {
      lines.push(indent + this.kw('FROM') + ' ' + this.formatNode(node.from.source));
      for (const join of node.from.joins) {
        lines.push(this.formatJoin(join, this.indent));
      }
    }
    if (node.where) {
      lines.push(this.formatWhere(node.where));
    }

    return lines.join('\n');
  }

  private collapseUpdate(node: UpdateNode): string {
    let s = this.kw('UPDATE') + ' ' + this.formatNode(node.target);
    s += ' ' + this.kw('SET') + ' ' + node.assignments.map(a =>
      this.formatNode(a.column) + ' = ' + this.formatNode(a.value)
    ).join(', ');
    if (node.from) {
      s += ' ' + this.kw('FROM') + ' ' + this.formatNode(node.from.source);
      for (const j of node.from.joins) {
        s += ' ' + this.collapseJoin(j);
      }
    }
    if (node.where) {
      s += ' ' + this.kw('WHERE') + ' ' + this.formatNode(node.where.condition);
    }
    return s;
  }

  // --- DELETE ---

  private formatDelete(node: DeleteNode): string {
    const indent = this.indentStr();
    let s = indent + this.kw('DELETE');
    if (node.fromToken) s += ' ' + this.kw('FROM');
    s += ' ' + this.formatNode(node.target);
    if (node.where) {
      s += '\n' + this.formatWhere(node.where);
    }
    return s;
  }

  // --- CTE ---

  private formatCTE(node: CteNode): string {
    const indent = this.indentStr();
    const lines: string[] = [];

    for (let i = 0; i < node.ctes.length; i++) {
      const cte = node.ctes[i];
      const prefix = i === 0 ? this.kw('WITH') + ' ' : indent + '    ';
      let cteLine = prefix + this.tokenValue(cte.name);
      if (cte.columns) {
        cteLine += ' (' + cte.columns.map(c => this.tokenValue(c)).join(', ') + ')';
      }
      cteLine += ' ' + this.kw('AS');
      lines.push(indent + cteLine);
      lines.push(indent + '(');

      this.indent++;
      lines.push(this.formatNode(cte.query));
      this.indent--;

      lines.push(indent + ')' + (i < node.ctes.length - 1 ? ',' : ''));
    }

    lines.push(this.formatNode(node.statement));
    return lines.join('\n');
  }

  // --- BEGIN/END ---

  private formatBeginEnd(node: BeginEndNode): string {
    const preserve = this.config.whitespace.newLines.preserveExistingEmptyLinesBetweenStatements;
    const indent = this.indentStr();
    const lines: string[] = [];
    lines.push(indent + this.kw('BEGIN'));

    this.indent++;
    for (const stmt of node.statements) {
      const formatted = this.formatStatement(stmt);
      if (preserve && lines.length > 1 && this.hasPrecedingBlankLine(stmt)) {
        lines.push('');
      }
      lines.push(formatted);
    }
    this.indent--;

    lines.push(indent + this.kw('END'));
    return lines.join('\n');
  }

  // --- IF/ELSE ---

  private formatIfElse(node: IfElseNode): string {
    const indent = this.indentStr();
    const lines: string[] = [];
    const kwName = node.ifToken.value.toUpperCase() === 'WHILE' ? 'WHILE' : 'IF';

    // Try collapse
    if (this.config.controlFlow.collapseShortStatements) {
      const collapsed = this.collapseIfElse(node, kwName);
      if (collapsed.length <= this.config.controlFlow.collapseStatementsShorterThan) {
        return indent + collapsed;
      }
    }

    lines.push(indent + this.kw(kwName) + ' ' + this.formatNode(node.condition));

    if (node.thenStatement.type === 'beginEnd') {
      lines.push(this.formatNode(node.thenStatement));
    } else {
      this.indent++;
      lines.push(this.formatStatement(node.thenStatement));
      this.indent--;
    }

    if (node.elseClause) {
      lines.push(indent + this.kw('ELSE'));
      if (node.elseClause.statement.type === 'beginEnd') {
        lines.push(this.formatNode(node.elseClause.statement));
      } else if (node.elseClause.statement.type === 'ifElse') {
        // ELSE IF on same line
        lines[lines.length - 1] = indent + this.kw('ELSE') + ' ' + this.formatStatement(node.elseClause.statement).trimStart();
      } else {
        this.indent++;
        lines.push(this.formatStatement(node.elseClause.statement));
        this.indent--;
      }
    }

    return lines.join('\n');
  }

  private collapseIfElse(node: IfElseNode, kwName: string): string {
    let s = this.kw(kwName) + ' ' + this.formatNode(node.condition) + ' ' + this.formatStatement(node.thenStatement).trim();
    if (node.elseClause) {
      s += ' ' + this.kw('ELSE') + ' ' + this.formatStatement(node.elseClause.statement).trim();
    }
    return s;
  }

  // --- DECLARE ---

  private formatDeclare(node: DeclareNode): string {
    const indent = this.indentStr();
    let nameWidth = 0;
    if (this.config.variables.alignDataTypesAndValues && node.variables.length > 1) {
      nameWidth = Math.max(...node.variables.map(v => v.name.value.length));
    }
    const vars = node.variables.map(v => {
      const name = nameWidth > 0 ? this.padToWidth(v.name.value, nameWidth) : v.name.value;
      const asPrefix = v.asToken ? this.kw('AS') + ' ' : '';
      // Table variable: DECLARE @t AS TABLE (columns...)
      if (v.tableColumns) {
        const baseIndent = this.indentStr();
        const colIndent = this.indentStr(this.indent + 1);
        let colNameWidth = 0;
        if (this.config.ddl.alignDataTypesAndConstraints && v.tableColumns.length > 1) {
          colNameWidth = Math.max(...v.tableColumns.map(c => {
            if (c.type === 'columnDef') {
              return this.formatIdentifierPart((c as ColumnDefNode).name).length;
            }
            return 0;
          }));
        }
        const colStrs = v.tableColumns.map(c => {
          if (c.type === 'constraint') {
            return colIndent + this.formatConstraint(c as ConstraintNode);
          }
          return colIndent + this.formatColumnDef(c as ColumnDefNode, colNameWidth);
        });
        return name + ' ' + asPrefix + this.kw('TABLE') + '\n' +
          baseIndent + '(\n' +
          colStrs.join(',\n') + '\n' +
          baseIndent + ')';
      }
      let s = name + ' ' + asPrefix + this.formatDataType(v.dataType);
      if (v.default) s += ' = ' + this.formatNode(v.default);
      return s;
    });

    if (vars.length === 1) {
      return indent + this.kw('DECLARE') + ' ' + vars[0];
    }

    return indent + this.kw('DECLARE') + '\n' +
      vars.map(v => this.indentStr(this.indent + 1) + v).join(',\n');
  }

  // --- SET ---

  private formatSet(node: SetNode): string {
    const indent = this.indentStr();
    if (node.isSpecial) {
      // Special SET options use space-separated keywords (not dot-joined identifiers)
      const fmtSpecialIdent = (n: SqlNode): string => {
        if (n.type === 'identifier') {
          return (n as IdentifierNode).parts.map(p => this.kw(p.value)).join(' ');
        }
        return this.formatNode(n);
      };
      let s = indent + this.kw('SET') + ' ' + fmtSpecialIdent(node.target);
      // SET IDENTITY_INSERT has a table name between target and value
      if ((node as any).tableName) {
        s += ' ' + this.formatNode((node as any).tableName);
      }
      s += ' ' + fmtSpecialIdent(node.value);
      return s;
    }
    return indent + this.kw('SET') + ' ' + this.formatNode(node.target) + ' = ' + this.formatNode(node.value);
  }

  // --- PRINT ---

  private formatPrint(node: PrintNode): string {
    const indent = this.indentStr();
    return indent + this.kw('PRINT') + ' ' + this.formatNode(node.expression);
  }

  // --- RETURN ---

  private formatReturn(node: ReturnNode): string {
    const indent = this.indentStr();
    if (node.expression) {
      return indent + this.kw('RETURN') + ' ' + this.formatNode(node.expression);
    }
    return indent + this.kw('RETURN');
  }

  // --- CASE ---

  private formatCase(node: CaseNode): string {
    // Try collapse
    if (this.config.caseExpressions.collapseShortCaseExpressions) {
      const collapsed = this.collapseCase(node);
      const indentWidth = this.indent * this.tabStr.length;
      if (collapsed.length + indentWidth <= this.config.caseExpressions.collapseCaseExpressionsShorterThan) {
        return collapsed;
      }
    }

    const parts: string[] = [];
    let caseLine = this.kw('CASE');
    if (node.inputExpr) caseLine += ' ' + this.formatNode(node.inputExpr);
    parts.push(caseLine);

    const whenIndent = this.indentStr(this.indent + 1);
    const thenAlignment = this.config.caseExpressions.thenAlignment;
    let thenIndent: string;
    if (thenAlignment === 'toWhen') {
      thenIndent = whenIndent;
    } else {
      // 'indentedFromWhen' or default
      thenIndent = whenIndent + this.tabStr;
    }
    const wrapEnabled = this.config.whitespace.wrapLongLines;
    const maxLineLen = this.config.whitespace.wrapLinesLongerThan;
    const resultIndent = thenIndent + this.tabStr;
    // Compute result indent level for wrapExpression
    const resultIndentLevel = thenAlignment === 'toWhen'
      ? this.indent + 2
      : this.indent + 3;

    for (const wc of node.whenClauses) {
      let whenLine = whenIndent + this.kw('WHEN') + ' ' + this.formatNode(wc.condition);
      const resultStr = this.formatNode(wc.result);
      if (this.config.caseExpressions.placeThenOnNewLine) {
        parts.push(whenLine);
        const thenLine = thenIndent + this.kw('THEN') + ' ' + resultStr;
        if (wrapEnabled && thenLine.length > maxLineLen) {
          parts.push(thenIndent + this.kw('THEN'));
          const wrappedResult = this.wrapExpression(wc.result, resultIndentLevel);
          parts.push(resultIndent + wrappedResult);
        } else {
          parts.push(thenLine);
        }
      } else {
        const fullLine = whenLine + ' ' + this.kw('THEN') + ' ' + resultStr;
        if (wrapEnabled && fullLine.length > maxLineLen) {
          // Put THEN on new line, and possibly the result on another
          parts.push(whenLine);
          const thenLine = thenIndent + this.kw('THEN') + ' ' + resultStr;
          if (thenLine.length > maxLineLen) {
            parts.push(thenIndent + this.kw('THEN'));
            const wrappedResult = this.wrapExpression(wc.result, resultIndentLevel);
            parts.push(resultIndent + wrappedResult);
          } else {
            parts.push(thenLine);
          }
        } else {
          parts.push(fullLine);
        }
      }
    }

    if (node.elseClause) {
      parts.push(whenIndent + this.kw('ELSE') + ' ' + this.formatNode(node.elseClause.result));
    }

    parts.push(this.indentStr() + this.kw('END'));
    return parts.join('\n');
  }

  private collapseCase(node: CaseNode): string {
    let s = this.kw('CASE');
    if (node.inputExpr) s += ' ' + this.formatNode(node.inputExpr);
    for (const wc of node.whenClauses) {
      s += ' ' + this.kw('WHEN') + ' ' + this.formatNode(wc.condition) + ' ' + this.kw('THEN') + ' ' + this.formatNode(wc.result);
    }
    if (node.elseClause) s += ' ' + this.kw('ELSE') + ' ' + this.formatNode(node.elseClause.result);
    s += ' ' + this.kw('END');
    return s;
  }

  // --- Expressions ---

  /**
   * Format an expression, wrapping at operator boundaries if the inline
   * result would exceed the configured max line length at the given indent.
   */
  private wrapExpression(node: SqlNode, indentLevel: number): string {
    const inline = this.formatNode(node);
    const indentWidth = indentLevel * this.tabStr.length;
    if (!this.config.whitespace.wrapLongLines ||
        inline.length + indentWidth <= this.config.whitespace.wrapLinesLongerThan) {
      return inline;
    }
    // Try to split at the top-level operator
    if (node.type === 'expression') {
      const expr = node as ExpressionNode;
      const left = this.maybeParenthesize(expr.left, this.wrapExpression(expr.left, indentLevel));
      const right = this.maybeParenthesize(expr.right, this.wrapExpression(expr.right, indentLevel + 1));
      const op = this.tokenValue(expr.operator);
      const indent = this.indentStr(indentLevel);
      const childIndent = this.indentStr(indentLevel + 1);
      return left + '\n' + indent + op + ' ' + right;
    }
    return inline;
  }

  /** Wrap a formatted child expression in parens if it was parenthesized in the source. */
  private maybeParenthesize(child: SqlNode, formatted: string): string {
    if ((child as any)._parenthesized) {
      return '(' + formatted + ')';
    }
    return formatted;
  }

  private formatExpression(node: ExpressionNode): string {
    const left = this.maybeParenthesize(node.left, this.formatNode(node.left));
    const right = this.maybeParenthesize(node.right, this.formatNode(node.right));
    const op = this.tokenValue(node.operator);

    // Handle unary (empty left)
    if (left === '') return op + right;

    // Emit leading comments on the operator token (e.g. comment before AND)
    const opComments = this.formatTokenLeadingComments(node.operator);

    const opUpper = node.operator.value.toUpperCase();

    // Format operator with optional leading comments
    const opPrefix = opComments
      ? '\n' + opComments + this.indentStr()
      : ' ';

    // Special: IS, IS NOT, LIKE, NOT LIKE
    if (opUpper === 'IS' || opUpper === 'IS NOT' || opUpper === 'LIKE' || opUpper.startsWith('NOT ')) {
      return `${left}${opPrefix}${this.kw(opUpper)} ${right}`;
    }

    // Comparison and arithmetic operators — add spaces around them
    if (this.config.operators.comparison.addSpacesAroundComparisonOperators &&
        ['=', '<', '>', '<=', '>=', '<>', '!='].includes(node.operator.value)) {
      if (opComments) return `${left}${opPrefix}${op} ${right}`;
      return `${left} ${op} ${right}`;
    }
    if (this.config.operators.comparison.addSpacesAroundArithmeticOperators &&
        ['+', '-', '*', '/', '%'].includes(node.operator.value)) {
      if (opComments) return `${left}${opPrefix}${op} ${right}`;
      return `${left} ${op} ${right}`;
    }

    // AND/OR at top level
    if (opUpper === 'AND' || opUpper === 'OR') {
      return `${left}${opPrefix}${this.kw(opUpper)} ${right}`;
    }

    if (opComments) return `${left}${opPrefix}${op} ${right}`;
    return `${left} ${op} ${right}`;
  }

  // --- Function calls ---

  private formatFunctionCall(node: FunctionCallNode): string {
    const name = this.formatNode(node.name);
    const formattedArgs = node.args.map(a => this.formatNode(a));

    // Build inline string: use space (not comma) before AS keyword args (CAST/TRY_CAST/PARSE/TRY_PARSE etc.)
    const inlineParts: string[] = [];
    for (let i = 0; i < formattedArgs.length; i++) {
      if (i === 0) {
        inlineParts.push(formattedArgs[i]);
      } else if (this.isAsKeywordArg(node.args[i]) || this.isAsKeywordArg(node.args[i - 1])) {
        inlineParts.push(' ' + formattedArgs[i]);
      } else {
        inlineParts.push(', ' + formattedArgs[i]);
      }
    }
    const inline = `${name}(${inlineParts.join('')})`;

    // Check if the inline version exceeds the wrap limit or any arg is multi-line
    const indentWidth = this.indent * this.tabStr.length;
    const hasCloseComments = node.closeComments?.length;
    const needsExpand = hasCloseComments ||
      formattedArgs.some(a => a.includes('\n')) ||
      (this.config.whitespace.wrapLongLines &&
       inline.length + indentWidth > this.config.whitespace.wrapLinesLongerThan &&
       node.args.length > 1);

    let result: string;
    if (needsExpand) {
      const innerIndent = this.indentStr(this.indent + 1);
      const outerIndent = this.indentStr(this.indent);
      // Re-format args at the inner indent level so nested constructs align
      const expanded = node.args.map((a, i) => {
        const formatted = this.formatNode(a, this.indent + 1);
        // No comma before/after AS keyword args
        const useComma = i < node.args.length - 1 &&
          !this.isAsKeywordArg(node.args[i + 1]) && !this.isAsKeywordArg(a);
        const comma = useComma ? ',' : '';
        // First line needs innerIndent; subsequent lines already have absolute indentation
        const lines = (innerIndent + formatted).split('\n');
        lines[lines.length - 1] += comma;
        return lines.join('\n');
      });
      const closeCommentStr = this.formatCloseComments(node.closeComments, this.indent);
      result = `${name} (\n${expanded.join('\n')}${closeCommentStr}\n${outerIndent})`;
    } else {
      result = inline;
    }

    // OVER clause: SUM(...) OVER (PARTITION BY ...)
    if (node.overClause) {
      result += ' ' + this.formatOverClause(node.overClause);
    }

    // Table-valued function alias (e.g., OPENJSON(...) AS [w])
    const alias = node.alias;
    if (alias) {
      if (alias.asToken) {
        result += ' ' + this.kw(alias.asToken.value) + ' ' + this.formatIdentifierPart(alias.name);
      } else {
        result += ' ' + this.formatIdentifierPart(alias.name);
      }
    }

    return result;
  }

  /** Format an OVER clause, e.g. OVER (PARTITION BY col ORDER BY col) */
  private formatOverClause(node: SqlNode): string {
    if (node.type === 'parenGroup') {
      const pg = node as ParenGroupNode;
      // First element is the OVER keyword rawToken, rest is the clause content
      // Build output by joining keywords with space and expressions with commas
      let result = this.kw('OVER') + ' (';
      let first = true;
      for (let i = 1; i < pg.inner.length; i++) {
        const n = pg.inner[i];
        const isKeyword = n.type === 'rawToken' && /^(PARTITION BY|ORDER BY|ROWS|RANGE|GROUPS)\b/i.test((n as RawTokenNode).token.value);
        if (isKeyword) {
          if (!first) result += ' ';
          result += this.kw((n as RawTokenNode).token.value.toUpperCase());
        } else {
          if (!first && !isKeywordAt(pg.inner, i - 1)) {
            result += ', ';
          } else {
            if (!first) result += ' ';
          }
          result += this.formatNode(n);
        }
        first = false;
      }
      result += ')';
      return result;
    }
    return this.formatNode(node);
  }

  /** Check if a function arg is the AS keyword (used in CAST/TRY_PARSE etc.) */
  private isAsKeywordArg(node: SqlNode): boolean {
    return node.type === 'rawToken' &&
      (node as RawTokenNode).token.value.toUpperCase() === 'AS';
  }

  // --- Data types ---

  /**
   * Format a data type node (e.g. INT, VARCHAR(50)), applying bracket
   * enclosure per the dataTypes.encloseDataTypes config.
   */
  private formatDataType(node: SqlNode): string {
    const mode = this.config.dataTypes.encloseDataTypes;
    const formatted = this.formatNode(node);

    if (mode === 'asis') return formatted;

    if (mode === 'withBrackets') {
      // VARCHAR(50) → [VARCHAR](50), INT → [INT]
      // The formatted string is either "TYPE" or "TYPE(args)"
      const parenIdx = formatted.indexOf('(');
      if (parenIdx > 0) {
        const typeName = formatted.slice(0, parenIdx);
        const rest = formatted.slice(parenIdx);
        return '[' + typeName + ']' + rest;
      }
      return '[' + formatted + ']';
    }

    if (mode === 'withoutBrackets') {
      // [VARCHAR](50) → VARCHAR(50), [INT] → INT
      return formatted.replace(/\[([^\]]+)\]/g, '$1');
    }

    return formatted;
  }

  // --- Identifiers ---

  private formatIdentifier(node: IdentifierNode): string {
    let s = node.parts.map(p => this.formatIdentifierPart(p)).join('.');
    if (node.alias) {
      if (node.alias.asToken) {
        s += ' ' + this.kw('AS') + ' ' + this.formatIdentifierPart(node.alias.name);
      } else {
        s += ' ' + this.formatIdentifierPart(node.alias.name);
      }
    }
    if (node.pivot) {
      s += '\n' + this.formatPivot(node.pivot, this.indent + 1);
    }
    return s;
  }

  /**
   * Format a single identifier part (table name, column name, alias, schema),
   * applying bracket enclosure rules. This is only called for tokens that
   * appear in identifier positions (IdentifierNode parts), never for
   * standalone SQL keywords.
   */
  private formatIdentifierPart(token: Token): string {
    const idConfig = this.config.identifiers;
    const mode = idConfig.encloseIdentifiers;

    // Already-quoted identifier: [name] or "name"
    if (token.type === TokenType.QuotedIdentifier) {
      const inner = stripQuoting(token.value);
      if (mode === 'withoutBrackets') {
        // Strip brackets, but keep them on reserved words if configured
        if (idConfig.alwaysBracketReservedWordIdentifiers && isReservedWord(inner)) {
          return '[' + inner + ']';
        }
        return inner;
      }
      if (mode === 'withBrackets') {
        // Normalize double-quotes to brackets
        return '[' + inner + ']';
      }
      return token.value; // asis
    }

    // Regular word token in an identifier position
    if (token.type === TokenType.Word) {
      // Skip @variables and wildcards
      if (token.value.startsWith('@') || token.value === '*') {
        return caseWord(token.value, this.config.casing);
      }

      const cased = caseWord(token.value, this.config.casing);

      if (mode === 'withBrackets') {
        const category = categorizeWord(token.value);
        // Only bracket user-defined identifiers (not keywords, functions, data types)
        if (category === 'identifier') {
          return '[' + cased + ']';
        }
      }

      if (mode === 'withoutBrackets') {
        return cased; // already unbracketed
      }

      return cased; // asis
    }

    return token.value;
  }

  // --- Literals ---

  private formatLiteral(node: LiteralNode): string {
    // Apply casing to keyword-like literals (NULL, DEFAULT, etc.)
    if (node.token.type === TokenType.Word) {
      return this.tokenValue(node.token);
    }
    return node.token.value;
  }

  // --- IN expression ---

  private formatInExpression(node: InExpressionNode): string {
    const expr = this.formatNode(node.expression);
    const notStr = node.notToken ? this.kw('NOT') + ' ' : '';
    const formattedValues = node.values.map(v => this.formatNode(v));
    const space = this.config.operators.in.addSpaceAroundInContents ? ' ' : '';

    const valuesStr = formattedValues.join(', ');
    const singleLine = `${expr} ${notStr}${this.kw('IN')} (${space}${valuesStr}${space})`;

    // Check if wrapping is needed
    const maxLineLength = this.config.whitespace.wrapLinesLongerThan;
    // The IN expression is typically placed at indent + 1 (inside a clause)
    const lineIndentWidth = (this.indent + 1) * this.tabStr.length;

    if (!this.config.whitespace.wrapLongLines || singleLine.length + lineIndentWidth <= maxLineLength) {
      return singleLine;
    }

    // Wrap values: pack as many as fit per line, aligning to after the opening paren
    const prefix = `${expr} ${notStr}${this.kw('IN')} (${space}`;
    const continuationPad = ' '.repeat(lineIndentWidth + prefix.length);
    const availableFirstLine = maxLineLength - lineIndentWidth - prefix.length;
    const availableContinuation = maxLineLength - continuationPad.length;

    const lineGroups: string[][] = [];
    let currentGroup: string[] = [];
    let currentLen = 0;
    let isFirstLine = true;

    for (const val of formattedValues) {
      const addLen = currentGroup.length === 0 ? val.length : val.length + 2; // 2 for ", "
      const available = isFirstLine ? availableFirstLine : availableContinuation;

      if (currentGroup.length > 0 && currentLen + addLen > available) {
        lineGroups.push(currentGroup);
        currentGroup = [val];
        currentLen = val.length;
        isFirstLine = false;
      } else {
        currentGroup.push(val);
        currentLen += addLen;
      }
    }
    if (currentGroup.length > 0) {
      lineGroups.push(currentGroup);
    }

    // Build result with continuation lines aligned after the opening paren
    let result = prefix;
    for (let i = 0; i < lineGroups.length; i++) {
      if (i > 0) result += continuationPad;
      result += lineGroups[i].join(', ');
      if (i < lineGroups.length - 1) {
        result += ',\n';
      } else {
        result += space + ')';
      }
    }

    return result;
  }

  // --- BETWEEN ---

  private formatBetween(node: BetweenNode): string {
    const expr = this.formatNode(node.expression);
    const notStr = node.notToken ? this.kw('NOT') + ' ' : '';
    const low = this.formatNode(node.low);
    const high = this.formatNode(node.high);
    return `${expr} ${notStr}${this.kw('BETWEEN')} ${low} ${this.kw('AND')} ${high}`;
  }

  // --- EXISTS ---

  private formatExists(node: ExistsNode): string {
    const notStr = node.notToken ? this.kw('NOT') + ' ' : '';
    const subquery = this.formatNode(node.subquery);
    return `${notStr}${this.kw('EXISTS')} (${subquery})`;
  }

  // --- PIVOT / UNPIVOT ---

  private formatPivot(node: PivotNode, baseIndent?: number): string {
    const bi = baseIndent ?? this.indent;
    const indent = this.indentStr(bi);
    const innerIndent = this.indentStr(bi + 1);
    const lines: string[] = [];

    lines.push(indent + this.kw(node.pivotToken.value));
    lines.push(indent + '(');

    // Aggregation expression
    lines.push(innerIndent + this.formatNode(node.aggregation));

    // FOR column IN (values)
    const formattedValues = node.values.map(v => this.formatNode(v));
    const forPrefix = this.kw('FOR') + ' ' + this.formatNode(node.pivotColumn) + ' ' + this.kw('IN') + ' (';
    const forLine = innerIndent + forPrefix + formattedValues.join(', ') + ')';
    const maxLineLength = this.config.whitespace.wrapLinesLongerThan;

    if (!this.config.whitespace.wrapLongLines || forLine.length <= maxLineLength) {
      lines.push(forLine);
    } else {
      // Wrap values: pack as many as fit per line, aligning after the opening paren
      const continuationPad = innerIndent + ' '.repeat(forPrefix.length);
      const availableFirstLine = maxLineLength - innerIndent.length - forPrefix.length;
      const availableContinuation = maxLineLength - continuationPad.length;

      const lineGroups: string[][] = [];
      let currentGroup: string[] = [];
      let currentLen = 0;
      let isFirstLine = true;

      for (const val of formattedValues) {
        const addLen = currentGroup.length === 0 ? val.length : val.length + 2;
        const available = isFirstLine ? availableFirstLine : availableContinuation;

        if (currentGroup.length > 0 && currentLen + addLen > available) {
          lineGroups.push(currentGroup);
          currentGroup = [val];
          currentLen = val.length;
          isFirstLine = false;
        } else {
          currentGroup.push(val);
          currentLen += addLen;
        }
      }
      if (currentGroup.length > 0) {
        lineGroups.push(currentGroup);
      }

      let result = innerIndent + forPrefix;
      for (let i = 0; i < lineGroups.length; i++) {
        if (i > 0) result += continuationPad;
        result += lineGroups[i].join(', ');
        if (i < lineGroups.length - 1) {
          result += ',\n';
        } else {
          result += ')';
        }
      }
      lines.push(result);
    }

    // Closing paren + alias
    let closeLine = indent + ')';
    if (node.alias) {
      if (node.alias.asToken) {
        closeLine += ' ' + this.kw('AS') + ' ' + this.formatIdentifierPart(node.alias.name);
      } else {
        closeLine += ' ' + this.formatIdentifierPart(node.alias.name);
      }
    }
    lines.push(closeLine);

    return lines.join('\n');
  }

  // --- Paren group ---

  private formatParenGroupAlias(node: ParenGroupNode): string {
    if (!node.alias) return '';
    if (node.alias.asToken) {
      return ' ' + this.kw('AS') + ' ' + this.formatIdentifierPart(node.alias.name);
    }
    return ' ' + this.formatIdentifierPart(node.alias.name);
  }

  private formatParenGroup(node: ParenGroupNode, baseIndent?: number): string {
    const isSubquery = node.inner.length === 1 && node.inner[0].type === 'select';
    const bi = baseIndent ?? this.indent;
    const pivotSuffix = node.pivot ? '\n' + this.formatPivot(node.pivot, bi) : '';

    if (isSubquery) {
      const indent = this.indentStr(bi);
      const dml = this.config.dml;
      const alias = this.formatParenGroupAlias(node);

      // Try collapsing the subquery if configured (skip collapse if pivot or close comments attached)
      if (dml.collapseShortSubqueries && !node.pivot && !node.closeComments?.length) {
        const collapsed = this.collapseSelect(node.inner[0] as SelectNode);
        if (('(' + collapsed + ')' + alias).length <= dml.collapseSubqueriesShorterThan) {
          return '(' + collapsed + ')' + alias;
        }
      }

      // Expanded: use subquery collapse settings for the inner SELECT
      const savedCollapse = dml.collapseShortStatements;
      const savedThreshold = dml.collapseStatementsShorterThan;
      (this.config.dml as any).collapseShortStatements = dml.collapseShortSubqueries;
      (this.config.dml as any).collapseStatementsShorterThan = dml.collapseSubqueriesShorterThan;
      const innerFormatted = this.formatNode(node.inner[0], bi + 1);
      (this.config.dml as any).collapseShortStatements = savedCollapse;
      (this.config.dml as any).collapseStatementsShorterThan = savedThreshold;

      const closeCommentStr = this.formatCloseComments(node.closeComments, bi);
      return '(\n' + innerFormatted + closeCommentStr + '\n' + indent + ')' + alias + pivotSuffix;
    }

    const inner = node.inner.map(n => this.formatNode(n)).join(', ');
    return `(${inner})` + this.formatParenGroupAlias(node) + pivotSuffix;
  }
}

/** Check if the inner node at a given index is an OVER-clause keyword */
function isKeywordAt(inner: SqlNode[], idx: number): boolean {
  if (idx < 0 || idx >= inner.length) return false;
  const n = inner[idx];
  return n.type === 'rawToken' && /^(PARTITION BY|ORDER BY|ROWS|RANGE|GROUPS)\b/i.test((n as RawTokenNode).token.value);
}

/** Strip [brackets] or "double quotes" from a quoted identifier, returning the inner name. */
function stripQuoting(value: string): string {
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1);
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/** Check if a word is a SQL reserved word (used for alwaysBracketReservedWordIdentifiers). */
function isReservedWord(word: string): boolean {
  return categorizeWord(word) !== 'identifier';
}
