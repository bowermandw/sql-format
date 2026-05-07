import { Token, TokenType } from './tokens';
import { SqlNode, BatchNode, SelectNode, CreateProcedureNode, BeginEndNode, TryCatchNode, IfElseNode, SetNode, DeclareNode, PrintNode, ReturnNode, UseNode, ThrowNode, RaiserrorNode, CaseNode, ExpressionNode, FunctionCallNode, IdentifierNode, LiteralNode, RawTokenNode, WhereNode, GroupByNode, OrderByNode, HavingNode, JoinNode, InsertNode, UpdateNode, DeleteNode, CteNode, InExpressionNode, BetweenNode, ExistsNode, ParenGroupNode, CreateTableNode, ColumnDefNode, DropTableNode, AlterTableNode, ConstraintNode, PivotNode, DeclareCursorNode, SetCursorNode, OpenCursorNode, CloseCursorNode, FetchCursorNode, DeallocateCursorNode } from './ast';
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
  private emittedComments = new Set<Token>();

  /** Save the current emittedComments state for rollback if a collapse attempt fails. */
  private saveEmittedComments(): Set<Token> {
    return new Set(this.emittedComments);
  }

  /** Restore emittedComments to a previously saved state (rollback). */
  private restoreEmittedComments(saved: Set<Token>): void {
    this.emittedComments = saved;
  }

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

  private kwToken(token: Token): string {
    return this.kw(token.value.toUpperCase());
  }

  private tokenValue(token: Token): string {
    return token.type === TokenType.Word ? caseWord(token.value, this.config.casing) : token.value;
  }

  private tokenComments(token: Token): { prefix: string; suffix: string } {
    let prefix = '';
    if (token.leadingComments) {
      for (const c of token.leadingComments) {
        if (!this.emittedComments.has(c)) {
          this.emittedComments.add(c);
          prefix += c.value + '\n' + this.indentStr();
        }
      }
    }
    let suffix = '';
    if (token.trailingComment && !this.emittedComments.has(token.trailingComment)) {
      this.emittedComments.add(token.trailingComment);
      suffix = ' ' + token.trailingComment.value;
    }
    return { prefix, suffix };
  }

  private tokenValueWithComments(token: Token): string {
    const { prefix, suffix } = this.tokenComments(token);
    return prefix + this.tokenValue(token) + suffix;
  }

  private kwTokenWithComments(token: Token): string {
    const { prefix, suffix } = this.tokenComments(token);
    return prefix + this.kwToken(token) + suffix;
  }

  private formatIdentifierPartWithComments(token: Token): string {
    const { prefix, suffix } = this.tokenComments(token);
    return prefix + this.formatIdentifierPart(token) + suffix;
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
    // If the semicolon was already emitted (e.g. for comment alignment), skip
    if (node && (node as any)._semicolonHandled) return formatted;
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
      case 'use':
      case 'throw':
      case 'raiserror':
      case 'rawToken':
      case 'dropTable':
      case 'createTable':
      case 'alterTable':
      case 'declareCursor':
      case 'setCursor':
      case 'openCursor':
      case 'closeCursor':
      case 'fetchCursor':
      case 'deallocateCursor':
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
      case 'use': return node.token;
      case 'throw': return node.token;
      case 'raiserror': return node.token;
      case 'declareCursor': return node.token;
      case 'setCursor': return node.token;
      case 'openCursor': return node.token;
      case 'closeCursor': return node.token;
      case 'fetchCursor': return node.token;
      case 'deallocateCursor': return node.token;
      case 'beginEnd': return node.beginToken;
      case 'tryCatch': return node.tryBlock.beginToken;
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
        if (node.union) return this.getLastToken(node.union.select);
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
      case 'use': return this.getLastToken(node.database);
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
    // Comments from a parenthesized expression's open paren are stored
    // on the node itself since the paren token is not preserved in the AST.
    // For IdentifierNodes with _expression, check the expression too.
    const exprNode = (node as any)._expression || node;
    const parenComments: Token[] | undefined = (exprNode as any)._parenLeadingComments
      || (exprNode.type === 'parenGroup' ? (exprNode as ParenGroupNode).openParenComments : undefined);
    const token = this.getFirstToken(node);
    const allComments = [
      ...(parenComments || []),
      ...(token?.leadingComments || []),
    ];
    if (!allComments.length) return '';
    const indent = this.indentStr();
    const preserve = this.config.whitespace.newLines.preserveExistingEmptyLinesBetweenComments;
    const lines: string[] = [];
    for (const c of allComments) {
      if (this.emittedComments.has(c)) continue;
      this.emittedComments.add(c);
      if (preserve && c.precedingBlankLine && lines.length > 0) {
        lines.push('');
      }
      lines.push(indent + c.value);
    }
    if (!lines.length) return '';
    if (preserve && token?.blankLineAfterLeadingComments) {
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
      if (this.emittedComments.has(c)) continue;
      this.emittedComments.add(c);
      if (preserve && c.precedingBlankLine && lines.length > 0) {
        lines.push('');
      }
      lines.push(indent + c.value);
    }
    if (!lines.length) return '';
    if (preserve && token.blankLineAfterLeadingComments) {
      lines.push('');
    }
    return lines.join('\n') + '\n';
  }

  /** Format comments that appeared before a closing parenthesis. */
  private formatCloseComments(comments: Token[] | undefined, indentLevel: number): string {
    if (!comments?.length) return '';
    const indent = this.indentStr(indentLevel + 1);
    return '\n' + comments.map(c => { this.emittedComments.add(c); return indent + c.value; }).join('\n');
  }

  /** Get the trailing inline comment from the last token of a node (if any). */
  private getTrailingComment(node: SqlNode): string {
    const token = this.getLastToken(node);
    if (token?.trailingComment && !this.emittedComments.has(token.trailingComment)) {
      this.emittedComments.add(token.trailingComment);
      return ' ' + token.trailingComment.value;
    }
    return '';
  }

  /** Get the trailing comment from the comma that preceded this list item's first token. */
  private getCommaComment(node: SqlNode): string {
    const token = this.getFirstToken(node);
    if (token?._commaComment && !this.emittedComments.has(token._commaComment)) {
      this.emittedComments.add(token._commaComment);
      return ' ' + token._commaComment.value;
    }
    return '';
  }

  /** Get the trailing comment from the comma that preceded this token. */
  private getTokenCommaComment(token: Token): string {
    if (token?._commaComment && !this.emittedComments.has(token._commaComment)) {
      this.emittedComments.add(token._commaComment);
      return ' ' + token._commaComment.value;
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
    // Emit trailing comment from the semicolon (same line as last token)
    let semiComment = '';
    const semiTrailing = (node as any)._semicolonTrailingComment as Token | undefined;
    if (semiTrailing && !this.emittedComments.has(semiTrailing)) {
      this.emittedComments.add(semiTrailing);
      semiComment = ' ' + semiTrailing.value;
    }
    if (this.isLeafStatement(node)) {
      return comments + this.withSemicolon(formatted, node) + trailing + semiComment;
    }
    return comments + formatted + trailing + semiComment;
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
      for (const c of node.trailingComments) {
        this.emittedComments.add(c);
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
      case 'tryCatch': return this.formatTryCatch(node);
      case 'ifElse': return this.formatIfElse(node);
      case 'declare': return this.formatDeclare(node);
      case 'set': return this.formatSet(node);
      case 'print': return this.formatPrint(node);
      case 'return': return this.formatReturn(node);
      case 'use': return this.formatUse(node);
      case 'throw': return this.formatThrow(node);
      case 'raiserror': return this.formatRaiserror(node);
      case 'declareCursor': return this.formatDeclareCursor(node);
      case 'setCursor': return this.formatSetCursor(node);
      case 'openCursor': return this.formatOpenCursor(node);
      case 'closeCursor': return this.formatCloseCursor(node);
      case 'fetchCursor': return this.formatFetchCursor(node);
      case 'deallocateCursor': return this.formatDeallocateCursor(node);
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

    // Try collapse (skip if any node has comments that would be lost)
    if (this.config.ddl.collapseShortStatements && !this.nodeHasComments(node)) {
      const saved = this.saveEmittedComments();
      const collapsed = this.collapseCreateTable(node, kw, name);
      if (collapsed.length <= this.config.ddl.collapseStatementsShorterThan) {
        return baseIndent + collapsed;
      }
      this.restoreEmittedComments(saved);
    }

    const parts: string[] = [`${baseIndent}${kw} ${name}`];
    parts.push(baseIndent + '(');
    const colIndent = this.indentStr(this.indent + 1);
    let nameWidth = 0;
    if (this.config.ddl.alignDataTypesAndConstraints && node.columns.length > 1) {
      const saved = this.saveEmittedComments();
      nameWidth = Math.max(...node.columns.map(c => {
        if (c.type === 'columnDef') {
          return this.formatIdentifierPart((c as ColumnDefNode).name).length;
        }
        return 0;
      }));
      this.restoreEmittedComments(saved);
    }
    const colStrs = node.columns.map(c => {
      const token = c.type === 'columnDef' ? (c as ColumnDefNode).name : (c as ConstraintNode).tokens[0];
      const comments = this.formatTokenLeadingComments(token, this.indent + 1);
      const commaComment = this.getTokenCommaComment(token);
      const line = c.type === 'constraint'
        ? colIndent + this.formatConstraint(c as ConstraintNode)
        : colIndent + this.formatColumnDef(c as ColumnDefNode, nameWidth);
      return { str: comments ? comments.trimEnd() + '\n' + line : line, commaComment };
    });
    // commaComment[i] is the trailing comment from the comma BEFORE item i,
    // so it should appear after the comma on the previous line
    const colLines: string[] = [];
    for (let i = 0; i < colStrs.length; i++) {
      const suffix = i < colStrs.length - 1
        ? ',' + (colStrs[i + 1].commaComment || '')
        : '';
      colLines.push(colStrs[i].str + suffix);
    }
    parts.push(colLines.join('\n'));
    // Emit any comments on the close paren (e.g., commented-out columns at end)
    if (node.closeParen) {
      const closeComments = this.formatTokenLeadingComments(node.closeParen, this.indent + 1);
      if (closeComments) {
        parts.push(closeComments.trimEnd());
      }
    }
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
    const colName = this.formatIdentifierPartWithComments(node.name);
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
        parts.push(this.tokenValueWithComments(t));
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
        // Collation names after COLLATE should never be bracketed
        const prevToken = i > 0 ? node.tokens[i - 1] : undefined;
        const afterCollate = prevToken?.type === TokenType.Word && prevToken.value.toUpperCase() === 'COLLATE';
        if (afterCollate) {
          parts.push(this.tokenValueWithComments(t));
        } else {
          const category = t.type === TokenType.QuotedIdentifier ? 'identifier' : categorizeWord(t.value);
          if (category === 'identifier') {
            parts.push(this.formatIdentifierPartWithComments(t));
          } else {
            parts.push(this.kwTokenWithComments(t));
          }
        }
      } else {
        parts.push(this.tokenValueWithComments(t));
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
    let s = this.tokenValueWithComments(node.token);
    if (node.extraTokens) {
      for (let i = 0; i < node.extraTokens.length; i++) {
        const t = node.extraTokens[i];
        // Preserve dots without spaces (qualified names)
        if (t.type === TokenType.Dot) {
          s += '.';
        } else if (s.endsWith('.')) {
          // Token after a dot is an identifier part
          s += this.formatIdentifierPartWithComments(t);
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
          s += ' ' + this.formatIdentifierPartWithComments(t);
        } else {
          s += ' ' + this.tokenValueWithComments(t);
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
    if (this.config.dml.collapseShortStatements && !this.nodeHasComments(node)) {
      const saved = this.saveEmittedComments();
      const collapsed = this.collapseSelect(node);
      if (collapsed.length <= this.config.dml.collapseStatementsShorterThan) {
        return indent + collapsed;
      }
      this.restoreEmittedComments(saved);
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
    const trailingCommentTokens: (Token | undefined)[] = node.columns.map(c => {
      const token = this.getLastToken(c);
      return token?.trailingComment && this.emittedComments.has(token.trailingComment) ? token.trailingComment : undefined;
    });
    // Strip trailing comments emitted by *WithComments helpers so alignment system can place them
    const colsClean = cols.map((s, i) => {
      const tc = trailingCommentTokens[i];
      if (tc && s.endsWith(' ' + tc.value)) {
        return s.slice(0, -(tc.value.length + 1));
      }
      return s;
    });
    // Collect leading comments for each column (e.g. commented-out columns)
    const colComments = node.columns.map(c => this.formatLeadingComments(c));
    // Collect raw comma comment tokens (trailing comment on the comma before each item)
    const commaCommentTokens: (Token | undefined)[] = node.columns.map(c => {
      const token = this.getFirstToken(c);
      if (token?._commaComment && !this.emittedComments.has(token._commaComment)) {
        return token._commaComment;
      }
      return undefined;
    });

    this.indent = baseIndent;

    const leadingCommas = this.config.lists.commas.placeCommasBeforeItems;

    // Build per-column inline comment: for item i, the comment to show after
    // its comma comes from commaCommentTokens[i+1]; for the last item, use trailingCommentTokens
    // or the semicolon trailing comment (propagated from INSERT/parent statement)
    const semiTrailingComment = (node as any)._semicolonTrailingComment as Token | undefined;
    const inlineComments: (Token | undefined)[] = node.columns.map((_, i) => {
      if (i < node.columns.length - 1) return commaCommentTokens[i + 1];
      return trailingCommentTokens[i] || semiTrailingComment;
    });

    // Check if a semicolon will be appended to the last line
    const lastHasSemicolon = semiTrailingComment ? true : (node as any)._hasSemicolon ? true : false;
    // Whether we need to handle the semicolon ourselves (so it appears before any trailing comment)
    const lastComment = semiTrailingComment || trailingCommentTokens[node.columns.length - 1];
    const handleSemicolonInSelect = lastHasSemicolon && !!lastComment;

    // Compute comment alignment width
    let commentAlignWidth = 0;
    if (this.config.lists.alignComments) {
      for (let i = 0; i < colsClean.length; i++) {
        if (!inlineComments[i]) continue;
        const comma = (!leadingCommas && i < colsClean.length - 1) ? ',' : '';
        // For the last item, include semicolon in content width if applicable
        const semi = (i === colsClean.length - 1 && lastHasSemicolon) ? ';' : '';
        const contentLen = colsClean[i].length + comma.length + semi.length;
        if (contentLen > commentAlignWidth) commentAlignWidth = contentLen;
      }
    }

    // Helper: format a column line with aligned comment
    const colWithComment = (colStr: string, suffix: string, commentToken: Token | undefined): string => {
      let line = colStr + suffix;
      if (commentToken) {
        this.emittedComments.add(commentToken);
        if (this.config.lists.alignComments && commentAlignWidth > 0) {
          const contentLen = colStr.length + suffix.length;
          const pad = commentAlignWidth - contentLen;
          if (pad > 0) line += ' '.repeat(pad);
        }
        line += ' ' + commentToken.value;
      }
      return line;
    };

    // Helper: compute suffix for column i (comma and/or semicolon)
    const colSuffix = (i: number): string => {
      let s = '';
      if (!leadingCommas && i < colsClean.length - 1) s += ',';
      if (i === colsClean.length - 1 && handleSemicolonInSelect) s += this.semicolonStr();
      return s;
    };

    if (firstOnNewLine === 'always' || (firstOnNewLine === 'onlyIfSubsequentItems' && colsClean.length > 1)) {
      lines.push(selectLine);
      for (let i = 0; i < colsClean.length; i++) {
        if (colComments[i]) lines.push(colComments[i].replace(/\n$/, ''));
        if (leadingCommas && i > 0) {
          lines.push(clauseIndent.slice(0, -1) + ',' + colsClean[i]);
        } else {
          lines.push(clauseIndent + colWithComment(colsClean[i], colSuffix(i), inlineComments[i]));
        }
      }
    } else {
      // First item on same line as SELECT
      if (colsClean.length === 1) {
        if (colComments[0]) {
          // Comment between SELECT and single column — expand to separate lines
          lines.push(selectLine);
          lines.push(colComments[0].replace(/\n$/, ''));
          lines.push(clauseIndent + colWithComment(colsClean[0], colSuffix(0), inlineComments[0]));
        } else {
          lines.push(selectLine + ' ' + colWithComment(colsClean[0], colSuffix(0), inlineComments[0]));
        }
      } else {
        if (leadingCommas) {
          if (colComments[0]) {
            lines.push(selectLine);
            lines.push(colComments[0].replace(/\n$/, ''));
            lines.push(clauseIndent + ' ' + colsClean[0]);
          } else {
            lines.push(selectLine + ' ' + colsClean[0]);
          }
          for (let i = 1; i < colsClean.length; i++) {
            if (colComments[i]) lines.push(colComments[i].replace(/\n$/, ''));
            lines.push(clauseIndent.slice(0, -1) + ',' + colsClean[i]);
          }
        } else {
          if (colComments[0]) {
            lines.push(selectLine);
            lines.push(colComments[0].replace(/\n$/, ''));
            lines.push(clauseIndent + colWithComment(colsClean[0], ',', inlineComments[0]));
          } else {
            lines.push(selectLine + ' ' + colWithComment(colsClean[0], ',', inlineComments[0]));
          }
          for (let i = 1; i < colsClean.length; i++) {
            if (colComments[i]) lines.push(colComments[i].replace(/\n$/, ''));
            lines.push(clauseIndent + colWithComment(colsClean[i], colSuffix(i), inlineComments[i]));
          }
        }
      }
    }

    // INTO (SELECT ... INTO #temp)
    if (node.into) {
      lines.push(indent + this.kw('INTO') + ' ' + this.formatNode(node.into.target));
    }

    // FROM
    if (node.from) {
      const fromComments = this.formatTokenLeadingComments(node.from.token, baseIndent);
      if (fromComments) lines.push(fromComments.trimEnd());
      lines.push(indent + this.kw('FROM'));
      const source = node.from.source;

      // Compute table alias alignment width across FROM source and JOINs
      let tableAlignWidth: number | undefined;
      if (this.config.lists.alignAliases && node.from.joins.length > 0) {
        let maxWidth = 0;
        // FROM source (no prefix)
        if (source.type === 'identifier' && (source as IdentifierNode).alias) {
          maxWidth = this.getTableNameLength(source);
        }
        // JOINs
        for (const join of node.from.joins) {
          if (join.table.type === 'identifier' && (join.table as IdentifierNode).alias) {
            const joinKw = join.joinKeywords.map(t => this.kw(t.value)).join(' ');
            const prefixLen = joinKw.length + 1; // +1 for space before table name
            const w = prefixLen + this.getTableNameLength(join.table);
            maxWidth = Math.max(maxWidth, w);
          }
        }
        if (maxWidth > 0) tableAlignWidth = maxWidth;
      }

      if (source.type === 'parenGroup' && source.inner.length === 1 && source.inner[0].type === 'select') {
        lines.push(clauseIndent + this.formatParenGroup(source, baseIndent + 1));
      } else if (tableAlignWidth !== undefined && source.type === 'identifier') {
        lines.push(clauseIndent + this.formatIdentifier(source as IdentifierNode, tableAlignWidth));
      } else {
        lines.push(clauseIndent + this.formatNode(source));
      }
      for (const join of node.from.joins) {
        lines.push(this.formatJoin(join, baseIndent, tableAlignWidth));
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

    // UNION [ALL] / EXCEPT / INTERSECT
    if (node.union) {
      const unionComments = this.formatTokenLeadingComments(node.union.token, baseIndent);
      if (unionComments) lines.push(unionComments.trimEnd());
      const kw = node.union.all
        ? this.kw(node.union.token.value) + ' ' + this.kw('ALL')
        : this.kw(node.union.token.value);
      lines.push(indent + kw);
      const selectComments = this.formatTokenLeadingComments(node.union.select.selectToken, baseIndent);
      if (selectComments) lines.push(selectComments.trimEnd());
      lines.push(this.formatSelect(node.union.select));
    }

    // If we handled the semicolon ourselves (for comment alignment), mark it so
    // formatStatement/withSemicolon doesn't duplicate it
    if (handleSemicolonInSelect) {
      (node as any)._semicolonHandled = true;
    }

    return lines.join('\n');
  }

  /** Check if a token has any comments (leading or trailing). */
  private tokenHasComments(token: Token | undefined): boolean {
    if (!token) return false;
    return !!(token.leadingComments?.length || token.trailingComment || token.trailingComments?.length || token._commaComment);
  }

  /**
   * Recursively check if any token in an AST node subtree has comments.
   * Used to prevent collapsing nodes that contain comments, which would
   * either lose them or misplace them (especially line comments).
   */
  private nodeHasComments(node: SqlNode): boolean {
    switch (node.type) {
      case 'select': {
        // Leading comments on selectToken are handled by formatStatement/formatLeadingComments,
        // so only check trailing comment here (leading comments don't prevent collapsing)
        if (node.selectToken.trailingComment) return true;
        if (node.distinct && this.tokenHasComments(node.distinct)) return true;
        if (node.top && (this.tokenHasComments(node.top.token) || this.nodeHasComments(node.top.value))) return true;
        for (const col of node.columns) {
          if (this.nodeHasComments(col)) return true;
          const exprNode = (col as any)._expression;
          if (exprNode?._parenLeadingComments?.length) return true;
        }
        if (node.into && (this.tokenHasComments(node.into.token) || this.nodeHasComments(node.into.target))) return true;
        if (node.from) {
          if (this.tokenHasComments(node.from.token)) return true;
          if (this.nodeHasComments(node.from.source)) return true;
          for (const j of node.from.joins) {
            if (this.nodeHasComments(j)) return true;
          }
        }
        if (node.where && (this.tokenHasComments(node.where.token) || this.nodeHasComments(node.where.condition))) return true;
        if (node.groupBy) {
          for (const t of node.groupBy.tokens) if (this.tokenHasComments(t)) return true;
          for (const item of node.groupBy.items) if (this.nodeHasComments(item)) return true;
        }
        if (node.having && (this.tokenHasComments(node.having.token) || this.nodeHasComments(node.having.condition))) return true;
        if (node.orderBy) {
          for (const t of node.orderBy.tokens) if (this.tokenHasComments(t)) return true;
          for (const item of node.orderBy.items) {
            if (this.nodeHasComments(item.expr)) return true;
            if (item.direction && this.tokenHasComments(item.direction)) return true;
          }
          if (node.orderBy.offset) {
            if (this.tokenHasComments(node.orderBy.offset.keyword)) return true;
            if (this.nodeHasComments(node.orderBy.offset.value)) return true;
            if (this.tokenHasComments(node.orderBy.offset.rowsToken)) return true;
          }
          if (node.orderBy.fetch) {
            if (this.tokenHasComments(node.orderBy.fetch.fetchToken)) return true;
            if (this.tokenHasComments(node.orderBy.fetch.nextToken)) return true;
            if (this.nodeHasComments(node.orderBy.fetch.value)) return true;
            if (this.tokenHasComments(node.orderBy.fetch.rowsToken)) return true;
          }
        }
        if (node.union) {
          if (this.tokenHasComments(node.union.token)) return true;
          if (node.union.all && this.tokenHasComments(node.union.all)) return true;
          if (this.nodeHasComments(node.union.select)) return true;
        }
        return false;
      }
      case 'insert': {
        if (node.insertToken.trailingComment) return true;
        if (node.intoToken && this.tokenHasComments(node.intoToken)) return true;
        if (this.nodeHasComments(node.target)) return true;
        if (node.columns) {
          for (const col of node.columns) if (this.nodeHasComments(col)) return true;
        }
        if (node.values) {
          if (this.tokenHasComments(node.values.token)) return true;
          for (const row of node.values.rows) {
            if (this.tokenHasComments(row.openParen)) return true;
            for (const v of row.values) if (this.nodeHasComments(v)) return true;
          }
        }
        if (node.select && this.nodeHasComments(node.select)) return true;
        if (node.exec && this.nodeHasComments(node.exec)) return true;
        return false;
      }
      case 'update': {
        if (node.updateToken.trailingComment) return true;
        if (this.nodeHasComments(node.target)) return true;
        if (this.tokenHasComments(node.setToken)) return true;
        for (const a of node.assignments) {
          if (this.nodeHasComments(a.column)) return true;
          if (this.nodeHasComments(a.value)) return true;
        }
        if (node.from) {
          if (this.tokenHasComments(node.from.token)) return true;
          if (this.nodeHasComments(node.from.source)) return true;
          for (const j of node.from.joins) if (this.nodeHasComments(j)) return true;
        }
        if (node.where && (this.tokenHasComments(node.where.token) || this.nodeHasComments(node.where.condition))) return true;
        return false;
      }
      case 'delete': {
        if (node.deleteToken.trailingComment) return true;
        if (node.fromToken && this.tokenHasComments(node.fromToken)) return true;
        if (this.nodeHasComments(node.target)) return true;
        if (node.where && (this.tokenHasComments(node.where.token) || this.nodeHasComments(node.where.condition))) return true;
        return false;
      }
      case 'join': {
        for (const t of node.joinKeywords) if (this.tokenHasComments(t)) return true;
        if (this.nodeHasComments(node.table)) return true;
        if (node.on) {
          if (this.tokenHasComments(node.on.token)) return true;
          if (this.nodeHasComments(node.on.condition)) return true;
        }
        return false;
      }
      case 'case': {
        if (this.tokenHasComments(node.caseToken)) return true;
        if (node.inputExpr && this.nodeHasComments(node.inputExpr)) return true;
        for (const w of node.whenClauses) {
          if (this.tokenHasComments(w.whenToken)) return true;
          if (this.nodeHasComments(w.condition)) return true;
          if (this.tokenHasComments(w.thenToken)) return true;
          if (this.nodeHasComments(w.result)) return true;
        }
        if (node.elseClause) {
          if (this.tokenHasComments(node.elseClause.elseToken)) return true;
          if (this.nodeHasComments(node.elseClause.result)) return true;
        }
        if (this.tokenHasComments(node.endToken)) return true;
        return false;
      }
      case 'ifElse': {
        if (node.ifToken.trailingComment) return true;
        if (this.nodeHasComments(node.condition)) return true;
        if (this.nodeHasComments(node.thenStatement)) return true;
        if (node.elseClause) {
          if (this.tokenHasComments(node.elseClause.elseToken)) return true;
          if (this.nodeHasComments(node.elseClause.statement)) return true;
        }
        return false;
      }
      case 'expression': {
        if (this.nodeHasComments(node.left)) return true;
        if (this.tokenHasComments(node.operator)) return true;
        if (this.nodeHasComments(node.right)) return true;
        return false;
      }
      case 'functionCall': {
        if (this.nodeHasComments(node.name)) return true;
        for (const arg of node.args) if (this.nodeHasComments(arg)) return true;
        if (node.closeComments?.length) return true;
        return false;
      }
      case 'identifier': {
        for (const p of node.parts) if (this.tokenHasComments(p)) return true;
        if ((node as any)._expression && this.nodeHasComments((node as any)._expression)) return true;
        if ((node as any)._parenLeadingComments?.length) return true;
        if (node.alias) {
          if (node.alias.asToken && this.tokenHasComments(node.alias.asToken)) return true;
          if (this.tokenHasComments(node.alias.name)) return true;
        }
        return false;
      }
      case 'literal': return this.tokenHasComments(node.token);
      case 'rawToken': {
        if (this.tokenHasComments(node.token)) return true;
        if (node.extraTokens) {
          for (const t of node.extraTokens) if (this.tokenHasComments(t)) return true;
        }
        return false;
      }
      case 'inExpression': {
        if (this.nodeHasComments(node.expression)) return true;
        if (node.notToken && this.tokenHasComments(node.notToken)) return true;
        if (this.tokenHasComments(node.inToken)) return true;
        for (const v of node.values) if (this.nodeHasComments(v)) return true;
        return false;
      }
      case 'between': {
        if (this.nodeHasComments(node.expression)) return true;
        if (node.notToken && this.tokenHasComments(node.notToken)) return true;
        if (this.tokenHasComments(node.betweenToken)) return true;
        if (this.nodeHasComments(node.low)) return true;
        if (this.tokenHasComments(node.andToken)) return true;
        if (this.nodeHasComments(node.high)) return true;
        return false;
      }
      case 'exists': {
        if (node.notToken && this.tokenHasComments(node.notToken)) return true;
        if (this.tokenHasComments(node.existsToken)) return true;
        if (this.nodeHasComments(node.subquery)) return true;
        return false;
      }
      case 'parenGroup': {
        if (node.openParenComments?.length) return true;
        for (const inner of node.inner) if (this.nodeHasComments(inner)) return true;
        if (node.closeComments?.length) return true;
        if (node.alias) {
          if (node.alias.asToken && this.tokenHasComments(node.alias.asToken)) return true;
          if (this.tokenHasComments(node.alias.name)) return true;
        }
        return false;
      }
      case 'createTable': {
        for (const t of node.keywords) if (this.tokenHasComments(t)) return true;
        if (this.nodeHasComments(node.name)) return true;
        for (const col of node.columns) if (this.nodeHasComments(col)) return true;
        if (this.tokenHasComments(node.closeParen)) return true;
        if (node.onFilegroup) {
          for (const t of node.onFilegroup) if (this.tokenHasComments(t)) return true;
        }
        return false;
      }
      case 'columnDef': {
        if (this.tokenHasComments(node.name)) return true;
        if (this.nodeHasComments(node.dataType)) return true;
        for (const c of node.constraints) if (this.nodeHasComments(c)) return true;
        return false;
      }
      case 'constraint': {
        for (const t of node.tokens) if (this.tokenHasComments(t)) return true;
        if (node.columns) {
          for (const col of node.columns) if (this.nodeHasComments(col)) return true;
        }
        return false;
      }
      case 'set': {
        if (this.tokenHasComments(node.token)) return true;
        if (this.nodeHasComments(node.target)) return true;
        if (this.nodeHasComments(node.value)) return true;
        return false;
      }
      case 'declare': {
        if (this.tokenHasComments(node.token)) return true;
        for (const v of node.variables) {
          if (this.tokenHasComments(v.name)) return true;
          if (v.asToken && this.tokenHasComments(v.asToken)) return true;
          if (this.nodeHasComments(v.dataType)) return true;
          if (v.default && this.nodeHasComments(v.default)) return true;
        }
        return false;
      }
      case 'beginEnd': {
        if (this.tokenHasComments(node.beginToken)) return true;
        for (const s of node.statements) if (this.nodeHasComments(s)) return true;
        if (this.tokenHasComments(node.endToken)) return true;
        return false;
      }
      case 'print':
        return this.tokenHasComments(node.token) || this.nodeHasComments(node.expression);
      case 'return':
        return this.tokenHasComments(node.token) || !!(node.expression && this.nodeHasComments(node.expression));
      default:
        return false;
    }
  }

  private collapseSelect(node: SelectNode): string {
    let s = this.kw('SELECT');
    if (node.distinct) s += ' ' + this.kw('DISTINCT');
    if (node.top) s += ' ' + this.kw('TOP') + ' (' + this.formatNode(node.top.value) + ')';
    s += ' ' + node.columns.map(c => this.formatSelectItem(c)).join(', ');
    if (node.into) {
      s += ' ' + this.kw('INTO') + ' ' + this.formatNode(node.into.target);
    }
    if (node.from) {
      s += ' ' + this.kw('FROM') + ' ' + this.formatNode(node.from.source);
      for (const j of node.from.joins) {
        s += ' ' + this.collapseJoin(j);
      }
    }
    if (node.where) s += ' ' + this.kwToken(node.where.token) + ' ' + this.formatNode(node.where.condition);
    if (node.groupBy) s += ' ' + this.kw('GROUP') + ' ' + this.kw('BY') + ' ' + node.groupBy.items.map(i => this.formatNode(i)).join(', ');
    if (node.having) s += ' ' + this.kw('HAVING') + ' ' + this.formatNode(node.having.condition);
    if (node.orderBy) {
      s += ' ' + this.kw('ORDER') + ' ' + this.kw('BY') + ' ' + node.orderBy.items.map(i => this.formatNode(i.expr) + (i.direction ? ' ' + this.kw(i.direction.value) : '')).join(', ');
      if (node.orderBy.offset) {
        s += ' ' + this.kw('OFFSET') + ' ' + this.formatNode(node.orderBy.offset.value) + ' ' + this.kw(node.orderBy.offset.rowsToken.value);
      }
      if (node.orderBy.fetch) {
        s += ' ' + this.kw('FETCH') + ' ' + this.kw(node.orderBy.fetch.nextToken.value) + ' ' + this.formatNode(node.orderBy.fetch.value) + ' ' + this.kw(node.orderBy.fetch.rowsToken.value) + ' ' + this.kw('ONLY');
      }
    }
    if (node.union) {
      const kw = node.union.all
        ? this.kw(node.union.token.value) + ' ' + this.kw('ALL')
        : this.kw(node.union.token.value);
      s += ' ' + kw + ' ' + this.collapseSelect(node.union.select);
    }
    return s;
  }

  /** Get the length of the last line of a possibly multi-line string. */
  private lastLineLength(s: string): number {
    const nlIdx = s.lastIndexOf('\n');
    return nlIdx === -1 ? s.length : s.length - nlIdx - 1;
  }

  /** Get the length of the longest line in a possibly multi-line string. */
  private maxLineLength(s: string): number {
    if (!s.includes('\n')) return s.length;
    return Math.max(...s.split('\n').map(l => l.length));
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
      s += ' ' + this.kw('AS') + ' ' + this.formatIdentifierPartWithComments(alias.name);
    } else {
      s += ' ' + this.formatIdentifierPartWithComments(alias.name);
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
      let s = idNode.parts.map(p => this.formatIdentifierPartWithComments(p)).join('.');
      if (alignWidth > s.length) {
        s = s + ' '.repeat(alignWidth - s.length);
      }
      if (idNode.alias!.asToken) {
        s += ' ' + this.kw('AS') + ' ' + this.formatIdentifierPartWithComments(idNode.alias!.name);
      } else {
        s += ' ' + this.formatIdentifierPartWithComments(idNode.alias!.name);
      }
      return s;
    }
    // Bare expression columns (e.g. @var = expr): apply wrapping
    if (wrap && node.type === 'expression') {
      return this.wrapExpression(node, this.indent);
    }
    return this.formatNode(node);
  }

  // --- FROM / JOIN ---

  private formatJoin(node: JoinNode, baseIndent?: number, tableAlignWidth?: number): string {
    const bi = baseIndent ?? this.indent;
    const clauseIndent = this.indentStr(bi + 1);
    const joinKw = node.joinKeywords.map(t => this.kw(t.value)).join(' ');
    const tableNode = node.table;
    // Emit leading comments on the first join keyword (e.g. /* comment */ before CROSS APPLY)
    const joinComments = this.formatTokenLeadingComments(node.joinKeywords[0], bi + 1);
    let line: string;
    if (joinComments) {
      line = joinComments.trimEnd() + '\n';
    } else {
      line = '';
    }
    if (tableNode.type === 'parenGroup' && tableNode.inner.length === 1 && tableNode.inner[0].type === 'select') {
      const formatted = this.formatParenGroup(tableNode, bi + 1);
      if (formatted.includes('\n')) {
        // Multi-line subquery: put on next line
        line += clauseIndent + joinKw + '\n' + clauseIndent + formatted;
      } else {
        // Collapsed subquery: keep on same line
        line += clauseIndent + joinKw + ' ' + formatted;
      }
    } else if (tableAlignWidth !== undefined && tableNode.type === 'identifier') {
      const localAlignWidth = tableAlignWidth - (joinKw.length + 1);
      line += clauseIndent + joinKw + ' ' + this.formatIdentifier(tableNode as IdentifierNode, localAlignWidth > 0 ? localAlignWidth : undefined);
    } else {
      line += clauseIndent + joinKw + ' ' + this.formatNode(tableNode);
    }
    if (node.on) {
      const onIndent = this.indentStr(bi + 2);
      const onPrefix = this.kw('ON') + ' ';
      const savedIndent = this.indent;
      this.indent = bi + 2;
      // If the condition contains comments, skip the speculative inline build:
      // formatNode would emit (and mark as emitted) those comments, so a
      // subsequent re-format on the wrap path would silently drop them.
      const hasComments = this.nodeHasComments(node.on.condition);
      const condStr = hasComments ? '' : this.formatNode(node.on.condition);
      this.indent = savedIndent;
      const onLine = onIndent + onPrefix + condStr;

      if (this.config.whitespace.wrapLongLines && (hasComments || onLine.length > this.config.whitespace.wrapLinesLongerThan)) {
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
    const savedIndent = this.indent;
    this.indent = bi + 1;
    const comments = this.formatLeadingComments(node.condition);
    this.indent = savedIndent;
    const condStr = this.formatCondition(node.condition, bi + 1);
    return indent + this.kwTokenWithComments(node.token) + '\n' + (comments || '') + clauseIndent + condStr;
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
    const prevIndent = this.indent;
    this.indent = indentLevel;
    const result = this.formatNode(node);
    this.indent = prevIndent;
    return result;
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
          const op = this.tokenValueWithComments(expr.operator);
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
      const prevIndent = this.indent;
      this.indent = indentLevel;
      let formatted = this.formatNode(innerNode);
      this.indent = prevIndent;
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
    const lines: string[] = [indent + this.kw('GROUP') + ' ' + this.kw('BY')];
    const savedIndent = this.indent;
    this.indent = bi + 1;
    for (let i = 0; i < node.items.length; i++) {
      const comments = this.formatLeadingComments(node.items[i]);
      if (comments) lines.push(comments.replace(/\n$/, ''));
      const commaComment = i < node.items.length - 1 ? this.getCommaComment(node.items[i + 1]) : '';
      const comma = i < node.items.length - 1 ? ',' + commaComment : '';
      lines.push(clauseIndent + this.formatNode(node.items[i]) + comma);
    }
    this.indent = savedIndent;
    return lines.join('\n');
  }

  // --- ORDER BY ---

  formatOrderBy(node: OrderByNode, baseIndent?: number, inline?: boolean): string {
    if (inline) {
      const items = node.items.map(i => {
        let s = this.formatNode(i.expr);
        if (i.direction) s += ' ' + this.kw(i.direction.value);
        return s;
      });
      let s = this.kw('ORDER') + ' ' + this.kw('BY') + ' ' + items.join(', ');
      if (node.offset) {
        s += ' ' + this.kw('OFFSET') + ' ' + this.formatNode(node.offset.value) + ' ' + this.kw(node.offset.rowsToken.value);
      }
      if (node.fetch) {
        s += ' ' + this.kw('FETCH') + ' ' + this.kw(node.fetch.nextToken.value) + ' ' + this.formatNode(node.fetch.value) + ' ' + this.kw(node.fetch.rowsToken.value) + ' ' + this.kw('ONLY');
      }
      return s;
    }
    const bi = baseIndent ?? this.indent;
    const indent = this.indentStr(bi);
    const clauseIndent = this.indentStr(bi + 1);
    const lines: string[] = [indent + this.kw('ORDER') + ' ' + this.kw('BY')];
    const savedIndent = this.indent;
    this.indent = bi + 1;
    for (let i = 0; i < node.items.length; i++) {
      const comments = this.formatLeadingComments(node.items[i].expr);
      if (comments) lines.push(comments.replace(/\n$/, ''));
      let item = this.formatNode(node.items[i].expr);
      if (node.items[i].direction) item += ' ' + this.kw(node.items[i].direction!.value);
      const commaComment = i < node.items.length - 1 ? this.getCommaComment(node.items[i + 1].expr) : '';
      const comma = i < node.items.length - 1 ? ',' + commaComment : '';
      lines.push(clauseIndent + item + comma);
    }
    this.indent = savedIndent;
    if (node.offset) {
      const offsetComments = this.formatLeadingComments(node.offset.value);
      if (offsetComments) lines.push(offsetComments.replace(/\n$/, ''));
      lines.push(indent + this.kw('OFFSET') + ' ' + this.formatNode(node.offset.value) + ' ' + this.kw(node.offset.rowsToken.value));
    }
    if (node.fetch) {
      const fetchComments = this.formatLeadingComments(node.fetch.value);
      if (fetchComments) lines.push(fetchComments.replace(/\n$/, ''));
      lines.push(indent + this.kw('FETCH') + ' ' + this.kw(node.fetch.nextToken.value) + ' ' + this.formatNode(node.fetch.value) + ' ' + this.kw(node.fetch.rowsToken.value) + ' ' + this.kw('ONLY'));
    }
    return lines.join('\n');
  }

  // --- HAVING ---

  formatHaving(node: HavingNode, baseIndent?: number): string {
    const bi = baseIndent ?? this.indent;
    const indent = this.indentStr(bi);
    const clauseIndent = this.indentStr(bi + 1);
    const savedIndent = this.indent;
    this.indent = bi + 1;
    const comments = this.formatLeadingComments(node.condition);
    this.indent = savedIndent;
    return indent + this.kw('HAVING') + '\n' + (comments || '') + clauseIndent + this.formatNode(node.condition);
  }

  // --- INSERT ---

  private formatInsert(node: InsertNode): string {
    const indent = this.indentStr();
    const clauseIndent = this.indentStr(this.indent + 1);

    // Try collapse (skip if any node has comments)
    if (this.config.dml.collapseShortStatements && !this.nodeHasComments(node)) {
      const saved = this.saveEmittedComments();
      const collapsed = this.collapseInsert(node);
      if (collapsed !== null && collapsed.length <= this.config.dml.collapseStatementsShorterThan) {
        return indent + collapsed;
      }
      this.restoreEmittedComments(saved);
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
        const firstToken = this.getFirstToken(c)!;
        const comments = this.formatTokenLeadingComments(firstToken, this.indent + 1);
        const commaComment = i < node.columns.length - 1 && node.columns[i + 1]
          ? this.getCommaComment(node.columns[i + 1])
          : '';
        const comma = i < node.columns.length - 1 ? ',' + commaComment : '';
        colLines.push(comments + clauseIndent + this.formatNode(c) + comma);
      }
      lines.push(colLines.join('\n'));
      lines.push(indent + ')');
    }

    if (node.values) {
      lines.push(indent + this.kw('VALUES'));
      for (let ri = 0; ri < node.values.rows.length; ri++) {
        const rowEntry = node.values.rows[ri];
        const row = rowEntry.values;
        const rowComma = ri < node.values.rows.length - 1 ? ',' : '';

        // Emit leading comments on the row's opening paren (e.g. a commented-out row)
        const rowComments = this.formatTokenLeadingComments(rowEntry.openParen, this.indent);
        if (rowComments) lines.push(rowComments.trimEnd());

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
          lines.push(indent + ')' + rowComma);
        } else {
          lines.push(indent + '(' + row.map(v => this.formatNode(v)).join(', ') + ')' + rowComma);
        }
      }
    }

    if (node.select) {
      // Pass semicolon trailing comment to the SELECT so it can be included in comment alignment
      if ((node as any)._semicolonTrailingComment) {
        (node.select as any)._semicolonTrailingComment = (node as any)._semicolonTrailingComment;
        (node as any)._semicolonTrailingComment = undefined;
      }
      // Pass _hasSemicolon so SELECT knows a semicolon will follow the last column
      if ((node as any)._hasSemicolon) {
        (node.select as any)._hasSemicolon = true;
      }
      lines.push(this.formatSelect(node.select));
      // If the SELECT handled the semicolon (for alignment), mark INSERT as handled too
      if ((node.select as any)._semicolonHandled) {
        (node as any)._hasSemicolon = false;
        (node as any)._semicolonHandled = true;
      }
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
      const rowEntry = node.values.rows[0];
      // Skip collapse if row has leading comments or any value has trailing comments
      if (rowEntry.openParen.leadingComments?.length) return null;
      if (rowEntry.values.some(v => (v as any)._trailingComment)) return null;
      s += ' ' + this.kw('VALUES') + ' (' + rowEntry.values.map(v => this.formatNode(v)).join(', ') + ')';
    }
    if (node.select) {
      if (this.nodeHasComments(node.select)) return null;
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

    // Try collapse (skip if any node has comments)
    if (this.config.dml.collapseShortStatements && !this.nodeHasComments(node)) {
      const saved = this.saveEmittedComments();
      const collapsed = this.collapseUpdate(node);
      if (collapsed.length <= this.config.dml.collapseStatementsShorterThan) {
        return indent + collapsed;
      }
      this.restoreEmittedComments(saved);
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
    const cfg = this.config.cte;
    const nameIndent = cfg.indentName ? this.indentStr(this.indent + 1) : indent;
    const lines: string[] = [];

    for (let i = 0; i < node.ctes.length; i++) {
      const cte = node.ctes[i];

      // CTE name (with optional column list and AS)
      let namePart = this.tokenValueWithComments(cte.name);
      if (cte.columns) {
        const colList = '(' + cte.columns.map(c => this.tokenValueWithComments(c)).join(', ') + ')';
        if (cfg.placeColumnsOnNewLine) {
          namePart += '\n' + nameIndent + colList;
        } else {
          namePart += ' ' + colList;
        }
      }

      // AS keyword
      if (cfg.placeAsOnNewLine) {
        namePart += '\n' + indent + this.kw('AS');
      } else {
        namePart += ' ' + this.kw('AS');
      }

      // WITH/comma prefix + name placement
      if (i === 0) {
        if (cfg.placeNameOnNewLine) {
          lines.push(indent + this.kw('WITH'));
          lines.push(nameIndent + namePart);
        } else {
          lines.push(indent + this.kw('WITH') + ' ' + namePart);
        }
      } else {
        if (cfg.placeNameOnNewLine) {
          lines.push(nameIndent + namePart);
        } else {
          lines.push(indent + namePart);
        }
      }

      // CTE body parentheses
      lines.push(indent + '(');
      if (cfg.indentContents) {
        this.indent++;
        lines.push(this.formatNode(cte.query));
        this.indent--;
      } else {
        lines.push(this.formatNode(cte.query));
      }
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
    const beginStr = node.modifier
      ? indent + this.kw('BEGIN') + ' ' + this.kw(node.modifier.value)
      : indent + this.kw('BEGIN');
    lines.push(beginStr);

    this.indent++;
    for (const stmt of node.statements) {
      const formatted = this.formatStatement(stmt);
      if (preserve && lines.length > 1 && this.hasPrecedingBlankLine(stmt)) {
        lines.push('');
      }
      lines.push(formatted);
    }
    this.indent--;

    const endComments = this.formatTokenLeadingComments(node.endToken, this.indent + 1);
    if (endComments) {
      if (preserve && node.endToken.precedingBlankLine) {
        lines.push('');
      }
      lines.push(endComments.replace(/\n$/, ''));
    }
    const endStr = node.endModifier
      ? indent + this.kw('END') + ' ' + this.kw(node.endModifier.value)
      : indent + this.kw('END');
    lines.push(endStr);
    return lines.join('\n');
  }

  private formatTryCatch(node: TryCatchNode): string {
    const tryFormatted = this.formatBeginEnd(node.tryBlock);
    const catchFormatted = this.formatBeginEnd(node.catchBlock);
    return tryFormatted + '\n' + catchFormatted;
  }

  // --- IF/ELSE ---

  private formatIfElse(node: IfElseNode): string {
    const indent = this.indentStr();
    const lines: string[] = [];
    const kwName = node.ifToken.value.toUpperCase() === 'WHILE' ? 'WHILE' : 'IF';

    // Try collapse (skip if any node has comments)
    if (this.config.controlFlow.collapseShortStatements && !this.nodeHasComments(node)) {
      const saved = this.saveEmittedComments();
      const collapsed = this.collapseIfElse(node, kwName);
      if (collapsed.length <= this.config.controlFlow.collapseStatementsShorterThan) {
        return indent + collapsed;
      }
      this.restoreEmittedComments(saved);
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
          const saved = this.saveEmittedComments();
          colNameWidth = Math.max(...v.tableColumns.map(c => {
            if (c.type === 'columnDef') {
              return this.formatIdentifierPart((c as ColumnDefNode).name).length;
            }
            return 0;
          }));
          this.restoreEmittedComments(saved);
        }
        const colData = v.tableColumns.map(c => {
          const token = c.type === 'columnDef' ? (c as ColumnDefNode).name : (c as ConstraintNode).tokens[0];
          const comments = this.formatTokenLeadingComments(token, this.indent + 1);
          const commaComment = this.getTokenCommaComment(token);
          const line = c.type === 'constraint'
            ? colIndent + this.formatConstraint(c as ConstraintNode)
            : colIndent + this.formatColumnDef(c as ColumnDefNode, colNameWidth);
          return { str: comments ? comments.trimEnd() + '\n' + line : line, commaComment };
        });
        const colLines: string[] = [];
        for (let i = 0; i < colData.length; i++) {
          const suffix = i < colData.length - 1
            ? ',' + (colData[i + 1].commaComment || '')
            : '';
          colLines.push(colData[i].str + suffix);
        }
        let closeCommentStr = '';
        if (v.tableCloseParen) {
          const closeComments = this.formatTokenLeadingComments(v.tableCloseParen, this.indent + 1);
          if (closeComments) {
            closeCommentStr = '\n' + closeComments.trimEnd();
          }
        }
        return name + ' ' + asPrefix + this.kw('TABLE') + '\n' +
          baseIndent + '(\n' +
          colLines.join('\n') + closeCommentStr + '\n' +
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
    const prefix = indent + this.kw('SET') + ' ' + this.formatNode(node.target) + ' = ';
    const value = node.value.type === 'expression'
      ? this.wrapExpression(node.value, this.indent)
      : this.formatNode(node.value);
    return prefix + value;
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

  // --- USE ---

  private formatUse(node: UseNode): string {
    const indent = this.indentStr();
    return indent + this.kw('USE') + ' ' + this.formatNode(node.database);
  }

  // --- THROW ---

  private formatThrow(node: ThrowNode): string {
    const indent = this.indentStr();
    if (!node.errorNumber) {
      return indent + this.kw('THROW');
    }
    let result = indent + this.kw('THROW') + ' ' + this.formatNode(node.errorNumber);
    if (node.message) {
      result += ', ' + this.formatNode(node.message);
    }
    if (node.state) {
      result += ', ' + this.formatNode(node.state);
    }
    return result;
  }

  // --- RAISERROR ---

  private formatRaiserror(node: RaiserrorNode): string {
    const indent = this.indentStr();
    const args = node.args.map(a => this.formatNode(a)).join(', ');
    let result = indent + this.kw('RAISERROR') + ' (' + args + ')';
    if (node.withOptions && node.withOptions.length > 0) {
      const parts: string[] = [];
      for (const t of node.withOptions) {
        if (t.type === TokenType.Comma) {
          parts[parts.length - 1] += ',';
        } else {
          parts.push(this.kw(t.value));
        }
      }
      result += ' ' + parts.join(' ');
    }
    return result;
  }

  // --- CURSOR statements ---

  private formatDeclareCursor(node: DeclareCursorNode): string {
    const indent = this.indentStr();
    let result = indent + this.kw('DECLARE') + ' ' + node.name.value;

    // Cursor options: INSENSITIVE, SCROLL, CURSOR, LOCAL, GLOBAL, etc.
    for (const opt of node.cursorOptions) {
      result += ' ' + this.kw(opt.value);
    }

    result += '\n' + indent + this.kw('FOR') + '\n';

    // Format the SELECT indented one level
    this.indent++;
    result += this.formatNode(node.select);
    this.indent--;

    if (node.forUpdate) {
      result += '\n' + indent + this.kw('FOR') + ' ' + this.kw(node.forUpdate.actionToken.value);
      if (node.forUpdate.ofColumns && node.forUpdate.ofColumns.length > 0) {
        result += ' ' + this.kw('OF') + ' ' + node.forUpdate.ofColumns.map(c => c.value).join(', ');
      }
    }

    return result;
  }

  private formatSetCursor(node: SetCursorNode): string {
    const indent = this.indentStr();
    let result = indent + this.kw('SET') + ' ' + this.formatNode(node.target) + ' = ';

    // CURSOR [options]
    result += node.cursorOptions.map(opt => this.kw(opt.value)).join(' ');

    result += '\n' + indent + this.kw('FOR') + '\n';

    // Format the SELECT indented one level
    this.indent++;
    result += this.formatNode(node.select);
    this.indent--;

    if (node.forUpdate) {
      result += '\n' + indent + this.kw('FOR') + ' ' + this.kw(node.forUpdate.actionToken.value);
      if (node.forUpdate.ofColumns && node.forUpdate.ofColumns.length > 0) {
        result += ' ' + this.kw('OF') + ' ' + node.forUpdate.ofColumns.map(c => c.value).join(', ');
      }
    }

    return result;
  }

  private formatCursorRef(global: Token | undefined, name: SqlNode): string {
    let result = '';
    if (global) result += this.kw('GLOBAL') + ' ';
    result += this.formatNode(name);
    return result;
  }

  private formatOpenCursor(node: OpenCursorNode): string {
    const indent = this.indentStr();
    return indent + this.kw('OPEN') + ' ' + this.formatCursorRef(node.global, node.name);
  }

  private formatCloseCursor(node: CloseCursorNode): string {
    const indent = this.indentStr();
    return indent + this.kw('CLOSE') + ' ' + this.formatCursorRef(node.global, node.name);
  }

  private formatDeallocateCursor(node: DeallocateCursorNode): string {
    const indent = this.indentStr();
    return indent + this.kw('DEALLOCATE') + ' ' + this.formatCursorRef(node.global, node.name);
  }

  private formatFetchCursor(node: FetchCursorNode): string {
    const indent = this.indentStr();
    let result = indent + this.kw('FETCH');

    if (node.orientation) {
      result += ' ' + this.kw(node.orientation.value);
      if (node.orientationValue) {
        result += ' ' + this.formatNode(node.orientationValue);
      }
    }

    if (node.fromToken) {
      result += ' ' + this.kw('FROM');
    }

    result += ' ' + this.formatCursorRef(node.global, node.name);

    if (node.into) {
      result += ' ' + this.kw('INTO') + ' ' + node.into.variables.map(v => this.formatNode(v)).join(', ');
    }

    return result;
  }

  // --- CASE ---

  private isAndOrExpression(node: SqlNode): boolean {
    if (node.type !== 'expression') return false;
    const op = (node as ExpressionNode).operator.value.toUpperCase();
    return op === 'AND' || op === 'OR';
  }

  private formatCase(node: CaseNode): string {
    // Try collapse (skip if any node has comments)
    if (this.config.caseExpressions.collapseShortCaseExpressions && !this.nodeHasComments(node)) {
      const saved = this.saveEmittedComments();
      const collapsed = this.collapseCase(node);
      const indentWidth = this.indent * this.tabStr.length;
      if (collapsed.length + indentWidth <= this.config.caseExpressions.collapseCaseExpressionsShorterThan) {
        return collapsed;
      }
      this.restoreEmittedComments(saved);
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

      // Wrap long WHEN conditions with AND/OR onto multiple lines
      if (wrapEnabled && whenLine.length > maxLineLen && this.isAndOrExpression(wc.condition)) {
        const condIndentLevel = this.indent + 2;
        const whenPrefix = this.kw('WHEN') + ' ';
        const condFormatted = this.config.operators.comparison.align
          ? this.formatConditionAligned(wc.condition, condIndentLevel, whenPrefix.length)
          : this.formatCondition(wc.condition, condIndentLevel);
        whenLine = whenIndent + whenPrefix + condFormatted;
      }

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
    // Use last line length for multi-line results (e.g. expanded function calls)
    const effectiveLength = inline.includes('\n')
      ? this.lastLineLength(inline)
      : inline.length + indentWidth;
    if (!this.config.whitespace.wrapLongLines ||
        effectiveLength <= this.config.whitespace.wrapLinesLongerThan) {
      return inline;
    }
    // Try to split at the top-level operator
    if (node.type === 'expression') {
      const expr = node as ExpressionNode;
      const left = this.maybeParenthesize(expr.left, this.wrapExpression(expr.left, indentLevel));
      const right = this.maybeParenthesize(expr.right, this.wrapExpression(expr.right, indentLevel));
      const op = this.tokenValue(expr.operator);
      const indent = this.indentStr(indentLevel);
      // Emit leading comments on the right operand (e.g. comment between + and next value)
      const rightToken = this.getFirstToken(expr.right);
      const rightComments = rightToken ? this.formatTokenLeadingComments(rightToken, indentLevel) : '';
      return left + '\n' + rightComments + indent + op + ' ' + right;
    }
    // Re-format non-expression nodes at the correct indent level so they can
    // make proper expansion decisions (e.g. function calls that need to expand)
    const reformatted = this.formatNode(node, indentLevel);
    if (reformatted !== inline) return reformatted;
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
    // Emit leading comments on the operator token (e.g. comment before AND)
    const opComments = this.formatTokenLeadingComments(node.operator);
    // Emit leading comments on the right operand (e.g. comment between + and next value)
    const rightToken = this.getFirstToken(node.right);
    const rightComments = rightToken ? this.formatTokenLeadingComments(rightToken) : '';
    // Clear them so they don't get emitted again by child formatters
    let savedComments: any[] | undefined;
    if (rightComments && rightToken) {
      savedComments = rightToken.leadingComments;
      rightToken.leadingComments = undefined;
    }

    const hasComments = !!(opComments || rightComments);

    // When comments force a line break, wrap the left child independently
    // so each segment between comments is wrapped within the line limit
    const left = hasComments && this.config.whitespace.wrapLongLines
      ? this.maybeParenthesize(node.left, this.wrapExpression(node.left, this.indent))
      : this.maybeParenthesize(node.left, this.formatNode(node.left));
    const right = this.maybeParenthesize(node.right, this.formatNode(node.right));
    const op = this.tokenValue(node.operator);

    // Handle unary (empty left)
    if (left === '') return op + right;

    const opUpper = node.operator.value.toUpperCase();

    // If there are comments on either the operator or the right operand, force a line break
    const commentStr = (opComments || '') + (rightComments || '');

    // Format operator with optional leading comments
    const opPrefix = hasComments
      ? '\n' + commentStr + this.indentStr()
      : ' ';

    let result: string;

    // Special: IS, IS NOT, LIKE, NOT LIKE
    if (opUpper === 'IS' || opUpper === 'IS NOT' || opUpper === 'LIKE' || opUpper.startsWith('NOT ')) {
      result = `${left}${opPrefix}${this.kw(opUpper)} ${right}`;
    }
    // Comparison and arithmetic operators — add spaces around them
    else if (this.config.operators.comparison.addSpacesAroundComparisonOperators &&
        ['=', '<', '>', '<=', '>=', '<>', '!='].includes(node.operator.value)) {
      if (hasComments) result = `${left}${opPrefix}${op} ${right}`;
      else result = `${left} ${op} ${right}`;
    }
    else if (this.config.operators.comparison.addSpacesAroundArithmeticOperators &&
        ['+', '-', '*', '/', '%'].includes(node.operator.value)) {
      if (hasComments) result = `${left}${opPrefix}${op} ${right}`;
      else result = `${left} ${op} ${right}`;
    }
    // AND/OR at top level
    else if (opUpper === 'AND' || opUpper === 'OR') {
      result = `${left}${opPrefix}${this.kw(opUpper)} ${right}`;
    }
    else if (hasComments) {
      result = `${left}${opPrefix}${op} ${right}`;
    }
    else {
      result = `${left} ${op} ${right}`;
    }

    // Restore comments in case node is re-formatted (e.g. by wrapExpression)
    if (savedComments && rightToken) {
      rightToken.leadingComments = savedComments;
    }

    return result;
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
    // Account for suffixes (WITHIN GROUP, OVER, alias) that add to the line length
    let suffixLength = 0;
    if (node.withinGroup) {
      const wg = node.withinGroup;
      suffixLength += 1 + wg.tokens[0].value.length + 1 + wg.tokens[1].value.length +
        2 + this.formatOrderBy(wg.orderBy, undefined, true).length + 1;
    }
    if (node.overClause) suffixLength += 1 + this.formatOverClause(node.overClause).length;
    const needsExpand = hasCloseComments ||
      formattedArgs.some(a => a.includes('\n')) ||
      (this.config.whitespace.wrapLongLines &&
       inline.length + indentWidth + suffixLength > this.config.whitespace.wrapLinesLongerThan &&
       node.args.length > 1);

    let result: string;
    if (needsExpand) {
      const innerIndent = this.indentStr(this.indent + 1);
      const outerIndent = this.indentStr(this.indent);
      // Re-format args at the inner indent level so nested constructs align
      const expanded = node.args.map((a, i) => {
        let formatted = this.formatNode(a, this.indent + 1);
        // Wrap long expression arguments
        if (a.type === 'expression') {
          formatted = this.wrapExpression(a, this.indent + 1);
        }
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

    // WITHIN GROUP (ORDER BY ...) clause
    if (node.withinGroup) {
      const wg = node.withinGroup;
      result += ' ' + this.kw(wg.tokens[0].value) + ' ' + this.kw(wg.tokens[1].value) +
        ' (' + this.formatOrderBy(wg.orderBy, undefined, true) + ')';
    }

    // OVER clause: SUM(...) OVER (PARTITION BY ...)
    if (node.overClause) {
      result += ' ' + this.formatOverClause(node.overClause);
    }

    // Table-valued function alias (e.g., OPENJSON(...) AS [w])
    const alias = node.alias;
    if (alias) {
      if (alias.asToken) {
        result += ' ' + this.kw(alias.asToken.value) + ' ' + this.formatIdentifierPartWithComments(alias.name);
      } else {
        result += ' ' + this.formatIdentifierPartWithComments(alias.name);
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

  private formatIdentifier(node: IdentifierNode, alignWidth?: number): string {
    let s = node.parts.map(p => this.formatIdentifierPartWithComments(p)).join('.');
    if (node.alias && alignWidth !== undefined && alignWidth > s.length) {
      s += ' '.repeat(alignWidth - s.length);
    }
    if (node.alias) {
      if (node.alias.asToken) {
        s += ' ' + this.kw('AS') + ' ' + this.formatIdentifierPartWithComments(node.alias.name);
      } else {
        s += ' ' + this.formatIdentifierPartWithComments(node.alias.name);
      }
    }
    if (node.pivot) {
      s += '\n' + this.formatPivot(node.pivot, this.indent + 1);
    }
    return s;
  }

  /** Get the formatted length of just the table name (no alias) for alignment purposes. */
  private getTableNameLength(node: SqlNode): number {
    if (node.type === 'identifier') {
      return (node as IdentifierNode).parts.map(p => this.formatIdentifierPart(p)).join('.').length;
    }
    return 0;
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
      } else if (mode === 'withBrackets') {
        // Normalize double-quotes to brackets
        return '[' + inner + ']';
      }
      return token.value; // asis
    } else if (token.type === TokenType.Word) {
      // Regular word token in an identifier position
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
        return cased;
      }
      return cased; // withoutBrackets or asis
    }
    return token.value;
  }

  // --- Literals ---

  private formatLiteral(node: LiteralNode): string {
    // Apply casing to keyword-like literals (NULL, DEFAULT, etc.)
    if (node.token.type === TokenType.Word) {
      return this.tokenValueWithComments(node.token);
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

    const inConfig = this.config.operators.in;
    const parenOnNewLine = inConfig.placeOpeningParenthesisOnNewLine;
    const firstValueOnNewLine = inConfig.placeFirstValueOnNewLine;

    // Expanded format: opening paren and/or values on new lines
    if (parenOnNewLine || firstValueOnNewLine === 'always') {
      const outerIndent = this.indentStr(this.indent);
      const innerIndent = this.indentStr(this.indent + 1);
      let result = `${expr} ${notStr}${this.kw('IN')}`;

      if (parenOnNewLine) {
        result += '\n' + outerIndent + '(';
      } else {
        result += ' (';
      }

      if (firstValueOnNewLine === 'always') {
        const subsequentOnNewLines = inConfig.placeSubsequentValuesOnNewLines;
        const maxLineLength = this.config.whitespace.wrapLinesLongerThan;
        const valueLine = innerIndent + valuesStr;

        if (subsequentOnNewLines === 'always') {
          // One value per line
          result += '\n';
          for (let i = 0; i < formattedValues.length; i++) {
            const comma = i < formattedValues.length - 1 ? ',' : '';
            result += innerIndent + formattedValues[i] + comma + '\n';
          }
          result += outerIndent + ')';
        } else if (subsequentOnNewLines === 'never' || !this.config.whitespace.wrapLongLines || valueLine.length <= maxLineLength) {
          // All values on one line
          result += '\n' + innerIndent + valuesStr + '\n' + outerIndent + ')';
        } else {
          // Wrap values: pack as many as fit per line
          const available = maxLineLength - innerIndent.length;
          const wrappedLines: string[][] = [];
          let currentGroup: string[] = [];
          let currentLen = 0;

          for (const val of formattedValues) {
            const addLen = currentGroup.length === 0 ? val.length : val.length + 2;
            if (currentGroup.length > 0 && currentLen + addLen > available) {
              wrappedLines.push(currentGroup);
              currentGroup = [val];
              currentLen = val.length;
            } else {
              currentGroup.push(val);
              currentLen += addLen;
            }
          }
          if (currentGroup.length > 0) {
            wrappedLines.push(currentGroup);
          }

          result += '\n';
          for (let i = 0; i < wrappedLines.length; i++) {
            result += innerIndent + wrappedLines[i].join(', ');
            if (i < wrappedLines.length - 1) {
              result += ',\n';
            }
          }
          result += '\n' + outerIndent + ')';
        }
      } else {
        result += `${space}${valuesStr}${space})`;
      }

      return result;
    }

    const subsequentOnNewLines = inConfig.placeSubsequentValuesOnNewLines;

    // Check if wrapping is needed
    const maxLineLength = this.config.whitespace.wrapLinesLongerThan;
    // The IN expression is typically placed at indent + 1 (inside a clause)
    const lineIndentWidth = (this.indent + 1) * this.tabStr.length;

    if (subsequentOnNewLines === 'always') {
      // One value per line
      const outerIndent = this.indentStr(this.indent);
      const innerIndent = this.indentStr(this.indent + 1);
      let result = `${expr} ${notStr}${this.kw('IN')} (\n`;
      for (let i = 0; i < formattedValues.length; i++) {
        const comma = i < formattedValues.length - 1 ? ',' : '';
        result += innerIndent + formattedValues[i] + comma + '\n';
      }
      result += outerIndent + ')';
      return result;
    }

    if (subsequentOnNewLines === 'never' || !this.config.whitespace.wrapLongLines || singleLine.length + lineIndentWidth <= maxLineLength) {
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
    const notStr = node.notToken ? this.kwTokenWithComments(node.notToken) + ' ' : '';
    const subquery = this.formatNode(node.subquery);
    return `${notStr}${this.kwTokenWithComments(node.existsToken)} (${subquery})`;
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

    // FOR column IN (values) — respects operators.in config
    const inConfig = this.config.operators.in;
    const formattedValues = node.values.map(v => this.formatNode(v));
    const space = inConfig.addSpaceAroundInContents ? ' ' : '';
    const valuesStr = formattedValues.join(', ');
    const forColumnStr = this.kw('FOR') + ' ' + this.formatNode(node.pivotColumn) + ' ' + this.kw('IN');

    // Check if any values have comments (trailing or leading)
    const hasComments = node.values.some(v => {
      const tc = (v as any)._trailingComment;
      const firstToken = this.getFirstToken(v);
      return tc || firstToken?.leadingComments?.length;
    });

    const parenOnNewLine = inConfig.placeOpeningParenthesisOnNewLine;
    const firstValueOnNewLine = inConfig.placeFirstValueOnNewLine;

    if (parenOnNewLine || firstValueOnNewLine === 'always') {
      // Expanded format using operators.in placement settings
      let result = innerIndent + forColumnStr;
      if (parenOnNewLine) {
        result += '\n' + innerIndent + '(';
      } else {
        result += ' (';
      }
      if (firstValueOnNewLine === 'always') {
        const valueIndent = this.indentStr(bi + 2);

        if (hasComments) {
          // Wrap values to max line length, preserving comments
          const maxLineLength = this.config.whitespace.wrapLinesLongerThan;
          const available = maxLineLength - valueIndent.length;
          const subsequentOnNewLines = inConfig.placeSubsequentValuesOnNewLines;
          result += '\n';
          let currentLine = '';

          for (let i = 0; i < node.values.length; i++) {
            const v = node.values[i];
            const firstToken = this.getFirstToken(v);
            const hasLeading = firstToken?.leadingComments?.length;
            const tc = (v as any)._trailingComment as Token | undefined;
            const comma = i < node.values.length - 1 ? ',' : '';
            const valWithComma = formattedValues[i] + comma;

            // Leading comments force a new line
            if (hasLeading) {
              if (currentLine) {
                result += valueIndent + currentLine + '\n';
                currentLine = '';
              }
              for (const c of firstToken!.leadingComments!) {
                result += valueIndent + c.value + '\n';
              }
            }

            // Trailing comments force this value onto its own line
            if (tc) {
              if (currentLine) {
                result += valueIndent + currentLine + '\n';
                currentLine = '';
              }
              result += valueIndent + valWithComma + ' ' + tc.value + '\n';
              continue;
            }

            if (subsequentOnNewLines === 'always') {
              if (currentLine) {
                result += valueIndent + currentLine + '\n';
                currentLine = '';
              }
              result += valueIndent + valWithComma + '\n';
            } else if (subsequentOnNewLines === 'never' || !this.config.whitespace.wrapLongLines) {
              currentLine += (currentLine ? ' ' : '') + valWithComma;
            } else {
              const addLen = currentLine ? valWithComma.length + 1 : valWithComma.length;
              if (currentLine && currentLine.length + addLen > available) {
                result += valueIndent + currentLine + '\n';
                currentLine = valWithComma;
              } else {
                currentLine += (currentLine ? ' ' : '') + valWithComma;
              }
            }
          }
          if (currentLine) {
            result += valueIndent + currentLine + '\n';
          }
          result += innerIndent + ')';
        } else {
          const valueLine = valueIndent + valuesStr;
          const maxLineLength = this.config.whitespace.wrapLinesLongerThan;
          const subsequentOnNewLines = inConfig.placeSubsequentValuesOnNewLines;

          if (subsequentOnNewLines === 'always') {
            // One value per line
            result += '\n';
            for (let i = 0; i < formattedValues.length; i++) {
              const comma = i < formattedValues.length - 1 ? ',' : '';
              result += valueIndent + formattedValues[i] + comma + '\n';
            }
            result += innerIndent + ')';
          } else if (subsequentOnNewLines === 'never' || !this.config.whitespace.wrapLongLines || valueLine.length <= maxLineLength) {
            // All values on one line
            result += '\n' + valueLine + '\n' + innerIndent + ')';
          } else {
            // Wrap values: pack as many as fit per line
            const available = maxLineLength - valueIndent.length;
            const wrappedLines: string[][] = [];
            let currentGroup: string[] = [];
            let currentLen = 0;

            for (const val of formattedValues) {
              const addLen = currentGroup.length === 0 ? val.length : val.length + 2;
              if (currentGroup.length > 0 && currentLen + addLen > available) {
                wrappedLines.push(currentGroup);
                currentGroup = [val];
                currentLen = val.length;
              } else {
                currentGroup.push(val);
                currentLen += addLen;
              }
            }
            if (currentGroup.length > 0) {
              wrappedLines.push(currentGroup);
            }

            result += '\n';
            for (let i = 0; i < wrappedLines.length; i++) {
              result += valueIndent + wrappedLines[i].join(', ');
              if (i < wrappedLines.length - 1) {
                result += ',\n';
              }
            }
            result += '\n' + innerIndent + ')';
          }
        }
      } else {
        result += space + valuesStr + space + ')';
      }
      lines.push(result);
    } else if (hasComments) {
      // Comments present in default mode — wrap values, preserving comments
      const valueIndent = this.indentStr(bi + 2);
      const maxLineLength = this.config.whitespace.wrapLinesLongerThan;
      const available = maxLineLength - valueIndent.length;
      const subsequentOnNewLines = inConfig.placeSubsequentValuesOnNewLines;
      let result = innerIndent + forColumnStr + '\n' + innerIndent + '(\n';
      let currentLine = '';

      for (let i = 0; i < node.values.length; i++) {
        const v = node.values[i];
        const firstToken = this.getFirstToken(v);
        const hasLeading = firstToken?.leadingComments?.length;
        const tc = (v as any)._trailingComment as Token | undefined;
        const comma = i < node.values.length - 1 ? ',' : '';
        const valWithComma = formattedValues[i] + comma;

        if (hasLeading) {
          if (currentLine) {
            result += valueIndent + currentLine + '\n';
            currentLine = '';
          }
          for (const c of firstToken!.leadingComments!) {
            result += valueIndent + c.value + '\n';
          }
        }

        if (tc) {
          if (currentLine) {
            result += valueIndent + currentLine + '\n';
            currentLine = '';
          }
          result += valueIndent + valWithComma + ' ' + tc.value + '\n';
          continue;
        }

        if (subsequentOnNewLines === 'always') {
          if (currentLine) {
            result += valueIndent + currentLine + '\n';
            currentLine = '';
          }
          result += valueIndent + valWithComma + '\n';
        } else if (subsequentOnNewLines === 'never' || !this.config.whitespace.wrapLongLines) {
          currentLine += (currentLine ? ' ' : '') + valWithComma;
        } else {
          const addLen = currentLine ? valWithComma.length + 1 : valWithComma.length;
          if (currentLine && currentLine.length + addLen > available) {
            result += valueIndent + currentLine + '\n';
            currentLine = valWithComma;
          } else {
            currentLine += (currentLine ? ' ' : '') + valWithComma;
          }
        }
      }
      if (currentLine) {
        result += valueIndent + currentLine + '\n';
      }
      result += innerIndent + ')';
      lines.push(result);
    } else {
      // Default: single-line or wrap-on-overflow
      const forPrefix = forColumnStr + ' (';
      const forLine = innerIndent + forPrefix + space + valuesStr + space + ')';
      const maxLineLength = this.config.whitespace.wrapLinesLongerThan;

      const subsequentOnNewLines = inConfig.placeSubsequentValuesOnNewLines;
      if (subsequentOnNewLines === 'always') {
        // One value per line
        const valueIndent = this.indentStr(bi + 2);
        let result = innerIndent + forColumnStr + '\n' + innerIndent + '(\n';
        for (let i = 0; i < formattedValues.length; i++) {
          const comma = i < formattedValues.length - 1 ? ',' : '';
          result += valueIndent + formattedValues[i] + comma + '\n';
        }
        result += innerIndent + ')';
        lines.push(result);
      } else if (subsequentOnNewLines === 'never' || !this.config.whitespace.wrapLongLines || forLine.length <= maxLineLength) {
        // All values on one line
        lines.push(forLine);
      } else {
        // Wrap values: pack as many as fit per line, aligning after the opening paren
        const fullPrefix = forPrefix + space;
        const continuationPad = innerIndent + ' '.repeat(fullPrefix.length);
        const availableFirstLine = maxLineLength - innerIndent.length - fullPrefix.length;
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

        let result = innerIndent + fullPrefix;
        for (let i = 0; i < lineGroups.length; i++) {
          if (i > 0) result += continuationPad;
          result += lineGroups[i].join(', ');
          if (i < lineGroups.length - 1) {
            result += ',\n';
          } else {
            result += space + ')';
          }
        }
        lines.push(result);
      }
    }

    // Closing paren + alias
    let closeLine = indent + ')';
    if (node.alias) {
      if (node.alias.asToken) {
        closeLine += ' ' + this.kw('AS') + ' ' + this.formatIdentifierPartWithComments(node.alias.name);
      } else {
        closeLine += ' ' + this.formatIdentifierPartWithComments(node.alias.name);
      }
    }
    lines.push(closeLine);

    return lines.join('\n');
  }

  // --- Paren group ---

  private formatParenGroupAlias(node: ParenGroupNode): string {
    if (!node.alias) return '';
    if (node.alias.asToken) {
      return ' ' + this.kw('AS') + ' ' + this.formatIdentifierPartWithComments(node.alias.name);
    }
    return ' ' + this.formatIdentifierPartWithComments(node.alias.name);
  }

  private formatParenGroup(node: ParenGroupNode, baseIndent?: number): string {
    const isSubquery = node.inner.length === 1 && node.inner[0].type === 'select';
    const bi = baseIndent ?? this.indent;
    const pivotSuffix = node.pivot ? '\n' + this.formatPivot(node.pivot, bi) : '';

    if (isSubquery) {
      const indent = this.indentStr(bi);
      const dml = this.config.dml;
      const alias = this.formatParenGroupAlias(node);
      const innerSelect = node.inner[0] as SelectNode;
      const hasInnerComments = !!innerSelect.selectToken?.leadingComments?.length || this.nodeHasComments(innerSelect);

      // Try collapsing the subquery if configured (skip collapse if pivot, comments, or inner leading comments)
      if (dml.collapseShortSubqueries && !node.pivot && !node.openParenComments?.length && !node.closeComments?.length && !hasInnerComments) {
        const saved = this.saveEmittedComments();
        const collapsed = this.collapseSelect(innerSelect);
        if (('(' + collapsed + ')' + alias).length <= dml.collapseSubqueriesShorterThan) {
          return '(' + collapsed + ')' + alias;
        }
        this.restoreEmittedComments(saved);
      }

      // Expanded: use subquery collapse settings for the inner SELECT
      const savedCollapse = dml.collapseShortStatements;
      const savedThreshold = dml.collapseStatementsShorterThan;
      (this.config.dml as any).collapseShortStatements = dml.collapseShortSubqueries;
      (this.config.dml as any).collapseStatementsShorterThan = dml.collapseSubqueriesShorterThan;
      let openCommentStr = '';
      if (node.openParenComments?.length) {
        const oci = this.indentStr(bi + 1);
        openCommentStr = node.openParenComments.map(c => { this.emittedComments.add(c); return oci + c.value; }).join('\n') + '\n';
      }
      const innerComments = this.formatTokenLeadingComments(innerSelect.selectToken, bi + 1);
      const innerFormatted = this.formatNode(node.inner[0], bi + 1);
      (this.config.dml as any).collapseShortStatements = savedCollapse;
      (this.config.dml as any).collapseStatementsShorterThan = savedThreshold;

      const closeCommentStr = this.formatCloseComments(node.closeComments, bi);
      const allInnerComments = openCommentStr + (innerComments || '');
      const innerContent = allInnerComments ? allInnerComments.trimEnd() + '\n' + innerFormatted : innerFormatted;
      return '(\n' + innerContent + closeCommentStr + '\n' + indent + ')' + alias + pivotSuffix;
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
