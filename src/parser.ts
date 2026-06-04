import { Token, TokenType } from './tokens';
import {
  SqlNode, BatchNode, SelectNode, CreateProcedureNode, ProcParameter,
  BeginEndNode, TryCatchNode, IfElseNode, SetNode, DeclareNode, PrintNode, ReturnNode, UseNode, ThrowNode, RaiserrorNode,
  CaseNode, ExpressionNode, FunctionCallNode, IdentifierNode, LiteralNode,
  RawTokenNode, WhereNode, GroupByNode, OrderByNode, HavingNode, JoinNode,
  InsertNode, UpdateNode, DeleteNode, CteNode, InExpressionNode, BetweenNode,
  ExistsNode, ParenGroupNode, CreateTableNode, ColumnDefNode, DropTableNode,
  AlterTableNode, PivotNode,
  DeclareCursorNode, SetCursorNode, OpenCursorNode, CloseCursorNode, FetchCursorNode, DeallocateCursorNode,
} from './ast';

export function parse(tokens: Token[]): BatchNode {
  const parser = new Parser(tokens);
  return parser.parseBatch();
}

class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // --- Helpers ---

  private peek(offset = 0): Token {
    const idx = this.pos + offset;
    if (idx < this.tokens.length) return this.tokens[idx];
    return this.tokens[this.tokens.length - 1]; // EOF
  }

  private current(): Token {
    return this.peek();
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }

  /**
   * Consume a comma token and transfer any trailing comment from it
   * to the next token as a leading comment. This prevents losing
   * inline comments that appear after commas in lists (e.g.,
   * `SELECT a, -- comment\n  b`).
   */
  /** Transfer leading/trailing comments from a skipped token to the next token */
  private transferComments(skipped: Token): void {
    const next = this.current();
    if (skipped.leadingComments?.length) {
      if (this.isEOF()) {
        // At EOF, attach as trailingComments so the formatter emits them
        if (!next.trailingComments) next.trailingComments = [];
        next.trailingComments.push(...skipped.leadingComments);
      } else {
        if (!next.leadingComments) next.leadingComments = [];
        next.leadingComments.unshift(...skipped.leadingComments);
        if (skipped.leadingComments[0].precedingBlankLine) {
          next.precedingBlankLine = true;
        }
      }
      skipped.leadingComments = undefined;
    }
    if (skipped.trailingComment) {
      if (this.isEOF()) {
        if (!next.trailingComments) next.trailingComments = [];
        next.trailingComments.push(skipped.trailingComment);
      } else {
        if (!next.leadingComments) next.leadingComments = [];
        next.leadingComments.push(skipped.trailingComment);
      }
      skipped.trailingComment = undefined;
    }
  }

  private advanceComma(): Token {
    const comma = this.advance();
    if (comma.trailingComment) {
      const next = this.current();
      next._commaComment = comma.trailingComment;
      comma.trailingComment = undefined;
    }
    // Leading comments on the comma (e.g. comments on lines before a leading-
    // comma list item) are transferred to the next token so they appear as
    // leading comments on the following list item.
    if (comma.leadingComments?.length) {
      const next = this.current();
      if (!next.leadingComments) next.leadingComments = [];
      next.leadingComments.unshift(...comma.leadingComments);
      comma.leadingComments = undefined;
    }
    return comma;
  }

  private isEOF(): boolean {
    return this.current().type === TokenType.EOF;
  }

  private isWord(value?: string): boolean {
    const tok = this.current();
    if (tok.type !== TokenType.Word) return false;
    if (value) return tok.value.toUpperCase() === value.toUpperCase();
    return true;
  }

  private isWordAt(offset: number, value: string): boolean {
    const tok = this.peek(offset);
    return tok.type === TokenType.Word && tok.value.toUpperCase() === value.toUpperCase();
  }

  private isType(type: TokenType): boolean {
    return this.current().type === type;
  }

  private expectWord(value: string): Token {
    if (!this.isWord(value)) {
      // Loose: return current token and advance anyway
      return this.advance();
    }
    return this.advance();
  }

  private expectType(type: TokenType): Token {
    if (!this.isType(type)) {
      return this.advance();
    }
    return this.advance();
  }

  /** Check if the next tokens match a multi-word keyword sequence */
  private matchWords(...words: string[]): boolean {
    for (let i = 0; i < words.length; i++) {
      if (!this.isWordAt(i, words[i])) return false;
    }
    return true;
  }

  /** Check if we're at a statement boundary */
  private isStatementEnd(): boolean {
    if (this.isEOF()) return true;
    if (this.isType(TokenType.Semicolon)) return true;
    if (this.isType(TokenType.BatchSeparator)) return true;
    if (this.isWord('END')) return true;
    if (this.isWord('ELSE')) return true;
    return false;
  }

  // --- Top-level ---

  parseBatch(): BatchNode {
    const batches: { statements: SqlNode[]; separator?: Token }[] = [];
    let currentStatements: SqlNode[] = [];

    while (!this.isEOF()) {
      if (this.isType(TokenType.BatchSeparator)) {
        const sep = this.advance();
        batches.push({ statements: currentStatements, separator: sep });
        currentStatements = [];
        continue;
      }

      if (this.isType(TokenType.Semicolon)) {
        // Attach semicolon to preceding statement
        if (currentStatements.length > 0) {
          (currentStatements[currentStatements.length - 1] as any)._hasSemicolon = true;
        }
        const semi = this.advance();
        // Trailing comment on semicolon (same line) belongs with the preceding statement
        if (semi.trailingComment && currentStatements.length > 0) {
          (currentStatements[currentStatements.length - 1] as any)._semicolonTrailingComment = semi.trailingComment;
          semi.trailingComment = undefined;
        }
        // Transfer any remaining comments (leading) to next token so they aren't lost
        this.transferComments(semi);
        continue;
      }

      const stmt = this.parseStatement();
      if (stmt) currentStatements.push(stmt);
    }

    if (currentStatements.length > 0) {
      batches.push({ statements: currentStatements });
    }

    // Collect trailing comments from the last separator or the EOF token
    let trailingComments: Token[] | undefined;
    if (batches.length > 0) {
      const lastBatch = batches[batches.length - 1];
      if (lastBatch.separator?.trailingComments?.length) {
        trailingComments = lastBatch.separator.trailingComments;
      }
    }
    // Also check the EOF token for trailing comments (no-GO case)
    if (this.isEOF() && this.current().trailingComments?.length) {
      trailingComments = this.current().trailingComments;
    }

    const node: BatchNode = { type: 'batch', batches };
    if (trailingComments) node.trailingComments = trailingComments;
    return node;
  }

  parseStatement(): SqlNode | null {
    if (this.isEOF()) return null;

    // Skip stray semicolons
    if (this.isType(TokenType.Semicolon)) {
      const semi = this.advance();
      // Transfer comments from semicolon to next token so they aren't lost
      this.transferComments(semi);
      return null;
    }

    const upper = this.current().type === TokenType.Word ? this.current().value.toUpperCase() : '';

    // CREATE [OR ALTER] PROCEDURE/TABLE
    if (upper === 'CREATE' || upper === 'ALTER') {
      return this.parseCreateOrAlter();
    }

    // SELECT
    if (upper === 'SELECT') {
      return this.parseSelect();
    }

    // WITH (CTE)
    if (upper === 'WITH' && this.looksLikeCTE()) {
      return this.parseCTE();
    }

    // INSERT
    if (upper === 'INSERT') {
      return this.parseInsert();
    }

    // UPDATE
    if (upper === 'UPDATE') {
      return this.parseUpdate();
    }

    // DELETE
    if (upper === 'DELETE') {
      return this.parseDelete();
    }

    // BEGIN...END
    if (upper === 'BEGIN') {
      return this.parseBeginEnd();
    }

    // IF...ELSE
    if (upper === 'IF') {
      return this.parseIfElse();
    }

    // WHILE
    if (upper === 'WHILE') {
      return this.parseWhile();
    }

    // DECLARE
    if (upper === 'DECLARE') {
      return this.parseDeclare();
    }

    // SET
    if (upper === 'SET') {
      return this.parseSet();
    }

    // USE
    if (upper === 'USE') {
      return this.parseUse();
    }

    // PRINT
    if (upper === 'PRINT') {
      return this.parsePrint();
    }

    // RETURN
    if (upper === 'RETURN') {
      return this.parseReturn();
    }

    // THROW
    if (upper === 'THROW') {
      return this.parseThrow();
    }

    // RAISERROR
    if (upper === 'RAISERROR') {
      return this.parseRaiserror();
    }

    // EXEC / EXECUTE
    if (upper === 'EXEC' || upper === 'EXECUTE') {
      return this.parseExec();
    }

    // DROP TABLE
    if (upper === 'DROP') {
      return this.parseDrop();
    }

    // TRUNCATE TABLE
    if (upper === 'TRUNCATE') {
      return this.parseTruncate();
    }

    // OPEN cursor
    if (upper === 'OPEN') {
      return this.parseOpenCursor();
    }

    // CLOSE cursor
    if (upper === 'CLOSE') {
      return this.parseCloseCursor();
    }

    // DEALLOCATE cursor
    if (upper === 'DEALLOCATE') {
      return this.parseDeallocateCursor();
    }

    // FETCH cursor
    if (upper === 'FETCH') {
      return this.parseFetchCursor();
    }

    // Fallback: consume one token as RawTokenNode
    return { type: 'rawToken', token: this.advance() } as RawTokenNode;
  }

  // --- CREATE / ALTER ---

  private parseCreateOrAlter(): SqlNode {
    const keywords: Token[] = [];
    keywords.push(this.advance()); // CREATE or ALTER

    // OR ALTER
    if (this.isWord('OR')) {
      keywords.push(this.advance());
      if (this.isWord('ALTER')) keywords.push(this.advance());
    }

    if (this.isWord('PROCEDURE') || this.isWord('PROC')) {
      keywords.push(this.advance());
      return this.parseCreateProcedure(keywords);
    }

    if (this.isWord('TABLE')) {
      keywords.push(this.advance());
      // ALTER TABLE gets its own parser (not CREATE TABLE)
      if (keywords[0].value.toUpperCase() === 'ALTER' && keywords.length === 2) {
        return this.parseAlterTable(keywords);
      }
      return this.parseCreateTable(keywords);
    }

    // Fallback: consume rest as raw tokens
    return this.consumeRestAsRaw(keywords);
  }

  private parseCreateProcedure(keywords: Token[]): CreateProcedureNode {
    const name = this.parseQualifiedName();
    const parameters: ProcParameter[] = [];

    // Parameters — might be in parens or not
    const hasParen = this.isType(TokenType.LeftParen);
    if (hasParen) this.advance(); // skip (

    while (!this.isEOF() && !this.isWord('AS') && !(hasParen && this.isType(TokenType.RightParen))) {
      if (this.isType(TokenType.Comma)) { this.advanceComma(); continue; }
      if (this.current().type === TokenType.Word && this.current().value.startsWith('@')) {
        const param = this.parseProcParameter();
        parameters.push(param);
      } else {
        break;
      }
    }

    if (hasParen && this.isType(TokenType.RightParen)) this.advance();

    const asToken = this.expectWord('AS');

    const body = this.parseStatement() || { type: 'rawToken', token: asToken } as RawTokenNode;

    return {
      type: 'createProcedure',
      keywords,
      name,
      parameters,
      asToken,
      body,
    };
  }

  /** True when token `b` starts exactly where token `a` ends — i.e. no
   *  whitespace or comment separated them in the source. */
  private adjacent(a: Token, b: Token): boolean {
    return a.offset + a.value.length === b.offset;
  }

  /** Read an identifier in a "name position" (a procedure parameter or a
   *  column-definition name). The lexer always splits a hyphen out as a
   *  subtraction operator, so `@A1_Param_-_Name_Total` arrives as three
   *  tokens (`@A1_Param_`, `-`, `_Name_Total`). T-SQL has no hyphen in a
   *  legal identifier, but some generated/legacy code uses them; in a name
   *  position there is no expression to confuse it with, so we re-join the
   *  pieces — but only when they are physically adjacent (no surrounding
   *  whitespace), so a spaced `@x - y` is left as subtraction. */
  private parseNamePosition(): Token {
    let combined = this.advance();
    while (
      this.isType(TokenType.Operator) && this.current().value === '-' &&
      this.adjacent(combined, this.current()) &&
      this.adjacent(this.current(), this.peek(1)) &&
      (this.peek(1).type === TokenType.Word || this.peek(1).type === TokenType.NumberLiteral)
    ) {
      const hyphen = this.advance();
      const next = this.advance();
      combined = {
        ...combined,
        value: combined.value + hyphen.value + next.value,
        trailingComment: next.trailingComment,
        trailingComments: next.trailingComments,
      };
    }
    return combined;
  }

  private parseProcParameter(): ProcParameter {
    const name = this.parseNamePosition(); // @param
    const dataType = this.parseDataType();
    let defaultVal: SqlNode | undefined;
    let output: Token | undefined;

    if (this.isType(TokenType.Equals)) {
      this.advance(); // =
      defaultVal = this.parseAtom();
    }

    if (this.isWord('OUTPUT') || this.isWord('OUT')) {
      output = this.advance();
    }

    return { name, dataType, default: defaultVal, output };
  }

  private parseDataType(): SqlNode {
    // e.g., VARCHAR(20), INT, DECIMAL(10,2), [varchar](50)
    const parts: Token[] = [];
    if (this.isWord() || this.isType(TokenType.QuotedIdentifier)) {
      parts.push(this.advance());
    }

    // Handle precision/scale: (20), (10, 2), (MAX)
    if (this.isType(TokenType.LeftParen)) {
      const innerTokens: SqlNode[] = [];
      this.advance(); // (
      while (!this.isEOF() && !this.isType(TokenType.RightParen)) {
        if (this.isType(TokenType.Comma)) { this.advanceComma(); continue; }
        innerTokens.push({ type: 'rawToken', token: this.advance() });
      }
      if (this.isType(TokenType.RightParen)) this.advance(); // )

      return {
        type: 'functionCall',
        name: { type: 'identifier', parts } as IdentifierNode,
        args: innerTokens,
      } as FunctionCallNode;
    }

    if (parts.length === 1) {
      return { type: 'identifier', parts } as IdentifierNode;
    }

    return { type: 'rawToken', token: parts[0] || this.current() } as RawTokenNode;
  }

  private parseCreateTable(keywords: Token[]): CreateTableNode {
    const name = this.parseQualifiedName();
    const columns: (ColumnDefNode | any)[] = [];
    let closeParen: Token | undefined;

    if (this.isType(TokenType.LeftParen)) {
      this.advance(); // (
      while (!this.isEOF() && !this.isType(TokenType.RightParen)) {
        if (this.isType(TokenType.Comma)) { this.advanceComma(); continue; }
        // Constraint or column def
        if (this.isWord('CONSTRAINT') || this.isWord('PRIMARY') || this.isWord('FOREIGN') ||
            this.isWord('UNIQUE') || this.isWord('CHECK')) {
          columns.push(this.parseTableConstraint());
        } else {
          columns.push(this.parseColumnDef());
        }
      }
      if (this.isType(TokenType.RightParen)) closeParen = this.advance();
    }

    // Handle ON filegroup (e.g., ON PRIMARY)
    let onFilegroup: Token[] | undefined;
    if (this.isWord('ON')) {
      onFilegroup = [];
      onFilegroup.push(this.advance()); // ON
      if (this.isWord() || this.isType(TokenType.QuotedIdentifier)) {
        onFilegroup.push(this.advance()); // PRIMARY or filegroup name
      }
    }

    return { type: 'createTable', keywords, name, columns, closeParen, onFilegroup };
  }

  private parseAlterTable(keywords: Token[]): AlterTableNode {
    const name = this.parseQualifiedName();
    const action: Token[] = [];
    while (!this.isEOF() && !this.isType(TokenType.Semicolon) && !this.isType(TokenType.BatchSeparator) && !this.isAlterTableEnd()) {
      action.push(this.advance());
    }
    return { type: 'alterTable', keywords, name, action };
  }

  /** Check if we've reached the end of an ALTER TABLE statement.
   *  Unlike isStatementEnd, this doesn't stop at DROP/ALTER/WITH/SET
   *  which can be part of ALTER TABLE actions. */
  private isAlterTableEnd(): boolean {
    if (this.isEOF()) return true;
    if (this.isWord('END') || this.isWord('ELSE')) return true;
    // Check for actual new statement starts that can't be ALTER TABLE actions
    if (this.current().type !== TokenType.Word) return false;
    const upper = this.current().value.toUpperCase();
    switch (upper) {
      case 'SELECT': case 'INSERT': case 'UPDATE': case 'DELETE':
      case 'CREATE': case 'DECLARE': case 'PRINT': case 'RETURN':
      case 'IF': case 'WHILE': case 'BEGIN': case 'EXEC': case 'EXECUTE':
      case 'TRUNCATE':
        return true;
      // ALTER at start of a new ALTER TABLE statement
      case 'ALTER':
        return this.isWordAt(1, 'TABLE') || this.isWordAt(1, 'PROCEDURE') || this.isWordAt(1, 'PROC');
      // DROP as start of a new DROP TABLE statement
      case 'DROP':
        return this.isWordAt(1, 'TABLE') || this.isWordAt(1, 'INDEX') || this.isWordAt(1, 'VIEW') || this.isWordAt(1, 'PROCEDURE') || this.isWordAt(1, 'PROC');
      default:
        return false;
    }
  }

  private parseColumnDef(): ColumnDefNode {
    const name = this.parseNamePosition();

    // Check if the next token is a constraint keyword instead of a data type
    // This indicates a missing data type
    const upper = this.current().type === TokenType.Word ? this.current().value.toUpperCase() : '';
    const isConstraintKeyword = ['NOT', 'NULL', 'DEFAULT', 'IDENTITY', 'PRIMARY', 'UNIQUE', 'CHECK', 'REFERENCES', 'CONSTRAINT', 'COLLATE'].includes(upper);

    let dataType: SqlNode;
    if (isConstraintKeyword || this.isType(TokenType.Comma) || this.isType(TokenType.RightParen)) {
      // Missing data type - create a placeholder
      console.error(`Warning: Column "${name.value}" is missing a data type`);
      dataType = { type: 'identifier', parts: [{ ...name, value: 'MISSING_DATATYPE' }] } as IdentifierNode;
    } else {
      dataType = this.parseDataType();
    }
    const constraints: SqlNode[] = [];

    // Inline constraints: NULL, NOT NULL, DEFAULT, IDENTITY, PRIMARY KEY
    while (!this.isEOF() && !this.isType(TokenType.Comma) && !this.isType(TokenType.RightParen)) {
      if (this.isWord('NOT') || this.isWord('NULL') || this.isWord('DEFAULT') ||
          this.isWord('IDENTITY') || this.isWord('PRIMARY') || this.isWord('UNIQUE') ||
          this.isWord('CHECK') || this.isWord('REFERENCES') || this.isWord('CONSTRAINT') ||
          this.isWord('COLLATE')) {
        const tokens: Token[] = [];
        const firstWord = this.current().value.toUpperCase();
        tokens.push(this.advance());

        // Handle NOT NULL as a unit
        if (firstWord === 'NOT' && this.isWord('NULL')) {
          tokens.push(this.advance());
          constraints.push({ type: 'constraint', tokens, columns: [] });
          continue;
        }

        // Handle standalone NULL
        if (firstWord === 'NULL') {
          constraints.push({ type: 'constraint', tokens, columns: [] });
          continue;
        }

        // Handle IDENTITY(1,1), DEFAULT value, PRIMARY KEY, etc.
        if (this.isType(TokenType.LeftParen)) {
          tokens.push(this.advance()); // (
          let depth = 1;
          while (!this.isEOF() && depth > 0) {
            if (this.isType(TokenType.LeftParen)) depth++;
            if (this.isType(TokenType.RightParen)) depth--;
            tokens.push(this.advance());
          }
        } else if (firstWord === 'PRIMARY' && this.isWord('KEY')) {
          tokens.push(this.advance()); // KEY
        } else if (firstWord === 'DEFAULT') {
          // Consume the default value (could be a literal, function call, etc.)
          if (!this.isType(TokenType.Comma) && !this.isType(TokenType.RightParen) &&
              !this.isWord('NOT') && !this.isWord('NULL') && !this.isWord('IDENTITY') &&
              !this.isWord('PRIMARY') && !this.isWord('UNIQUE') && !this.isWord('CHECK')) {
            tokens.push(this.advance());
          }
        } else if (firstWord === 'COLLATE') {
          // Consume the collation name
          if (!this.isEOF() && !this.isType(TokenType.Comma) && !this.isType(TokenType.RightParen)) {
            tokens.push(this.advance());
          }
        }

        constraints.push({ type: 'constraint', tokens, columns: [] });
      } else {
        break;
      }
    }

    return { type: 'columnDef', name, dataType, constraints };
  }

  private parseTableConstraint(): any {
    const tokens: Token[] = [];
    // consume until comma or closing paren, respecting nested parens
    while (!this.isEOF() && !this.isType(TokenType.Comma) && !this.isType(TokenType.RightParen)) {
      if (this.isType(TokenType.LeftParen)) {
        tokens.push(this.advance());
        let depth = 1;
        while (!this.isEOF() && depth > 0) {
          if (this.isType(TokenType.LeftParen)) depth++;
          if (this.isType(TokenType.RightParen)) depth--;
          tokens.push(this.advance());
        }
      } else {
        tokens.push(this.advance());
      }
    }
    return { type: 'constraint', tokens, columns: [] };
  }

  // --- SELECT ---

  parseSelect(): SelectNode {
    const selectToken = this.advance(); // SELECT

    let distinct: Token | undefined;
    let top: { token: Token; value: SqlNode } | undefined;

    if (this.isWord('DISTINCT')) {
      distinct = this.advance();
    }

    if (this.isWord('TOP')) {
      const topToken = this.advance();
      let topValue: SqlNode;
      if (this.isType(TokenType.LeftParen)) {
        this.advance();
        topValue = this.parseExpression();
        if (this.isType(TokenType.RightParen)) this.advance();
      } else {
        topValue = this.parseAtom();
      }
      top = { token: topToken, value: topValue };
    }

    // Column list
    const columns = this.parseSelectColumns();

    let into: { token: Token; target: SqlNode } | undefined;
    let from: { token: Token; source: SqlNode; joins: JoinNode[] } | undefined;
    let where: WhereNode | undefined;
    let groupBy: GroupByNode | undefined;
    let having: HavingNode | undefined;
    let orderBy: OrderByNode | undefined;

    // INTO
    if (this.isWord('INTO')) {
      const intoToken = this.advance();
      const target = this.parseQualifiedName();
      into = { token: intoToken, target };
    }

    // FROM
    if (this.isWord('FROM')) {
      const fromToken = this.advance();
      const source = this.parseTableSource();
      const joins: JoinNode[] = [];
      while (this.isJoinKeyword()) {
        joins.push(this.parseJoin());
      }
      from = { token: fromToken, source, joins };
    }

    // WHERE
    if (this.isWord('WHERE')) {
      where = this.parseWhere();
    }

    // GROUP BY
    if (this.matchWords('GROUP', 'BY')) {
      groupBy = this.parseGroupBy();
    }

    // HAVING
    if (this.isWord('HAVING')) {
      having = this.parseHaving();
    }

    // ORDER BY
    if (this.matchWords('ORDER', 'BY')) {
      orderBy = this.parseOrderBy();
    }

    // UNION [ALL] / EXCEPT / INTERSECT
    let union: { token: Token; all?: Token; select: SelectNode } | undefined;
    if (this.isWord('UNION') || this.isWord('EXCEPT') || this.isWord('INTERSECT')) {
      const token = this.advance();
      let all: Token | undefined;
      if (this.isWord('ALL')) {
        all = this.advance();
      }
      const select = this.parseSelect();
      union = { token, all, select };
    }

    return {
      type: 'select',
      selectToken,
      distinct,
      top,
      columns,
      into,
      from,
      where,
      groupBy,
      having,
      orderBy,
      union,
    };
  }

  private parseSelectColumns(): SqlNode[] {
    const columns: SqlNode[] = [];
    columns.push(this.parseSelectItem());

    while (this.isType(TokenType.Comma)) {
      this.advanceComma();
      columns.push(this.parseSelectItem());
    }

    return columns;
  }

  private parseSelectItem(): SqlNode {
    const expr = this.parseExpression();

    // Check for alias: AS name, or just a bare name
    if (this.isWord('AS')) {
      const asToken = this.advance();
      const aliasName = this.advance();
      if (expr.type === 'identifier') {
        return { ...expr, alias: { asToken, name: aliasName } };
      }
      // Wrap expression with alias
      return {
        type: 'identifier',
        parts: [],
        alias: { asToken, name: aliasName },
        // Store the original expression — we'll recover it during formatting
        _expression: expr,
      } as any;
    }

    // Bare alias (no AS keyword): only if next token is a word and not a keyword
    if (this.isWord() && !this.isClauseKeyword() && !this.isType(TokenType.Comma)) {
      const name = this.advance();
      if (expr.type === 'identifier') {
        return { ...expr, alias: { name } };
      }
      return {
        type: 'identifier',
        parts: [],
        alias: { name },
        _expression: expr,
      } as any;
    }

    return expr;
  }

  private isClauseKeyword(): boolean {
    const val = this.current().value.toUpperCase();
    return ['FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'INTO', 'UNION',
            'EXCEPT', 'INTERSECT', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL',
            'CROSS', 'ON', 'SET', 'VALUES', 'END', 'ELSE', 'WHEN', 'THEN',
            'AS', 'GO', 'BEGIN', 'IF', 'WHILE', 'DECLARE', 'PRINT', 'RETURN', 'EXEC',
            'EXECUTE', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP',
            'TRUNCATE', 'WITH', 'FOR', 'PIVOT', 'UNPIVOT'].includes(val);
  }

  // --- FROM / JOIN ---

  private parseTableSource(): SqlNode {
    const table = this.parseTableReference();

    // Check for PIVOT/UNPIVOT after table reference
    if (this.isWord('PIVOT') || this.isWord('UNPIVOT')) {
      const pivot = this.parsePivot();
      if (table.type === 'parenGroup' || table.type === 'identifier') {
        return { ...table, pivot } as any;
      }
    }

    return table;
  }

  private parsePivot(): PivotNode {
    const pivotToken = this.advance(); // PIVOT or UNPIVOT

    // Expect opening paren
    if (this.isType(TokenType.LeftParen)) this.advance();

    // Parse aggregation expression (e.g., SUM(Amount)) or value column for UNPIVOT
    const aggregation = this.parseExpression();

    // FOR keyword
    const forToken = this.expectWord('FOR');

    // Pivot column
    const pivotColumn = this.parseQualifiedName();

    // IN keyword
    const inToken = this.expectWord('IN');

    // Parse IN (...) values list
    const values: SqlNode[] = [];
    if (this.isType(TokenType.LeftParen)) {
      this.advance(); // (
      if (!this.isType(TokenType.RightParen)) {
        values.push(this.parseExpression());
        while (this.isType(TokenType.Comma)) {
          const commaToken = this.advance();
          // Transfer trailing comment from comma to preceding value
          if (commaToken.trailingComment && values.length > 0) {
            (values[values.length - 1] as any)._trailingComment = commaToken.trailingComment;
          }
          if (this.isType(TokenType.RightParen)) break; // trailing comma
          values.push(this.parseExpression());
        }
      }
      if (this.isType(TokenType.RightParen)) this.advance(); // )
    }

    // Closing paren of PIVOT(...)
    if (this.isType(TokenType.RightParen)) this.advance();

    // Optional alias
    let alias: { asToken?: Token; name: Token } | undefined;
    if (this.isWord('AS')) {
      const asToken = this.advance();
      const name = this.advance();
      alias = { asToken, name };
    } else if ((this.isWord() || this.isType(TokenType.QuotedIdentifier)) && !this.isClauseKeyword() && !this.isJoinKeyword()) {
      const name = this.advance();
      alias = { name };
    }

    return { type: 'pivot', pivotToken, aggregation, forToken, pivotColumn, inToken, values, alias };
  }

  private parseTableReference(): SqlNode {
    let node: SqlNode;

    if (this.isType(TokenType.LeftParen)) {
      // Subquery or derived table
      this.advance(); // (
      if (this.isWord('SELECT')) {
        const subquery = this.parseSelect();
        let closeComments: Token[] | undefined;
        if (this.isType(TokenType.RightParen)) {
          const rp = this.advance();
          if (rp.leadingComments?.length) closeComments = rp.leadingComments;
        }
        const pg: ParenGroupNode = { type: 'parenGroup', inner: [subquery] };
        if (closeComments) pg.closeComments = closeComments;
        node = pg;
      } else {
        const inner = this.parseExpressionList();
        let closeComments: Token[] | undefined;
        if (this.isType(TokenType.RightParen)) {
          const rp = this.advance();
          if (rp.leadingComments?.length) closeComments = rp.leadingComments;
        }
        const pg: ParenGroupNode = { type: 'parenGroup', inner };
        if (closeComments) pg.closeComments = closeComments;
        node = pg;
      }
    } else {
      const name = this.parseQualifiedName();
      // Table-valued function call: OPENJSON(...), STRING_SPLIT(...), etc.
      if (this.isType(TokenType.LeftParen) && name.type === 'identifier') {
        this.advance(); // (
        const args: SqlNode[] = [];
        if (!this.isType(TokenType.RightParen)) {
          args.push(this.parseExpression());
          while (this.isType(TokenType.Comma)) {
            this.advanceComma();
            args.push(this.parseExpression());
          }
        }
        let tvfCloseComments: Token[] | undefined;
        if (this.isType(TokenType.RightParen)) {
          const rp = this.advance();
          if (rp.leadingComments?.length) tvfCloseComments = rp.leadingComments;
        }
        const tvfNode: FunctionCallNode = { type: 'functionCall', name, args };
        if (tvfCloseComments) tvfNode.closeComments = tvfCloseComments;
        node = tvfNode;
      } else {
        node = name;
      }
    }

    // Table alias
    if (this.isWord('AS')) {
      const asToken = this.advance();
      const aliasName = this.advance();
      if (node.type === 'identifier' || node.type === 'parenGroup' || node.type === 'functionCall') {
        return { ...node, alias: { asToken, name: aliasName } };
      }
    } else if ((this.isWord() || this.isType(TokenType.QuotedIdentifier)) && !this.isClauseKeyword() && !this.isJoinKeyword()) {
      const name = this.advance();
      if (node.type === 'identifier' || node.type === 'parenGroup' || node.type === 'functionCall') {
        return { ...node, alias: { name } };
      }
    }

    return node;
  }

  private isJoinKeyword(): boolean {
    const val = this.current().value.toUpperCase();
    if (val === 'JOIN') return true;
    if (['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'].includes(val)) {
      // Look ahead for JOIN, OUTER JOIN, or APPLY
      let i = 1;
      if (this.isWordAt(i, 'OUTER')) i++;
      return this.isWordAt(i, 'JOIN') || this.isWordAt(i, 'APPLY');
    }
    // OUTER APPLY without CROSS prefix
    if (val === 'OUTER' && this.isWordAt(1, 'APPLY')) return true;
    return false;
  }

  private parseJoin(): JoinNode {
    const joinKeywords: Token[] = [];

    // Collect join type keywords (JOIN or APPLY terminates the keyword sequence)
    while (this.isWord() && ['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'JOIN', 'APPLY'].includes(this.current().value.toUpperCase())) {
      joinKeywords.push(this.advance());
      const lastKw = joinKeywords[joinKeywords.length - 1].value.toUpperCase();
      if (lastKw === 'JOIN' || lastKw === 'APPLY') break;
    }

    const table = this.parseTableReference();

    let on: { token: Token; condition: SqlNode } | undefined;
    if (this.isWord('ON')) {
      const onToken = this.advance();
      const condition = this.parseExpression();
      on = { token: onToken, condition };
    }

    return { type: 'join', joinKeywords, table, on };
  }

  // --- WHERE / GROUP BY / ORDER BY / HAVING ---

  private parseWhere(): WhereNode {
    const token = this.advance(); // WHERE
    const condition = this.parseExpression();
    return { type: 'where', token, condition };
  }

  private parseGroupBy(): GroupByNode {
    const tokens = [this.advance(), this.advance()]; // GROUP, BY
    const items: SqlNode[] = [];
    items.push(this.parseExpression());
    while (this.isType(TokenType.Comma)) {
      this.advanceComma();
      items.push(this.parseExpression());
    }
    return { type: 'groupBy', tokens, items };
  }

  private parseOrderBy(): OrderByNode {
    const tokens = [this.advance(), this.advance()]; // ORDER, BY
    const items: { expr: SqlNode; direction?: Token }[] = [];

    const parseItem = () => {
      const expr = this.parseExpression();
      let direction: Token | undefined;
      if (this.isWord('ASC') || this.isWord('DESC')) {
        direction = this.advance();
      }
      items.push({ expr, direction });
    };

    parseItem();
    while (this.isType(TokenType.Comma)) {
      this.advanceComma();
      parseItem();
    }

    let offset: OrderByNode['offset'];
    let fetch: OrderByNode['fetch'];

    if (this.isWord('OFFSET')) {
      const keyword = this.advance();
      const value = this.parseExpression();
      const rowsToken = (this.isWord('ROW') || this.isWord('ROWS')) ? this.advance() : keyword;
      offset = { keyword, value, rowsToken };

      if (this.isWord('FETCH')) {
        const fetchToken = this.advance();
        const nextToken = (this.isWord('NEXT') || this.isWord('FIRST')) ? this.advance() : fetchToken;
        const fetchValue = this.parseExpression();
        const fetchRowsToken = (this.isWord('ROW') || this.isWord('ROWS')) ? this.advance() : fetchToken;
        const onlyToken = this.isWord('ONLY') ? this.advance() : fetchToken;
        fetch = { fetchToken, nextToken, value: fetchValue, rowsToken: fetchRowsToken, onlyToken };
      }
    }

    return { type: 'orderBy', tokens, items, offset, fetch };
  }

  private parseHaving(): HavingNode {
    const token = this.advance(); // HAVING
    const condition = this.parseExpression();
    return { type: 'having', token, condition };
  }

  // --- INSERT / UPDATE / DELETE ---

  private parseInsert(): InsertNode {
    const insertToken = this.advance(); // INSERT
    let intoToken: Token | undefined;
    if (this.isWord('INTO')) {
      intoToken = this.advance();
    }
    const target = this.parseQualifiedName();

    let columns: SqlNode[] | undefined;
    if (this.isType(TokenType.LeftParen)) {
      this.advance();
      columns = [];
      columns.push(this.parseQualifiedName());
      while (this.isType(TokenType.Comma)) {
        this.advanceComma();
        columns.push(this.parseQualifiedName());
      }
      if (this.isType(TokenType.RightParen)) this.advance();
    }

    let values: InsertNode['values'];
    let select: SelectNode | undefined;

    if (this.isWord('VALUES')) {
      const valToken = this.advance();
      const rows: { openParen: Token; values: SqlNode[] }[] = [];
      do {
        if (this.isType(TokenType.LeftParen)) {
          const openParen = this.advance();
          const row: SqlNode[] = [];
          row.push(this.parseExpression());
          while (this.isType(TokenType.Comma)) {
            const commaToken = this.advance();
            // Skip trailing comma before )
            if (this.isType(TokenType.RightParen)) {
              // Transfer comment from trailing comma to last value
              if (commaToken.trailingComment && row.length > 0) {
                (row[row.length - 1] as any)._trailingComment = commaToken.trailingComment;
              }
              break;
            }
            // Transfer trailing comment from comma to preceding value
            if (commaToken.trailingComment && row.length > 0) {
              (row[row.length - 1] as any)._trailingComment = commaToken.trailingComment;
            }
            row.push(this.parseExpression());
          }
          if (this.isType(TokenType.RightParen)) this.advance();
          rows.push({ openParen, values: row });
        }
      } while (this.isType(TokenType.Comma) && this.advanceComma());
      values = { token: valToken, rows };
    } else if (this.isWord('SELECT')) {
      select = this.parseSelect();
    }

    let exec: SqlNode | undefined;
    if (this.isWord('EXEC') || this.isWord('EXECUTE')) {
      exec = this.parseExec();
    }

    return { type: 'insert', insertToken, intoToken, target, columns, values, select, exec };
  }

  private parseUpdate(): UpdateNode {
    const updateToken = this.advance(); // UPDATE
    const target = this.parseQualifiedName();
    const setToken = this.expectWord('SET');
    const assignments: { column: SqlNode; value: SqlNode }[] = [];

    const parseAssignment = () => {
      const column = this.parseQualifiedName();
      this.expectType(TokenType.Equals);
      const value = this.parseExpression();
      assignments.push({ column, value });
    };

    parseAssignment();
    while (this.isType(TokenType.Comma)) {
      this.advanceComma();
      parseAssignment();
    }

    let from: { token: Token; source: SqlNode; joins: JoinNode[] } | undefined;
    if (this.isWord('FROM')) {
      const fromToken = this.advance();
      const source = this.parseTableSource();
      const joins: JoinNode[] = [];
      while (this.isJoinKeyword()) joins.push(this.parseJoin());
      from = { token: fromToken, source, joins };
    }

    let where: WhereNode | undefined;
    if (this.isWord('WHERE')) where = this.parseWhere();

    return { type: 'update', updateToken, target, setToken, assignments, from, where };
  }

  private parseDelete(): DeleteNode {
    const deleteToken = this.advance(); // DELETE
    let fromToken: Token | undefined;
    if (this.isWord('FROM')) fromToken = this.advance();
    const target = this.parseQualifiedName();
    let where: WhereNode | undefined;
    if (this.isWord('WHERE')) where = this.parseWhere();
    return { type: 'delete', deleteToken, fromToken, target, where };
  }

  // --- CTE ---

  private looksLikeCTE(): boolean {
    // WITH name AS ( ... simplistic check
    // Look for WITH <word> AS
    return this.isWordAt(0, 'WITH') &&
           (this.peek(1).type === TokenType.Word || this.peek(1).type === TokenType.QuotedIdentifier) &&
           (this.isWordAt(2, 'AS') || this.peek(2).type === TokenType.LeftParen);
  }

  private parseCTE(): CteNode {
    const withToken = this.advance(); // WITH
    const ctes: { name: Token; columns?: Token[]; asToken: Token; query: SqlNode }[] = [];

    const parseSingleCTE = () => {
      const name = this.advance();
      let columns: Token[] | undefined;
      if (this.isType(TokenType.LeftParen) && !this.isWordAt(-1, 'AS')) {
        // Column list before AS
        this.advance();
        columns = [];
        while (!this.isEOF() && !this.isType(TokenType.RightParen)) {
          if (this.isType(TokenType.Comma)) { this.advanceComma(); continue; }
          columns.push(this.advance());
        }
        if (this.isType(TokenType.RightParen)) this.advance();
      }
      const asToken = this.expectWord('AS');
      let query: SqlNode;
      if (this.isType(TokenType.LeftParen)) {
        this.advance(); // (
        query = this.parseSelect();
        if (this.isType(TokenType.RightParen)) this.advance();
      } else {
        query = this.parseSelect();
      }
      ctes.push({ name, columns, asToken, query });
    };

    parseSingleCTE();
    while (this.isType(TokenType.Comma)) {
      this.advanceComma();
      parseSingleCTE();
    }

    const statement = this.parseStatement() || { type: 'rawToken', token: withToken } as RawTokenNode;
    return { type: 'cte', withToken, ctes, statement };
  }

  // --- Control flow ---

  private parseBeginEnd(): BeginEndNode | TryCatchNode {
    // Check for BEGIN TRY
    if (this.peek(1).type === TokenType.Word &&
        this.peek(1).value.toUpperCase() === 'TRY') {
      return this.parseTryCatch();
    }

    const beginToken = this.advance(); // BEGIN
    // Check for BEGIN CATCH (standalone, without preceding TRY — shouldn't normally happen but handle gracefully)
    let modifier: Token | undefined;
    if (this.isWord('CATCH')) {
      modifier = this.advance();
    }

    const statements: SqlNode[] = [];

    while (!this.isEOF() && !this.isWord('END')) {
      if (this.isType(TokenType.Semicolon)) {
        if (statements.length > 0) {
          (statements[statements.length - 1] as any)._hasSemicolon = true;
        }
        const semi = this.advance();
        if (semi.trailingComment && statements.length > 0) {
          (statements[statements.length - 1] as any)._semicolonTrailingComment = semi.trailingComment;
          semi.trailingComment = undefined;
        }
        this.transferComments(semi);
        continue;
      }
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
      else break;
    }

    const endToken = this.isWord('END') ? this.advance() : beginToken;
    let endModifier: Token | undefined;
    if (modifier && (this.isWord('CATCH') || this.isWord('TRY'))) {
      endModifier = this.advance();
    }
    const node: BeginEndNode = { type: 'beginEnd', beginToken, statements, endToken };
    if (modifier) node.modifier = modifier;
    if (endModifier) node.endModifier = endModifier;
    return node;
  }

  private parseTryCatch(): TryCatchNode {
    // Parse BEGIN TRY block
    const tryBlock = this.parseBeginTryOrCatch('TRY');

    // Parse BEGIN CATCH block
    let catchBlock: BeginEndNode;
    if (this.isWord('BEGIN') &&
        this.peek(1).type === TokenType.Word &&
        this.peek(1).value.toUpperCase() === 'CATCH') {
      catchBlock = this.parseBeginTryOrCatch('CATCH');
    } else {
      // Malformed: no CATCH block found, create an empty one
      const fakeToken = tryBlock.endToken;
      catchBlock = { type: 'beginEnd', beginToken: fakeToken, statements: [], endToken: fakeToken };
    }

    return { type: 'tryCatch', tryBlock, catchBlock };
  }

  private parseBeginTryOrCatch(kind: 'TRY' | 'CATCH'): BeginEndNode {
    const beginToken = this.advance(); // BEGIN
    const modifier = this.advance();   // TRY or CATCH
    const statements: SqlNode[] = [];

    while (!this.isEOF() && !this.isWord('END')) {
      if (this.isType(TokenType.Semicolon)) {
        if (statements.length > 0) {
          (statements[statements.length - 1] as any)._hasSemicolon = true;
        }
        const semi = this.advance();
        if (semi.trailingComment && statements.length > 0) {
          (statements[statements.length - 1] as any)._semicolonTrailingComment = semi.trailingComment;
          semi.trailingComment = undefined;
        }
        this.transferComments(semi);
        continue;
      }
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
      else break;
    }

    const endToken = this.isWord('END') ? this.advance() : beginToken;
    let endModifier: Token | undefined;
    if (this.isWord(kind)) {
      endModifier = this.advance();
    }
    return { type: 'beginEnd', beginToken, modifier, statements, endToken, endModifier };
  }

  private parseIfElse(): IfElseNode {
    const ifToken = this.advance(); // IF
    const condition = this.parseExpression();
    const thenStatement = this.parseStatement() || { type: 'rawToken', token: ifToken } as RawTokenNode;

    let elseClause: { elseToken: Token; statement: SqlNode } | undefined;
    if (this.isWord('ELSE')) {
      const elseToken = this.advance();
      const statement = this.parseStatement() || { type: 'rawToken', token: elseToken } as RawTokenNode;
      elseClause = { elseToken, statement };
    }

    return { type: 'ifElse', ifToken, condition, thenStatement, elseClause };
  }

  private parseWhile(): SqlNode {
    const whileToken = this.advance(); // WHILE
    const condition = this.parseExpression();
    const body = this.parseStatement() || { type: 'rawToken', token: whileToken } as RawTokenNode;
    return {
      type: 'ifElse',
      ifToken: whileToken,
      condition,
      thenStatement: body,
    } as IfElseNode;
  }

  // --- DECLARE / SET / PRINT ---

  private parseDeclare(): DeclareNode | DeclareCursorNode {
    // Check for DECLARE cursor_name CURSOR or DECLARE cursor_name INSENSITIVE/SCROLL CURSOR
    if (this.looksLikeDeclareCursor()) {
      return this.parseDeclareCursor();
    }

    const token = this.advance(); // DECLARE
    const variables: DeclareNode['variables'] = [];

    const parseVar = () => {
      const name = this.advance(); // @var
      let asToken: Token | undefined;
      if (this.isWord('AS')) {
        asToken = this.advance();
      }
      // TABLE variable: DECLARE @t [AS] TABLE (columns...)
      if (this.isWord('TABLE') && this.peek(1).type === TokenType.LeftParen) {
        const dataType: SqlNode = { type: 'identifier', parts: [this.advance()] } as IdentifierNode; // TABLE
        const tableColumns: any[] = [];
        this.advance(); // (
        while (!this.isEOF() && !this.isType(TokenType.RightParen)) {
          if (this.isType(TokenType.Comma)) { this.advanceComma(); continue; }
          if (this.isWord('CONSTRAINT') || this.isWord('PRIMARY') || this.isWord('FOREIGN') ||
              this.isWord('UNIQUE') || this.isWord('CHECK')) {
            tableColumns.push(this.parseTableConstraint());
          } else {
            tableColumns.push(this.parseColumnDef());
          }
        }
        let tableCloseParen: Token | undefined;
        if (this.isType(TokenType.RightParen)) tableCloseParen = this.advance();
        variables.push({ name, asToken, dataType, tableColumns, tableCloseParen });
        return;
      }
      const dataType = this.parseDataType();
      let defaultVal: SqlNode | undefined;
      if (this.isType(TokenType.Equals)) {
        this.advance();
        defaultVal = this.parseExpression();
      }
      variables.push({ name, asToken, dataType, default: defaultVal });
    };

    parseVar();
    while (this.isType(TokenType.Comma)) {
      this.advanceComma();
      parseVar();
    }

    return { type: 'declare', token, variables };
  }

  private parseSet(): SetNode | SetCursorNode {
    const token = this.advance(); // SET

    // Special forms: SET NOCOUNT ON/OFF, SET ANSI_NULLS ON/OFF, etc.
    // These SET options take a value directly (no = sign).
    // Special forms: SET NOCOUNT ON/OFF, SET ANSI_NULLS ON/OFF, etc.
    // These SET options take a value directly (no = sign).
    const setOption = this.current().value.toUpperCase();
    if (['NOCOUNT', 'NOEXEC', 'PARSEONLY', 'FMTONLY',
         'ANSI_DEFAULTS', 'ANSI_NULLS', 'ANSI_NULL_DFLT_OFF', 'ANSI_NULL_DFLT_ON',
         'ANSI_PADDING', 'ANSI_WARNINGS', 'ARITHABORT', 'ARITHIGNORE',
         'CONCAT_NULL_YIELDS_NULL', 'CURSOR_CLOSE_ON_COMMIT', 'NUMERIC_ROUNDABORT',
         'QUOTED_IDENTIFIER', 'IMPLICIT_TRANSACTIONS', 'REMOTE_PROC_TRANSACTIONS',
         'XACT_ABORT', 'FORCEPLAN',
         'SHOWPLAN_ALL', 'SHOWPLAN_TEXT', 'SHOWPLAN_XML',
         'DATEFIRST', 'DATEFORMAT', 'DEADLOCK_PRIORITY',
         'LANGUAGE', 'LOCK_TIMEOUT', 'ROWCOUNT', 'TEXTSIZE',
         'QUERY_GOVERNOR_COST_LIMIT', 'FIPS_FLAGGER',
        ].includes(setOption)) {
      const target: SqlNode = { type: 'identifier', parts: [this.advance()] } as IdentifierNode;
      const value: SqlNode = this.isWord() ?
        { type: 'identifier', parts: [this.advance()] } as IdentifierNode :
        this.parseExpression();
      return { type: 'set', token, target, value, isSpecial: true };
    }

    // SET STATISTICS {IO|XML|TIME|PROFILE} ON/OFF
    if (setOption === 'STATISTICS') {
      const parts = [this.advance()]; // STATISTICS
      if (this.isWord()) parts.push(this.advance()); // IO, XML, TIME, PROFILE
      const target: SqlNode = { type: 'identifier', parts } as IdentifierNode;
      const value: SqlNode = this.isWord() ?
        { type: 'identifier', parts: [this.advance()] } as IdentifierNode :
        this.parseExpression();
      return { type: 'set', token, target, value, isSpecial: true };
    }

    // SET TRANSACTION ISOLATION LEVEL {level}
    if (setOption === 'TRANSACTION') {
      const parts = [this.advance()]; // TRANSACTION
      // Consume ISOLATION LEVEL if present
      if (this.isWord('ISOLATION')) {
        parts.push(this.advance()); // ISOLATION
        if (this.isWord('LEVEL')) parts.push(this.advance()); // LEVEL
      }
      const target: SqlNode = { type: 'identifier', parts } as IdentifierNode;
      // Value may be multi-word: READ UNCOMMITTED, READ COMMITTED, REPEATABLE READ
      const valueParts = [this.advance()];
      if (this.isWord() && !this.isStatementStart()) valueParts.push(this.advance());
      const value: SqlNode = { type: 'identifier', parts: valueParts } as IdentifierNode;
      return { type: 'set', token, target, value, isSpecial: true };
    }

    // SET IDENTITY_INSERT schema.table ON/OFF — table is a qualified name
    if (setOption === 'IDENTITY_INSERT') {
      const target: SqlNode = { type: 'identifier', parts: [this.advance()] } as IdentifierNode;
      const tableName = this.parseQualifiedName();
      const onOff: SqlNode = this.isWord() ?
        { type: 'identifier', parts: [this.advance()] } as IdentifierNode :
        this.parseExpression();
      return { type: 'set', token, target, value: onOff, isSpecial: true, tableName } as any;
    }

    const target = this.parseQualifiedName();
    if (this.isType(TokenType.Equals)) {
      this.advance();
    }

    // SET @cursor_var = CURSOR ... FOR SELECT
    if (this.isWord('CURSOR')) {
      return this.parseSetCursor(token, target);
    }

    const value = this.parseExpression();
    return { type: 'set', token, target, value };
  }

  private parseUse(): UseNode {
    const token = this.advance(); // USE
    const database = this.parseExpression();
    return { type: 'use', token, database };
  }

  private parsePrint(): PrintNode {
    const token = this.advance(); // PRINT
    const expression = this.parseExpression();
    return { type: 'print', token, expression };
  }

  private parseReturn(): ReturnNode {
    const token = this.advance(); // RETURN
    let expression: SqlNode | undefined;
    if (!this.isStatementEnd()) {
      expression = this.parseExpression();
    }
    return { type: 'return', token, expression };
  }

  private parseThrow(): ThrowNode {
    const token = this.advance(); // THROW
    // THROW with no arguments = re-throw in CATCH block
    if (this.isStatementEnd() || this.isType(TokenType.Semicolon)) {
      return { type: 'throw', token };
    }
    const errorNumber = this.parseExpression();
    let message: SqlNode | undefined;
    let state: SqlNode | undefined;
    if (this.isType(TokenType.Comma)) {
      this.advanceComma();
      message = this.parseExpression();
    }
    if (this.isType(TokenType.Comma)) {
      this.advanceComma();
      state = this.parseExpression();
    }
    return { type: 'throw', token, errorNumber, message, state };
  }

  private parseRaiserror(): RaiserrorNode {
    const token = this.advance(); // RAISERROR
    const args: SqlNode[] = [];
    // Expect opening paren
    if (this.isType(TokenType.LeftParen)) {
      this.advance(); // consume (
      // Parse comma-separated arguments
      while (!this.isEOF() && !this.isType(TokenType.RightParen)) {
        args.push(this.parseExpression());
        if (this.isType(TokenType.Comma)) {
          this.advanceComma();
        }
      }
      if (this.isType(TokenType.RightParen)) {
        this.advance(); // consume )
      }
    }
    // Parse optional WITH clause
    let withOptions: Token[] | undefined;
    if (this.isWord('WITH')) {
      withOptions = [this.advance()]; // WITH
      // Parse option keywords (LOG, NOWAIT, SETERROR)
      while (!this.isEOF() && !this.isStatementEnd() && !this.isType(TokenType.Semicolon)) {
        withOptions.push(this.advance());
        if (this.isType(TokenType.Comma)) {
          withOptions.push(this.advance()); // consume comma between options
        } else {
          break;
        }
      }
    }
    return { type: 'raiserror', token, args, withOptions };
  }

  private parseExec(): SqlNode {
    const token = this.advance(); // EXEC/EXECUTE
    // Consume until statement end or the start of another statement
    const extra: Token[] = [];
    while (!this.isEOF() && !this.isStatementEnd() && !this.isType(TokenType.Semicolon) && !this.isStatementStart()) {
      extra.push(this.advance());
    }
    const node: RawTokenNode = { type: 'rawToken', token };
    if (extra.length > 0) node.extraTokens = extra;
    return node;
  }

  /** Check if the current token looks like the start of a new statement. */
  private isStatementStart(): boolean {
    if (this.current().type !== TokenType.Word) return false;
    const upper = this.current().value.toUpperCase();
    switch (upper) {
      case 'SELECT': case 'INSERT': case 'UPDATE': case 'DELETE':
      case 'CREATE': case 'ALTER': case 'DROP': case 'TRUNCATE':
      case 'DECLARE': case 'SET': case 'PRINT': case 'RETURN': case 'THROW': case 'RAISERROR': case 'USE':
      case 'IF': case 'WHILE': case 'BEGIN': case 'WITH':
      case 'EXEC': case 'EXECUTE':
      case 'OPEN': case 'CLOSE': case 'DEALLOCATE': case 'FETCH':
        return true;
      default:
        return false;
    }
  }

  private parseDrop(): SqlNode {
    const keywords: Token[] = [];
    keywords.push(this.advance()); // DROP

    if (this.isWord('TABLE')) {
      keywords.push(this.advance()); // TABLE

      // IF EXISTS
      if (this.isWord('IF')) {
        keywords.push(this.advance()); // IF
        if (this.isWord('EXISTS')) {
          keywords.push(this.advance()); // EXISTS
        }
      }

      const name = this.parseQualifiedName();
      return { type: 'dropTable', keywords, name } as DropTableNode;
    }

    // Fallback for other DROP statements (DROP INDEX, DROP VIEW, etc.)
    return this.consumeRestAsRaw(keywords);
  }

  private parseTruncate(): SqlNode {
    const keywords: Token[] = [];
    keywords.push(this.advance()); // TRUNCATE

    if (this.isWord('TABLE')) {
      keywords.push(this.advance()); // TABLE
      const name = this.parseQualifiedName();
      return { type: 'dropTable', keywords, name } as DropTableNode;
    }

    return this.consumeRestAsRaw(keywords);
  }

  // --- Expressions ---

  parseExpression(): SqlNode {
    return this.parseOr();
  }

  private parseOr(): SqlNode {
    let left = this.parseAnd();
    while (this.isWord('OR')) {
      const op = this.advance();
      const right = this.parseAnd();
      left = { type: 'expression', left, operator: op, right } as ExpressionNode;
    }
    return left;
  }

  private parseAnd(): SqlNode {
    let left = this.parseNot();
    while (this.isWord('AND') && !this.looksLikeBetweenAnd()) {
      const op = this.advance();
      const right = this.parseNot();
      left = { type: 'expression', left, operator: op, right } as ExpressionNode;
    }
    return left;
  }

  /** Try to detect if AND is part of BETWEEN ... AND ... */
  private looksLikeBetweenAnd(): boolean {
    // Walk back through the AST is complex — use a simpler heuristic:
    // This is set by parseBetween to prevent consuming the AND
    return this._inBetween;
  }
  private _inBetween = false;

  private parseNot(): SqlNode {
    if (this.isWord('NOT')) {
      const notToken = this.advance();
      // NOT EXISTS
      if (this.isWord('EXISTS')) {
        const existsToken = this.advance();
        let subquery: SqlNode;
        if (this.isType(TokenType.LeftParen)) {
          this.advance();
          subquery = this.parseSelect();
          if (this.isType(TokenType.RightParen)) this.advance();
        } else {
          subquery = this.parseAtom();
        }
        return { type: 'exists', notToken, existsToken, subquery } as ExistsNode;
      }
      const expr = this.parseComparison();
      return { type: 'expression', left: { type: 'rawToken', token: notToken } as RawTokenNode, operator: notToken, right: expr } as ExpressionNode;
    }
    return this.parseComparison();
  }

  private parseComparison(): SqlNode {
    let left = this.parseAddSub();

    // IN
    if (this.isWord('IN') || (this.isWord('NOT') && this.isWordAt(1, 'IN'))) {
      let notToken: Token | undefined;
      if (this.isWord('NOT')) notToken = this.advance();
      const inToken = this.advance(); // IN
      const values: SqlNode[] = [];
      if (this.isType(TokenType.LeftParen)) {
        this.advance(); // (
        if (this.isWord('SELECT')) {
          // Subquery
          values.push(this.parseSelect());
        } else {
          values.push(this.parseExpression());
          while (this.isType(TokenType.Comma)) {
            this.advanceComma();
            values.push(this.parseExpression());
          }
        }
        if (this.isType(TokenType.RightParen)) this.advance();
      }
      return { type: 'inExpression', expression: left, notToken, inToken, values } as InExpressionNode;
    }

    // BETWEEN
    if (this.isWord('BETWEEN') || (this.isWord('NOT') && this.isWordAt(1, 'BETWEEN'))) {
      let notToken: Token | undefined;
      if (this.isWord('NOT')) notToken = this.advance();
      const betweenToken = this.advance(); // BETWEEN
      this._inBetween = true;
      const low = this.parseAddSub();
      this._inBetween = false;
      const andToken = this.expectWord('AND');
      const high = this.parseAddSub();
      return { type: 'between', expression: left, notToken, betweenToken, low, andToken, high } as BetweenNode;
    }

    // LIKE
    if (this.isWord('LIKE') || (this.isWord('NOT') && this.isWordAt(1, 'LIKE'))) {
      let op: Token;
      if (this.isWord('NOT')) {
        const notT = this.advance();
        op = this.advance(); // LIKE
        op = { ...op, value: 'NOT ' + op.value };
      } else {
        op = this.advance();
      }
      const right = this.parseAddSub();
      left = { type: 'expression', left, operator: op, right } as ExpressionNode;
      return left;
    }

    // IS [NOT] NULL
    if (this.isWord('IS')) {
      const op = this.advance();
      if (this.isWord('NOT')) {
        const notT = this.advance();
        const nullT = this.advance(); // NULL
        const right = { type: 'rawToken', token: nullT } as RawTokenNode;
        return { type: 'expression', left, operator: { ...op, value: 'IS NOT' }, right } as ExpressionNode;
      }
      const nullT = this.advance();
      const right = { type: 'rawToken', token: nullT } as RawTokenNode;
      return { type: 'expression', left, operator: op, right } as ExpressionNode;
    }

    // EXISTS
    if (this.isWord('EXISTS')) {
      const existsToken = this.advance();
      let subquery: SqlNode;
      if (this.isType(TokenType.LeftParen)) {
        this.advance();
        subquery = this.parseSelect();
        if (this.isType(TokenType.RightParen)) this.advance();
      } else {
        subquery = this.parseAtom();
      }
      return { type: 'exists', existsToken, subquery } as ExistsNode;
    }

    // Comparison operators: =, <, >, <=, >=, <>, !=
    if (this.isType(TokenType.Equals) || this.isType(TokenType.Operator)) {
      const opVal = this.current().value;
      if (['=', '<', '>', '<=', '>=', '<>', '!='].includes(opVal)) {
        const op = this.advance();
        const right = this.parseAddSub();
        left = { type: 'expression', left, operator: op, right } as ExpressionNode;
      }
    }

    return left;
  }

  private parseAddSub(): SqlNode {
    let left = this.parseMulDiv();
    while (this.isType(TokenType.Operator) && (this.current().value === '+' || this.current().value === '-')) {
      const op = this.advance();
      const right = this.parseMulDiv();
      left = { type: 'expression', left, operator: op, right } as ExpressionNode;
    }
    return left;
  }

  private parseMulDiv(): SqlNode {
    let left = this.parseUnary();
    while (this.isType(TokenType.Operator) && (this.current().value === '*' || this.current().value === '/' || this.current().value === '%')) {
      const op = this.advance();
      const right = this.parseUnary();
      left = { type: 'expression', left, operator: op, right } as ExpressionNode;
    }
    return left;
  }

  private parseUnary(): SqlNode {
    if (this.isType(TokenType.Operator) && (this.current().value === '-' || this.current().value === '+')) {
      const op = this.advance();
      const expr = this.parseAtom();
      return { type: 'expression', left: { type: 'literal', token: { ...op, value: '' } } as LiteralNode, operator: op, right: expr } as ExpressionNode;
    }
    return this.parseAtom();
  }

  parseAtom(): SqlNode {
    // CASE expression
    if (this.isWord('CASE')) {
      return this.parseCase();
    }

    // EXISTS
    if (this.isWord('EXISTS')) {
      const existsToken = this.advance();
      let subquery: SqlNode;
      if (this.isType(TokenType.LeftParen)) {
        this.advance();
        subquery = this.parseSelect();
        if (this.isType(TokenType.RightParen)) this.advance();
      } else {
        subquery = this.parseAtom();
      }
      return { type: 'exists', existsToken, subquery } as ExistsNode;
    }

    // Parenthesized expression or subquery
    if (this.isType(TokenType.LeftParen)) {
      const openParen = this.advance(); // (
      if (this.isWord('SELECT')) {
        const subquery = this.parseSelect();
        let closeComments: Token[] | undefined;
        if (this.isType(TokenType.RightParen)) {
          const rp = this.advance();
          if (rp.leadingComments?.length) closeComments = rp.leadingComments;
        }
        const pg: ParenGroupNode = { type: 'parenGroup', inner: [subquery] };
        if (openParen.leadingComments?.length) pg.openParenComments = openParen.leadingComments;
        if (closeComments) pg.closeComments = closeComments;
        return pg;
      }
      const inner: SqlNode[] = [];
      inner.push(this.parseExpression());
      while (this.isType(TokenType.Comma)) {
        this.advanceComma();
        inner.push(this.parseExpression());
      }
      let closeComments: Token[] | undefined;
      if (this.isType(TokenType.RightParen)) {
        const rp = this.advance();
        if (rp.leadingComments?.length) closeComments = rp.leadingComments;
      }
      if (inner.length === 1) {
        // Mark the expression as having been parenthesized so the formatter
        // can re-emit parens when needed to preserve operator precedence
        (inner[0] as any)._parenthesized = true;
        if (openParen.leadingComments?.length) {
          (inner[0] as any)._parenLeadingComments = openParen.leadingComments;
        }
        return inner[0];
      }
      const pg: ParenGroupNode = { type: 'parenGroup', inner };
      if (openParen.leadingComments?.length) pg.openParenComments = openParen.leadingComments;
      if (closeComments) pg.closeComments = closeComments;
      return pg;
    }

    // NULL keyword
    if (this.isWord('NULL')) {
      return { type: 'literal', token: this.advance() } as LiteralNode;
    }

    // String literal
    if (this.isType(TokenType.StringLiteral)) {
      return { type: 'literal', token: this.advance() } as LiteralNode;
    }

    // Number literal
    if (this.isType(TokenType.NumberLiteral)) {
      return { type: 'literal', token: this.advance() } as LiteralNode;
    }

    // Wildcard: *
    if (this.isType(TokenType.Operator) && this.current().value === '*') {
      return { type: 'literal', token: this.advance() } as LiteralNode;
    }

    // Word or quoted identifier: identifier, function call, or qualified name
    if (this.isWord() || this.isType(TokenType.QuotedIdentifier)) {
      const name = this.parseQualifiedName();
      // Function call?
      if (this.isType(TokenType.LeftParen) && name.type === 'identifier') {
        const funcName = (name as IdentifierNode).parts.map(p => p.value).join('.').toUpperCase();
        const hasAsDataType = ['CAST', 'TRY_CAST', 'PARSE', 'TRY_PARSE', 'CONVERT', 'TRY_CONVERT'].includes(funcName);
        this.advance(); // (
        const args: SqlNode[] = [];
        if (!this.isType(TokenType.RightParen)) {
          // Check for DISTINCT in aggregate functions
          if (this.isWord('DISTINCT')) {
            args.push({ type: 'rawToken', token: this.advance() } as RawTokenNode);
          }
          args.push(this.parseExpression());
          while (this.isType(TokenType.Comma)) {
            this.advanceComma();
            args.push(this.parseExpression());
          }
          // CAST/TRY_CAST/PARSE/TRY_PARSE/TRY_CONVERT: consume AS <datatype>
          if (hasAsDataType && this.isWord('AS')) {
            args.push({ type: 'rawToken', token: this.advance() } as RawTokenNode); // AS
            args.push(this.parseDataType());
          }
        }
        let closeComments: Token[] | undefined;
        if (this.isType(TokenType.RightParen)) {
          const rp = this.advance();
          if (rp.leadingComments?.length) closeComments = rp.leadingComments;
        }
        const fnNode: FunctionCallNode = { type: 'functionCall', name, args };
        if (closeComments) fnNode.closeComments = closeComments;
        // WITHIN GROUP (ORDER BY ...) clause: STRING_AGG(...) WITHIN GROUP (ORDER BY col)
        if (this.isWord('WITHIN') && this.isWordAt(1, 'GROUP')) {
          const withinToken = this.advance(); // WITHIN
          const groupToken = this.advance(); // GROUP
          if (this.isType(TokenType.LeftParen)) {
            this.advance(); // (
            const orderBy = this.parseOrderBy();
            if (this.isType(TokenType.RightParen)) {
              this.advance(); // )
            }
            fnNode.withinGroup = { tokens: [withinToken, groupToken], orderBy };
          }
        }
        // OVER clause: SUM(...) OVER (PARTITION BY ... ORDER BY ...)
        if (this.isWord('OVER')) {
          fnNode.overClause = this.parseOverClause();
        }
        return fnNode;
      }
      return name;
    }

    // Fallback
    return { type: 'rawToken', token: this.advance() } as RawTokenNode;
  }

  // --- OVER clause ---

  private parseOverClause(): SqlNode {
    const overToken = this.advance(); // OVER
    if (!this.isType(TokenType.LeftParen)) {
      return { type: 'rawToken', token: overToken } as RawTokenNode;
    }
    this.advance(); // (
    const inner: SqlNode[] = [];
    // Store OVER keyword as first element
    inner.push({ type: 'rawToken', token: overToken } as RawTokenNode);

    while (!this.isEOF() && !this.isType(TokenType.RightParen)) {
      if (this.isWord('PARTITION') || this.isWord('ORDER')) {
        const keyword = this.advance();
        const byToken = this.isWord('BY') ? this.advance() : undefined;
        const combinedValue = byToken ? keyword.value + ' ' + byToken.value : keyword.value;
        inner.push({ type: 'rawToken', token: { ...keyword, value: combinedValue } } as RawTokenNode);
        // Parse the expression list
        inner.push(this.parseExpression());
        while (this.isType(TokenType.Comma)) {
          this.advanceComma();
          inner.push(this.parseExpression());
        }
      } else if (this.isWord('ROWS') || this.isWord('RANGE') || this.isWord('GROUPS')) {
        // Window frame clause - consume tokens until closing paren
        while (!this.isEOF() && !this.isType(TokenType.RightParen)) {
          inner.push({ type: 'rawToken', token: this.advance() } as RawTokenNode);
        }
      } else {
        inner.push({ type: 'rawToken', token: this.advance() } as RawTokenNode);
      }
    }
    if (this.isType(TokenType.RightParen)) this.advance();
    return { type: 'parenGroup', inner } as ParenGroupNode;
  }

  // --- CASE ---

  private parseCase(): CaseNode {
    const caseToken = this.advance(); // CASE
    let inputExpr: SqlNode | undefined;

    // Simple CASE: CASE expr WHEN ... vs searched CASE: CASE WHEN ...
    if (!this.isWord('WHEN')) {
      inputExpr = this.parseExpression();
    }

    const whenClauses: CaseNode['whenClauses'] = [];
    while (this.isWord('WHEN')) {
      const whenToken = this.advance();
      const condition = this.parseExpression();
      const thenToken = this.expectWord('THEN');
      const result = this.parseExpression();
      whenClauses.push({ whenToken, condition, thenToken, result });
    }

    let elseClause: CaseNode['elseClause'];
    if (this.isWord('ELSE')) {
      const elseToken = this.advance();
      const result = this.parseExpression();
      elseClause = { elseToken, result };
    }

    const endToken = this.expectWord('END');

    return { type: 'case', caseToken, inputExpr, whenClauses, elseClause, endToken };
  }

  // --- Qualified names ---

  private parseQualifiedName(): IdentifierNode {
    const parts: Token[] = [];

    if (this.isWord() || this.isType(TokenType.QuotedIdentifier)) {
      parts.push(this.advance());
    }

    while (this.isType(TokenType.Dot)) {
      this.advance(); // .
      if (this.isWord() || this.isType(TokenType.QuotedIdentifier) || (this.isType(TokenType.Operator) && this.current().value === '*')) {
        parts.push(this.advance());
      }
    }

    return { type: 'identifier', parts };
  }

  // --- Helpers ---

  private parseExpressionList(): SqlNode[] {
    const items: SqlNode[] = [];
    items.push(this.parseExpression());
    while (this.isType(TokenType.Comma)) {
      this.advanceComma();
      items.push(this.parseExpression());
    }
    return items;
  }

  // --- Cursor statements ---

  /**
   * Check if current position is DECLARE cursor_name [INSENSITIVE] [SCROLL] CURSOR
   * vs DECLARE @variable datatype (normal variable declaration).
   * DECLARE CURSOR: name is NOT prefixed with @
   */
  private looksLikeDeclareCursor(): boolean {
    // DECLARE is at pos, peek(1) is cursor name
    const name = this.peek(1);
    if (name.type !== TokenType.Word && name.type !== TokenType.QuotedIdentifier) return false;
    // If name starts with @, it's a variable declaration, not cursor
    if (name.value.startsWith('@')) return false;
    // Check if the next word after name is CURSOR, INSENSITIVE, or SCROLL
    const after = this.peek(2);
    if (after.type !== TokenType.Word) return false;
    const u = after.value.toUpperCase();
    return u === 'CURSOR' || u === 'INSENSITIVE' || u === 'SCROLL';
  }

  private parseDeclareCursor(): DeclareCursorNode {
    const token = this.advance(); // DECLARE
    const name = this.advance();  // cursor_name

    const cursorOptions: Token[] = [];

    // ISO syntax: [INSENSITIVE] [SCROLL] CURSOR
    // T-SQL syntax: CURSOR [LOCAL|GLOBAL] [FORWARD_ONLY|SCROLL] [STATIC|KEYSET|DYNAMIC|FAST_FORWARD] [READ_ONLY|SCROLL_LOCKS|OPTIMISTIC] [TYPE_WARNING]
    const cursorKeywords = new Set([
      'INSENSITIVE', 'SCROLL', 'CURSOR',
      'LOCAL', 'GLOBAL', 'FORWARD_ONLY', 'STATIC', 'KEYSET', 'DYNAMIC', 'FAST_FORWARD',
      'READ_ONLY', 'SCROLL_LOCKS', 'OPTIMISTIC', 'TYPE_WARNING',
    ]);

    while (this.isWord() && cursorKeywords.has(this.current().value.toUpperCase())) {
      cursorOptions.push(this.advance());
      if (cursorOptions[cursorOptions.length - 1].value.toUpperCase() === 'FOR') break;
    }

    const forToken = this.expectWord('FOR');
    const select = this.parseSelect();

    // FOR READ_ONLY | FOR UPDATE [OF col1, col2, ...]
    let forUpdate: DeclareCursorNode['forUpdate'];
    if (this.isWord('FOR') && (this.isWordAt(1, 'UPDATE') || this.isWordAt(1, 'READ_ONLY'))) {
      const forTok = this.advance();
      const actionTok = this.advance(); // UPDATE or READ_ONLY
      let ofColumns: Token[] | undefined;
      if (actionTok.value.toUpperCase() === 'UPDATE' && this.isWord('OF')) {
        this.advance(); // OF
        ofColumns = [];
        ofColumns.push(this.advance());
        while (this.isType(TokenType.Comma)) {
          this.advanceComma();
          ofColumns.push(this.advance());
        }
      }
      forUpdate = { forToken: forTok, actionToken: actionTok, ofColumns };
    }

    return { type: 'declareCursor', token, name, cursorOptions, forToken, select, forUpdate };
  }

  private parseSetCursor(token: Token, target: SqlNode): SetCursorNode {
    const cursorOptions: Token[] = [];

    // CURSOR [LOCAL|GLOBAL] [FORWARD_ONLY|SCROLL] [STATIC|KEYSET|DYNAMIC|FAST_FORWARD] [READ_ONLY|SCROLL_LOCKS|OPTIMISTIC] [TYPE_WARNING]
    const cursorKeywords = new Set([
      'CURSOR', 'LOCAL', 'GLOBAL', 'FORWARD_ONLY', 'SCROLL',
      'STATIC', 'KEYSET', 'DYNAMIC', 'FAST_FORWARD',
      'READ_ONLY', 'SCROLL_LOCKS', 'OPTIMISTIC', 'TYPE_WARNING',
    ]);

    while (this.isWord() && cursorKeywords.has(this.current().value.toUpperCase())) {
      cursorOptions.push(this.advance());
    }

    const forToken = this.expectWord('FOR');
    const select = this.parseSelect();

    // FOR READ_ONLY | FOR UPDATE [OF col1, col2, ...]
    let forUpdate: SetCursorNode['forUpdate'];
    if (this.isWord('FOR') && (this.isWordAt(1, 'UPDATE') || this.isWordAt(1, 'READ_ONLY') || this.isWordAt(1, 'READ'))) {
      const forTok = this.advance();
      let actionTok = this.advance(); // UPDATE, READ_ONLY, or READ
      // Handle "FOR READ ONLY" (two words, no underscore)
      if (actionTok.value.toUpperCase() === 'READ' && this.isWord('ONLY')) {
        this.advance(); // consume ONLY
        actionTok = { ...actionTok, value: 'READ_ONLY' };
      }
      let ofColumns: Token[] | undefined;
      if (actionTok.value.toUpperCase() === 'UPDATE' && this.isWord('OF')) {
        this.advance(); // OF
        ofColumns = [];
        ofColumns.push(this.advance());
        while (this.isType(TokenType.Comma)) {
          this.advanceComma();
          ofColumns.push(this.advance());
        }
      }
      forUpdate = { forToken: forTok, actionToken: actionTok, ofColumns };
    }

    return { type: 'setCursor', token, target, cursorOptions, forToken, select, forUpdate };
  }

  private parseCursorName(): { global?: Token; name: SqlNode } {
    let global: Token | undefined;
    if (this.isWord('GLOBAL')) {
      global = this.advance();
    }
    const name = this.current().value.startsWith('@')
      ? { type: 'identifier', parts: [this.advance()] } as IdentifierNode
      : { type: 'identifier', parts: [this.advance()] } as IdentifierNode;
    return { global, name };
  }

  private parseOpenCursor(): OpenCursorNode {
    const token = this.advance(); // OPEN
    const { global, name } = this.parseCursorName();
    return { type: 'openCursor', token, global, name };
  }

  private parseCloseCursor(): CloseCursorNode {
    const token = this.advance(); // CLOSE
    const { global, name } = this.parseCursorName();
    return { type: 'closeCursor', token, global, name };
  }

  private parseDeallocateCursor(): DeallocateCursorNode {
    const token = this.advance(); // DEALLOCATE
    const { global, name } = this.parseCursorName();
    return { type: 'deallocateCursor', token, global, name };
  }

  private parseFetchCursor(): FetchCursorNode {
    const token = this.advance(); // FETCH

    let orientation: Token | undefined;
    let orientationValue: SqlNode | undefined;
    let fromToken: Token | undefined;

    // Check for orientation keywords
    const upper = this.isWord() ? this.current().value.toUpperCase() : '';
    if (['NEXT', 'PRIOR', 'FIRST', 'LAST', 'ABSOLUTE', 'RELATIVE'].includes(upper)) {
      orientation = this.advance();
      const orientUpper = orientation.value.toUpperCase();
      // ABSOLUTE and RELATIVE take a value (n or @nvar)
      if (orientUpper === 'ABSOLUTE' || orientUpper === 'RELATIVE') {
        orientationValue = this.parseExpression();
      }
      if (this.isWord('FROM')) {
        fromToken = this.advance();
      }
    } else if (this.isWord('FROM')) {
      // FETCH FROM cursor_name (no orientation, just FROM)
      fromToken = this.advance();
    }

    const { global, name } = this.parseCursorName();

    // INTO @var1, @var2, ...
    let into: FetchCursorNode['into'];
    if (this.isWord('INTO')) {
      const intoToken = this.advance();
      const variables: SqlNode[] = [];
      variables.push({ type: 'identifier', parts: [this.advance()] } as IdentifierNode);
      while (this.isType(TokenType.Comma)) {
        this.advanceComma();
        variables.push({ type: 'identifier', parts: [this.advance()] } as IdentifierNode);
      }
      into = { token: intoToken, variables };
    }

    return { type: 'fetchCursor', token, orientation, orientationValue, fromToken, global, name, into };
  }

  private consumeRestAsRaw(initial: Token[]): RawTokenNode {
    // Consume tokens until statement end
    const allTokens = [...initial];
    while (!this.isEOF() && !this.isType(TokenType.BatchSeparator) && !this.isType(TokenType.Semicolon)) {
      allTokens.push(this.advance());
    }
    const node: RawTokenNode = { type: 'rawToken', token: allTokens[0] };
    if (allTokens.length > 1) node.extraTokens = allTokens.slice(1);
    return node;
  }
}
