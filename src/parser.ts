import { Token, TokenType } from './tokens';
import {
  SqlNode, BatchNode, SelectNode, CreateProcedureNode, ProcParameter,
  BeginEndNode, IfElseNode, SetNode, DeclareNode, PrintNode, ReturnNode,
  CaseNode, ExpressionNode, FunctionCallNode, IdentifierNode, LiteralNode,
  RawTokenNode, WhereNode, GroupByNode, OrderByNode, HavingNode, JoinNode,
  InsertNode, UpdateNode, DeleteNode, CteNode, InExpressionNode, BetweenNode,
  ExistsNode, ParenGroupNode, CreateTableNode, ColumnDefNode, DropTableNode,
  PivotNode,
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
        this.advance();
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
      this.advance();
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

    // PRINT
    if (upper === 'PRINT') {
      return this.parsePrint();
    }

    // RETURN
    if (upper === 'RETURN') {
      return this.parseReturn();
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
      if (this.isType(TokenType.Comma)) { this.advance(); continue; }
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

  private parseProcParameter(): ProcParameter {
    const name = this.advance(); // @param
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
    // e.g., VARCHAR(20), INT, DECIMAL(10,2)
    const parts: Token[] = [];
    if (this.isWord()) {
      parts.push(this.advance());
    }

    // Handle precision/scale: (20), (10, 2), (MAX)
    if (this.isType(TokenType.LeftParen)) {
      const innerTokens: SqlNode[] = [];
      this.advance(); // (
      while (!this.isEOF() && !this.isType(TokenType.RightParen)) {
        if (this.isType(TokenType.Comma)) { this.advance(); continue; }
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

    if (this.isType(TokenType.LeftParen)) {
      this.advance(); // (
      while (!this.isEOF() && !this.isType(TokenType.RightParen)) {
        if (this.isType(TokenType.Comma)) { this.advance(); continue; }
        // Constraint or column def
        if (this.isWord('CONSTRAINT') || this.isWord('PRIMARY') || this.isWord('FOREIGN') ||
            this.isWord('UNIQUE') || this.isWord('CHECK')) {
          columns.push(this.parseTableConstraint());
        } else {
          columns.push(this.parseColumnDef());
        }
      }
      if (this.isType(TokenType.RightParen)) this.advance();
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

    return { type: 'createTable', keywords, name, columns, onFilegroup };
  }

  private parseColumnDef(): ColumnDefNode {
    const name = this.advance();

    // Check if the next token is a constraint keyword instead of a data type
    // This indicates a missing data type
    const upper = this.current().type === TokenType.Word ? this.current().value.toUpperCase() : '';
    const isConstraintKeyword = ['NOT', 'NULL', 'DEFAULT', 'IDENTITY', 'PRIMARY', 'UNIQUE', 'CHECK', 'REFERENCES', 'CONSTRAINT'].includes(upper);

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
          this.isWord('CHECK') || this.isWord('REFERENCES') || this.isWord('CONSTRAINT')) {
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
    };
  }

  private parseSelectColumns(): SqlNode[] {
    const columns: SqlNode[] = [];
    columns.push(this.parseSelectItem());

    while (this.isType(TokenType.Comma)) {
      this.advance(); // comma
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
            'AS', 'GO', 'BEGIN', 'IF', 'DECLARE', 'PRINT', 'RETURN', 'EXEC',
            'EXECUTE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP',
            'FOR', 'PIVOT', 'UNPIVOT'].includes(val);
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
          this.advance();
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
        if (this.isType(TokenType.RightParen)) this.advance();
        node = { type: 'parenGroup', inner: [subquery] } as ParenGroupNode;
      } else {
        const inner = this.parseExpressionList();
        if (this.isType(TokenType.RightParen)) this.advance();
        node = { type: 'parenGroup', inner } as ParenGroupNode;
      }
    } else {
      node = this.parseQualifiedName();
    }

    // Table alias
    if (this.isWord('AS')) {
      const asToken = this.advance();
      const aliasName = this.advance();
      if (node.type === 'identifier' || node.type === 'parenGroup') {
        return { ...node, alias: { asToken, name: aliasName } };
      }
    } else if ((this.isWord() || this.isType(TokenType.QuotedIdentifier)) && !this.isClauseKeyword() && !this.isJoinKeyword()) {
      const name = this.advance();
      if (node.type === 'identifier' || node.type === 'parenGroup') {
        return { ...node, alias: { name } };
      }
    }

    return node;
  }

  private isJoinKeyword(): boolean {
    const val = this.current().value.toUpperCase();
    if (val === 'JOIN') return true;
    if (['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'].includes(val)) {
      // Look ahead for JOIN or OUTER JOIN
      let i = 1;
      if (this.isWordAt(i, 'OUTER')) i++;
      return this.isWordAt(i, 'JOIN');
    }
    return false;
  }

  private parseJoin(): JoinNode {
    const joinKeywords: Token[] = [];

    // Collect join type keywords
    while (this.isWord() && ['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'JOIN'].includes(this.current().value.toUpperCase())) {
      joinKeywords.push(this.advance());
      if (joinKeywords[joinKeywords.length - 1].value.toUpperCase() === 'JOIN') break;
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
      this.advance();
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
      this.advance();
      parseItem();
    }

    return { type: 'orderBy', tokens, items };
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
        this.advance();
        columns.push(this.parseQualifiedName());
      }
      if (this.isType(TokenType.RightParen)) this.advance();
    }

    let values: { token: Token; rows: SqlNode[][] } | undefined;
    let select: SelectNode | undefined;

    if (this.isWord('VALUES')) {
      const valToken = this.advance();
      const rows: SqlNode[][] = [];
      do {
        if (this.isType(TokenType.LeftParen)) {
          this.advance();
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
          rows.push(row);
        }
      } while (this.isType(TokenType.Comma) && this.advance());
      values = { token: valToken, rows };
    } else if (this.isWord('SELECT')) {
      select = this.parseSelect();
    }

    return { type: 'insert', insertToken, intoToken, target, columns, values, select };
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
      this.advance();
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
    return this.isWordAt(0, 'WITH') && this.peek(1).type === TokenType.Word &&
           (this.isWordAt(2, 'AS') || this.isWordAt(2, '('));
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
          if (this.isType(TokenType.Comma)) { this.advance(); continue; }
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
      this.advance();
      parseSingleCTE();
    }

    const statement = this.parseStatement() || { type: 'rawToken', token: withToken } as RawTokenNode;
    return { type: 'cte', withToken, ctes, statement };
  }

  // --- Control flow ---

  private parseBeginEnd(): BeginEndNode {
    const beginToken = this.advance(); // BEGIN
    const statements: SqlNode[] = [];

    while (!this.isEOF() && !this.isWord('END')) {
      if (this.isType(TokenType.Semicolon)) {
        if (statements.length > 0) {
          (statements[statements.length - 1] as any)._hasSemicolon = true;
        }
        this.advance();
        continue;
      }
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
      else break;
    }

    const endToken = this.isWord('END') ? this.advance() : beginToken;
    return { type: 'beginEnd', beginToken, statements, endToken };
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

  private parseDeclare(): DeclareNode {
    const token = this.advance(); // DECLARE
    const variables: { name: Token; dataType: SqlNode; default?: SqlNode }[] = [];

    const parseVar = () => {
      const name = this.advance(); // @var
      const dataType = this.parseDataType();
      let defaultVal: SqlNode | undefined;
      if (this.isType(TokenType.Equals)) {
        this.advance();
        defaultVal = this.parseExpression();
      }
      variables.push({ name, dataType, default: defaultVal });
    };

    parseVar();
    while (this.isType(TokenType.Comma)) {
      this.advance();
      parseVar();
    }

    return { type: 'declare', token, variables };
  }

  private parseSet(): SetNode {
    const token = this.advance(); // SET

    // Special forms: SET NOCOUNT ON/OFF, SET ANSI_NULLS ON/OFF, etc.
    if (this.isWord('NOCOUNT') || this.isWord('ANSI_NULLS') || this.isWord('ANSI_PADDING') ||
        this.isWord('QUOTED_IDENTIFIER') || this.isWord('XACT_ABORT') || this.isWord('ARITHABORT') ||
        this.isWord('CONCAT_NULL_YIELDS_NULL') || this.isWord('ANSI_WARNINGS') ||
        this.isWord('NUMERIC_ROUNDABORT') || this.isWord('TRANSACTION') || this.isWord('IDENTITY_INSERT') ||
        this.isWord('DATEFORMAT') || this.isWord('LANGUAGE') || this.isWord('LOCK_TIMEOUT') ||
        this.isWord('ROWCOUNT')) {
      const target: SqlNode = { type: 'identifier', parts: [this.advance()] } as IdentifierNode;
      const value: SqlNode = this.isWord() ?
        { type: 'identifier', parts: [this.advance()] } as IdentifierNode :
        this.parseExpression();
      return { type: 'set', token, target, value, isSpecial: true };
    }

    const target = this.parseQualifiedName();
    if (this.isType(TokenType.Equals)) {
      this.advance();
    }
    const value = this.parseExpression();
    return { type: 'set', token, target, value };
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

  private parseExec(): SqlNode {
    const token = this.advance(); // EXEC/EXECUTE
    // Consume until statement end
    const extra: Token[] = [];
    while (!this.isEOF() && !this.isStatementEnd() && !this.isType(TokenType.Semicolon)) {
      extra.push(this.advance());
    }
    const node: RawTokenNode = { type: 'rawToken', token };
    if (extra.length > 0) node.extraTokens = extra;
    return node;
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
            this.advance();
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
      this.advance(); // (
      if (this.isWord('SELECT')) {
        const subquery = this.parseSelect();
        if (this.isType(TokenType.RightParen)) this.advance();
        return { type: 'parenGroup', inner: [subquery] } as ParenGroupNode;
      }
      const inner: SqlNode[] = [];
      inner.push(this.parseExpression());
      while (this.isType(TokenType.Comma)) {
        this.advance();
        inner.push(this.parseExpression());
      }
      if (this.isType(TokenType.RightParen)) this.advance();
      if (inner.length === 1) {
        // Mark the expression as having been parenthesized so the formatter
        // can re-emit parens when needed to preserve operator precedence
        (inner[0] as any)._parenthesized = true;
        return inner[0];
      }
      return { type: 'parenGroup', inner } as ParenGroupNode;
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

    // Quoted identifier
    if (this.isType(TokenType.QuotedIdentifier)) {
      return this.parseQualifiedName();
    }

    // Wildcard: *
    if (this.isType(TokenType.Operator) && this.current().value === '*') {
      return { type: 'literal', token: this.advance() } as LiteralNode;
    }

    // Word: identifier, function call, or qualified name
    if (this.isWord()) {
      const name = this.parseQualifiedName();
      // Function call?
      if (this.isType(TokenType.LeftParen) && name.type === 'identifier') {
        this.advance(); // (
        const args: SqlNode[] = [];
        if (!this.isType(TokenType.RightParen)) {
          // Check for DISTINCT in aggregate functions
          if (this.isWord('DISTINCT')) {
            args.push({ type: 'rawToken', token: this.advance() } as RawTokenNode);
          }
          args.push(this.parseExpression());
          while (this.isType(TokenType.Comma)) {
            this.advance();
            args.push(this.parseExpression());
          }
        }
        if (this.isType(TokenType.RightParen)) this.advance();
        return { type: 'functionCall', name, args } as FunctionCallNode;
      }
      return name;
    }

    // Fallback
    return { type: 'rawToken', token: this.advance() } as RawTokenNode;
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
      this.advance();
      items.push(this.parseExpression());
    }
    return items;
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
