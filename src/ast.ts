import { Token } from './tokens';

export type SqlNode =
  | BatchNode
  | CreateProcedureNode
  | SelectNode
  | InsertNode
  | UpdateNode
  | DeleteNode
  | CteNode
  | JoinNode
  | WhereNode
  | GroupByNode
  | OrderByNode
  | HavingNode
  | CaseNode
  | IfElseNode
  | BeginEndNode
  | DeclareNode
  | SetNode
  | PrintNode
  | ReturnNode
  | ExpressionNode
  | FunctionCallNode
  | InExpressionNode
  | BetweenNode
  | ExistsNode
  | CreateTableNode
  | DropTableNode
  | ColumnDefNode
  | ConstraintNode
  | ParenGroupNode
  | IdentifierNode
  | LiteralNode
  | RawTokenNode
  | ColumnListNode
  | PivotNode;

export interface BatchNode {
  type: 'batch';
  batches: { statements: SqlNode[]; separator?: Token }[];
  /** Trailing comments at the end of the file (after last statement/GO) */
  trailingComments?: Token[];
}

export interface CreateProcedureNode {
  type: 'createProcedure';
  keywords: Token[];          // CREATE, OR, ALTER, PROCEDURE
  name: SqlNode;              // schema.procName
  parameters: ProcParameter[];
  asToken: Token;
  body: SqlNode;              // typically BeginEndNode
}

export interface ProcParameter {
  name: Token;                // @param
  dataType: SqlNode;          // VARCHAR(20), INT, etc.
  default?: SqlNode;          // = value
  output?: Token;             // OUTPUT keyword
}

export interface SelectNode {
  type: 'select';
  selectToken: Token;
  distinct?: Token;
  top?: { token: Token; value: SqlNode };
  columns: SqlNode[];
  into?: { token: Token; target: SqlNode };
  from?: { token: Token; source: SqlNode; joins: JoinNode[] };
  where?: WhereNode;
  groupBy?: GroupByNode;
  having?: HavingNode;
  orderBy?: OrderByNode;
  union?: { token: Token; all?: Token; select: SelectNode };
}

export interface InsertNode {
  type: 'insert';
  insertToken: Token;
  intoToken?: Token;
  target: SqlNode;
  columns?: SqlNode[];
  values?: { token: Token; rows: SqlNode[][] };
  select?: SelectNode;
}

export interface UpdateNode {
  type: 'update';
  updateToken: Token;
  target: SqlNode;
  setToken: Token;
  assignments: { column: SqlNode; value: SqlNode }[];
  from?: { token: Token; source: SqlNode; joins: JoinNode[] };
  where?: WhereNode;
}

export interface DeleteNode {
  type: 'delete';
  deleteToken: Token;
  fromToken?: Token;
  target: SqlNode;
  where?: WhereNode;
}

export interface CteNode {
  type: 'cte';
  withToken: Token;
  ctes: { name: Token; columns?: Token[]; asToken: Token; query: SqlNode }[];
  statement: SqlNode;        // the SELECT/INSERT/etc. that follows
}

export interface JoinNode {
  type: 'join';
  joinKeywords: Token[];     // LEFT, OUTER, JOIN, INNER, CROSS, etc.
  table: SqlNode;
  on?: { token: Token; condition: SqlNode };
}

export interface WhereNode {
  type: 'where';
  token: Token;
  condition: SqlNode;
}

export interface GroupByNode {
  type: 'groupBy';
  tokens: Token[];           // GROUP, BY
  items: SqlNode[];
}

export interface OrderByNode {
  type: 'orderBy';
  tokens: Token[];           // ORDER, BY
  items: { expr: SqlNode; direction?: Token }[];
}

export interface HavingNode {
  type: 'having';
  token: Token;
  condition: SqlNode;
}

export interface CaseNode {
  type: 'case';
  caseToken: Token;
  inputExpr?: SqlNode;       // simple CASE: CASE expr
  whenClauses: { whenToken: Token; condition: SqlNode; thenToken: Token; result: SqlNode }[];
  elseClause?: { elseToken: Token; result: SqlNode };
  endToken: Token;
}

export interface IfElseNode {
  type: 'ifElse';
  ifToken: Token;
  condition: SqlNode;
  thenStatement: SqlNode;
  elseClause?: { elseToken: Token; statement: SqlNode };
}

export interface BeginEndNode {
  type: 'beginEnd';
  beginToken: Token;
  statements: SqlNode[];
  endToken: Token;
}

export interface DeclareNode {
  type: 'declare';
  token: Token;
  variables: { name: Token; dataType: SqlNode; default?: SqlNode }[];
}

export interface SetNode {
  type: 'set';
  token: Token;
  target: SqlNode;
  value: SqlNode;
  /** For special forms like SET NOCOUNT ON */
  isSpecial?: boolean;
}

export interface PrintNode {
  type: 'print';
  token: Token;
  expression: SqlNode;
}

export interface ReturnNode {
  type: 'return';
  token: Token;
  expression?: SqlNode;
}

export interface ExpressionNode {
  type: 'expression';
  left: SqlNode;
  operator: Token;
  right: SqlNode;
}

export interface FunctionCallNode {
  type: 'functionCall';
  name: SqlNode;
  args: SqlNode[];
  overClause?: SqlNode;
}

export interface InExpressionNode {
  type: 'inExpression';
  expression: SqlNode;
  notToken?: Token;
  inToken: Token;
  values: SqlNode[];
}

export interface BetweenNode {
  type: 'between';
  expression: SqlNode;
  notToken?: Token;
  betweenToken: Token;
  low: SqlNode;
  andToken: Token;
  high: SqlNode;
}

export interface ExistsNode {
  type: 'exists';
  notToken?: Token;
  existsToken: Token;
  subquery: SqlNode;
}

export interface CreateTableNode {
  type: 'createTable';
  keywords: Token[];         // CREATE, TABLE
  name: SqlNode;
  columns: (ColumnDefNode | ConstraintNode)[];
  onFilegroup?: Token[];     // ON PRIMARY, ON [filegroup], etc.
}

export interface DropTableNode {
  type: 'dropTable';
  keywords: Token[];         // DROP, TABLE, IF, EXISTS
  name: SqlNode;
}

export interface ColumnDefNode {
  type: 'columnDef';
  name: Token;
  dataType: SqlNode;
  constraints: SqlNode[];
}

export interface ConstraintNode {
  type: 'constraint';
  tokens: Token[];
  columns?: SqlNode[];
  references?: SqlNode;
}

export interface PivotNode {
  type: 'pivot';
  pivotToken: Token;       // PIVOT or UNPIVOT keyword
  aggregation: SqlNode;    // PIVOT: SUM(col) / UNPIVOT: value_column
  forToken: Token;
  pivotColumn: SqlNode;    // column in FOR clause
  inToken: Token;
  values: SqlNode[];       // the IN (...) list
  alias?: { asToken?: Token; name: Token };
}

export interface ParenGroupNode {
  type: 'parenGroup';
  inner: SqlNode[];
  closeComments?: Token[];
  alias?: { asToken?: Token; name: Token };
  pivot?: PivotNode;
}

export interface IdentifierNode {
  type: 'identifier';
  parts: Token[];            // schema.table.column
  alias?: { asToken?: Token; name: Token };
  pivot?: PivotNode;
}

export interface LiteralNode {
  type: 'literal';
  token: Token;
}

export interface RawTokenNode {
  type: 'rawToken';
  token: Token;
  /** Additional tokens for multi-token raw statements (e.g. EXEC) */
  extraTokens?: Token[];
}

export interface ColumnListNode {
  type: 'columnList';
  items: SqlNode[];
}
