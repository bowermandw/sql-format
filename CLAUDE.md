# sql-format

T-SQL formatter driven by RedGate-compatible JSON style configs.

## Build & Test

```bash
npm run build        # tsc → dist/
npm run test         # vitest run (233 tests)
npm run test:watch   # vitest watch mode
```

## Run

```bash
node dist/index.js --style style1.json input.sql
node dist/index.js input.sql                       # default config
cat input.sql | node dist/index.js --style s.json  # stdin
```

CLI flags: `--style/-s`, `--enclose-identifiers/-e`, `--enclose-datatypes/-d`, `--insert-semicolons/-c`, `--line-ending/-l`, `--in-place/-i`, `--tokens/-t` (debug), `--ast/-a` (debug)

## Architecture

Three-stage pipeline: `SQL Text → Tokenizer → Token[] → Parser → AST (BatchNode) → Formatter → Formatted SQL`

### Source Files

| File | LOC | Purpose |
|------|-----|---------|
| `src/index.ts` | 205 | CLI entry point |
| `src/tokens.ts` | 46 | Token types/interfaces |
| `src/tokenizer.ts` | 375 | Lexer: SQL → Token[] |
| `src/parser.ts` | 1504 | Recursive descent parser: Token[] → AST |
| `src/ast.ts` | 302 | AST node type definitions |
| `src/formatter.ts` | 1485 | AST → formatted SQL string |
| `src/config.ts` | 379 | FormatConfig types, defaults, JSON loader |
| `src/casing.ts` | 155 | Keyword/function/datatype casing logic |

### Test Files

- `test/tokenizer.test.ts` — lexer tests
- `test/parser.test.ts` — parser tests
- `test/formatter.test.ts` — structural/integration formatter tests
- `test/helpers.ts` — shared `formatSQL()` helper with deep-merge config overrides
- `test/formatter/` — per-config-section tests:
  - `casing.test.ts`, `identifiers.test.ts`, `datatypes.test.ts`
  - `whitespace.test.ts`, `lists.test.ts`, `dml.test.ts`, `ddl.test.ts`
  - `control-flow.test.ts`, `variables.test.ts`, `case-expressions.test.ts`, `operators.test.ts`

## Key Public Functions

- `tokenize(input): Token[]` — lexer
- `attachComments(tokens): Token[]` — strips whitespace, attaches comments to adjacent tokens
- `parse(tokens): BatchNode` — parser
- `format(ast, config): string` — formatter
- `loadConfig(filePath): FormatConfig` — loads JSON style config with defaults

## AST Node Types (src/ast.ts)

- **Root:** `BatchNode` (contains batches separated by GO)
- **DML:** `SelectNode`, `InsertNode`, `UpdateNode`, `DeleteNode`
- **DDL:** `CreateTableNode`, `DropTableNode`, `CreateProcedureNode`, `ColumnDefNode`, `ConstraintNode`
- **Query parts:** `CteNode`, `JoinNode`, `WhereNode`, `GroupByNode`, `OrderByNode`, `HavingNode`
- **Control flow:** `BeginEndNode`, `IfElseNode`, `CaseNode`, `DeclareNode`, `SetNode`, `PrintNode`, `ReturnNode`
- **Expressions:** `ExpressionNode` (binary), `FunctionCallNode`, `InExpressionNode`, `BetweenNode`, `ExistsNode`
- **Containers:** `ParenGroupNode` (subqueries/parens with optional PIVOT/alias), `IdentifierNode`, `LiteralNode`, `RawTokenNode`

## FormatConfig Sections (src/config.ts)

`whitespace`, `lists`, `parentheses`, `casing`, `identifiers`, `dataTypes`, `dml`, `ddl`, `controlFlow`, `cte`, `variables`, `joinStatements`, `insertStatements`, `caseExpressions`, `operators`

Key settings for line wrapping:
- `whitespace.wrapLongLines` / `whitespace.wrapLinesLongerThan` — general expression wrapping
- `dml.collapseShortStatements` / `collapseStatementsShorterThan` — collapse short SELECTs to one line
- `dml.collapseShortSubqueries` / `collapseSubqueriesShorterThan` — collapse short subqueries
- `caseExpressions.collapseShortCaseExpressions` / `collapseCaseExpressionsShorterThan`
- `parentheses.collapseShortParenthesisContents` / `collapseParenthesesShorterThan`

## Formatter Key Methods (src/formatter.ts)

- `formatSelect()` — SELECT formatting with collapse check, column list, clause placement
- `formatSelectItem()` — individual column with alias alignment; uses `wrapExpression` in expanded mode
- `formatParenGroup()` — subquery detection & collapse/expand logic
- `formatCase()` — CASE expression collapse/expand
- `wrapExpression()` — splits binary expressions at operator boundaries when line exceeds max
- `collapseSelect()` / `collapseJoin()` / `collapseCase()` — generate single-line versions

## Patterns

- **Recursive descent parser** with `peek()`, `isWord()`, `matchWords()` lookahead
- **Visitor-style formatter** with `formatX()` methods per node type
- **Indent tracking** via `this.indent` level (incremented/decremented around nested structures)
- **Collapse-then-expand pattern:** try single-line version, check length threshold, fall back to expanded multi-line
- Comments attached to tokens as `leadingComments`/`trailingComment`/`trailingComments`
- T-SQL dialect focused (SQL Server)

## Implementation Status

Config options: 42 implemented / 107 total. Legend: [x] = implemented + tested, [~] = implemented but not fully functional, [ ] = not yet implemented.

### whitespace (7 implemented / 9 total)
- [x] `tabBehavior` — onlySpaces / onlyTabs / tabsWherePossible
- [x] `numberOfSpacesInTab` — indent width
- [x] `lineEnding` — lf / crlf
- [x] `wrapLongLines` — enable line wrapping
- [x] `wrapLinesLongerThan` — max line length threshold
- [x] `whitespaceBeforeSemicolon` — none / spaceBefore / newLineBefore
- [x] `insertSemicolons` — insert / remove / asis
- [ ] `newLines.emptyLinesBetweenStatements`
- [x] `newLines.preserveExistingEmptyLinesBetweenStatements`
- [ ] `newLines.emptyLinesAfterBatchSeparator`
- [ ] `newLines.preserveExistingEmptyLinesAfterBatchSeparator`
- [ ] `newLines.preserveExistingEmptyLinesWithinStatements`

### lists (4 implemented / 10 total)
- [x] `placeFirstItemOnNewLine` — always / never / onlyIfSubsequentItems
- [ ] `placeSubsequentItemsOnNewLines`
- [ ] `alignSubsequentItemsWithFirstItem`
- [ ] `alignItemsAcrossClauses`
- [ ] `indentListItems`
- [ ] `alignItemsToTabStops`
- [x] `alignAliases`
- [x] `alignComments`
- [x] `commas.placeCommasBeforeItems`
- [ ] `commas.commaAlignment`
- [ ] `commas.addSpaceBeforeComma`
- [ ] `commas.addSpaceAfterComma`

### parentheses (0 implemented / 6 total)
- [ ] `parenthesisStyle`
- [ ] `indentParenthesesContents`
- [ ] `collapseShortParenthesisContents`
- [ ] `collapseParenthesesShorterThan`
- [ ] `addSpacesAroundParentheses`
- [ ] `addSpacesAroundParenthesesContents`

### casing (5 implemented / 5 total)
- [x] `reservedKeywords` — uppercase / lowercase / asis / camelCase
- [x] `builtInFunctions`
- [x] `builtInDataTypes`
- [x] `globalVariables`
- [x] `useObjectDefinitionCase`

### identifiers (3 implemented / 3 total)
- [x] `encloseIdentifiers` — asis / withBrackets / withoutBrackets
- [x] `encloseIdentifiersScope`
- [x] `alwaysBracketReservedWordIdentifiers`

### dataTypes (1 implemented / 1 total)
- [x] `encloseDataTypes` — asis / withBrackets / withoutBrackets

### dml (4 implemented / 12 total)
- [ ] `clauseAlignment`
- [ ] `clauseIndentation`
- [ ] `placeDistinctAndTopClausesOnNewLine`
- [ ] `addNewLineAfterDistinctAndTopClauses`
- [x] `collapseShortStatements`
- [x] `collapseStatementsShorterThan`
- [x] `collapseShortSubqueries`
- [x] `collapseSubqueriesShorterThan`
- [ ] `listItems.placeFromTableOnNewLine`
- [ ] `listItems.placeWhereConditionOnNewLine`
- [ ] `listItems.placeGroupByAndOrderByOnNewLine`
- [ ] `listItems.placeInsertTableOnNewLine`

### ddl (2 implemented / 10 total)
- [ ] `parenthesisStyle`
- [ ] `indentParenthesesContents`
- [x] `alignDataTypesAndConstraints`
- [ ] `placeConstraintsOnNewLines`
- [ ] `placeConstraintColumnsOnNewLines`
- [ ] `indentClauses`
- [x] `placeFirstProcedureParameterOnNewLine`
- [ ] `collapseShortStatements`
- [ ] `collapseStatementsShorterThan`

### controlFlow (2 implemented / 5 total)
- [ ] `placeBeginKeywordOnNewLine`
- [ ] `indentBeginEndKeywords`
- [ ] `indentContentsOfStatements`
- [x] `collapseShortStatements`
- [x] `collapseStatementsShorterThan`

### cte (0 implemented / 8 total)
- [ ] `placeNameOnNewLine`
- [ ] `indentName`
- [ ] `placeColumnsOnNewLine`
- [ ] `columnAlignment`
- [ ] `placeAsOnNewLine`
- [ ] `asAlignment`
- [ ] `parenthesisStyle`
- [ ] `indentContents`

### variables (1 implemented / 4 total)
- [x] `alignDataTypesAndValues`
- [ ] `addSpaceBetweenDataTypeAndPrecision`
- [ ] `placeAssignedValueOnNewLineIfLongerThanMaxLineLength`
- [ ] `placeEqualsSignOnNewLine`

### joinStatements (0 implemented / 9 total)
- [ ] `join.placeOnNewLine`
- [ ] `join.keywordAlignment`
- [ ] `join.insertEmptyLineBetweenJoinClauses`
- [ ] `join.placeJoinTableOnNewLine`
- [ ] `join.indentJoinTable`
- [ ] `on.placeOnNewLine`
- [ ] `on.keywordAlignment`
- [ ] `on.placeConditionOnNewLine`
- [ ] `on.conditionAlignment`

### insertStatements (0 implemented / 6 total)
- [ ] `columnList.parenthesisStyle`
- [ ] `columnList.indentContents`
- [ ] `columnList.placeSubsequentColumnsOnNewLines`
- [ ] `values.parenthesisStyle`
- [ ] `values.indentContents`
- [ ] `values.placeSubsequentValuesOnNewLines`

### caseExpressions (4 implemented / 11 total)
- [ ] `placeExpressionOnNewLine`
- [ ] `placeFirstWhenOnNewLine`
- [ ] `whenAlignment`
- [x] `placeThenOnNewLine`
- [x] `thenAlignment`
- [ ] `placeElseOnNewLine`
- [ ] `alignElseToWhen`
- [ ] `placeEndOnNewLine`
- [ ] `endAlignment`
- [x] `collapseShortCaseExpressions`
- [x] `collapseCaseExpressionsShorterThan`

### operators (4 implemented / 12 total)
- [x] `comparison.align`
- [~] `comparison.addSpacesAroundComparisonOperators` — true works; false falls through to default (still adds spaces)
- [~] `comparison.addSpacesAroundArithmeticOperators` — true works; false falls through to default (still adds spaces)
- [ ] `andOr.placeOnNewLine`
- [ ] `andOr.alignment`
- [ ] `andOr.placeBeforeCondition`
- [ ] `between.placeOnNewLine`
- [ ] `between.placeAndKeywordOnNewLine`
- [ ] `between.andAlignment`
- [ ] `in.placeOpeningParenthesisOnNewLine`
- [ ] `in.placeFirstValueOnNewLine`
- [x] `in.addSpaceAroundInContents`
