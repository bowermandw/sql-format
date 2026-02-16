# sql-format

A T-SQL code formatter driven by RedGate-compatible style configurations. Provides fine-grained control over whitespace, casing, parentheses, lists, joins, CTEs, CASE expressions, operators, and more through JSON configuration files.

## Installation

```bash
npm install
npm run build
```

No runtime dependencies -- only TypeScript, @types/node, and Vitest for development.

## Usage

```bash
# Format a file with a style config
sql-format --style style.json input.sql

# Format using default settings
sql-format input.sql

# Read from stdin
cat input.sql | sql-format --style style.json

# Overwrite the file in place
sql-format --style style.json -i input.sql
```

### CLI Options

| Flag | Short | Argument | Description |
|------|-------|----------|-------------|
| `--style` | `-s` | `<file>` | Path to a JSON style configuration file |
| `--enclose-identifiers` | `-e` | `withBrackets\|withoutBrackets\|asis` | Override identifier bracketing |
| `--enclose-datatypes` | `-d` | `withBrackets\|withoutBrackets\|asis` | Override data type bracketing |
| `--insert-semicolons` | `-c` | | Insert semicolons after each statement |
| `--line-ending` | `-l` | `lf\|crlf` | Line ending style (default: `lf`) |
| `--in-place` | `-i` | | Overwrite the input file with formatted output |
| `--tokens` | `-t` | | Print token list (debug mode) |
| `--ast` | `-a` | | Print AST as JSON (debug mode) |
| `--help` | `-h` | | Show help message |

## Configuration

Style files are JSON and follow the RedGate SQL Prompt format. All options have sensible defaults -- you only need to specify values you want to override.

### Metadata

```json
{
  "metadata": {
    "id": "unique-id",
    "name": "Style Name"
  }
}
```

### Whitespace

```json
{
  "whitespace": {
    "tabBehavior": "onlySpaces",
    "numberOfSpacesInTab": 4,
    "lineEnding": "lf",
    "wrapLongLines": true,
    "wrapLinesLongerThan": 120,
    "whitespaceBeforeSemicolon": "none",
    "insertSemicolons": "asis",
    "newLines": {
      "preserveExistingEmptyLinesBetweenStatements": true,
      "emptyLinesBetweenStatements": 1,
      "emptyLinesAfterBatchSeparator": 1,
      "preserveExistingEmptyLinesAfterBatchSeparator": true,
      "preserveExistingEmptyLinesWithinStatements": true
    }
  }
}
```

| Option | Values | Default |
|--------|--------|---------|
| `tabBehavior` | `onlySpaces`, `onlyTabs`, `tabsWherePossible` | `onlySpaces` |
| `lineEnding` | `lf`, `crlf` | `lf` |
| `whitespaceBeforeSemicolon` | `none`, `spaceBefore`, `newLineBefore` | `none` |
| `insertSemicolons` | `insert`, `remove`, `asis` | `asis` |

### Casing

```json
{
  "casing": {
    "reservedKeywords": "uppercase",
    "builtInFunctions": "uppercase",
    "builtInDataTypes": "uppercase",
    "globalVariables": "uppercase",
    "useObjectDefinitionCase": true
  }
}
```

Case options: `asis`, `lowercase`, `uppercase`, `lowerCamelCase`, `upperCamelCase`

### Identifiers

```json
{
  "identifiers": {
    "encloseIdentifiers": "asis",
    "encloseIdentifiersScope": "userDefined",
    "alwaysBracketReservedWordIdentifiers": true
  }
}
```

| Option | Values | Default |
|--------|--------|---------|
| `encloseIdentifiers` | `asis`, `withBrackets`, `withoutBrackets` | `asis` |
| `encloseIdentifiersScope` | `all`, `userDefined`, `tablesAndColumns` | `userDefined` |

### Data Types

```json
{
  "dataTypes": {
    "encloseDataTypes": "asis"
  }
}
```

Values: `asis`, `withBrackets`, `withoutBrackets`

### Lists

Controls formatting of SELECT columns, GROUP BY items, ORDER BY items, etc.

```json
{
  "lists": {
    "placeFirstItemOnNewLine": "never",
    "placeSubsequentItemsOnNewLines": "always",
    "alignSubsequentItemsWithFirstItem": false,
    "alignItemsAcrossClauses": false,
    "indentListItems": true,
    "alignItemsToTabStops": false,
    "alignAliases": false,
    "alignComments": false,
    "commas": {
      "placeCommasBeforeItems": false,
      "commaAlignment": "beforeItem",
      "addSpaceBeforeComma": false,
      "addSpaceAfterComma": true
    }
  }
}
```

| Option | Values | Default |
|--------|--------|---------|
| `placeFirstItemOnNewLine` | `always`, `never`, `onlyIfSubsequentItems` | `never` |
| `placeSubsequentItemsOnNewLines` | `always`, `never`, `ifLongerThanWrapColumn` | `always` |
| `commaAlignment` | `beforeItem`, `toList`, `toStatement` | `beforeItem` |

### Parentheses

```json
{
  "parentheses": {
    "parenthesisStyle": "expandedToStatement",
    "indentParenthesesContents": true,
    "collapseShortParenthesisContents": true,
    "collapseParenthesesShorterThan": 78,
    "addSpacesAroundParentheses": false,
    "addSpacesAroundParenthesesContents": false
  }
}
```

Parenthesis styles: `expandedToStatement`, `compactToStatement`, `expandedToParenthesis`, `compactToParenthesis`

### DML (SELECT, INSERT, UPDATE, DELETE)

```json
{
  "dml": {
    "clauseAlignment": "toStatement",
    "clauseIndentation": 4,
    "placeDistinctAndTopClausesOnNewLine": false,
    "addNewLineAfterDistinctAndTopClauses": false,
    "collapseShortStatements": true,
    "collapseStatementsShorterThan": 78,
    "collapseShortSubqueries": true,
    "collapseSubqueriesShorterThan": 78,
    "listItems": {
      "placeFromTableOnNewLine": "always",
      "placeWhereConditionOnNewLine": "always",
      "placeGroupByAndOrderByOnNewLine": "always",
      "placeInsertTableOnNewLine": false
    }
  }
}
```

### DDL (CREATE TABLE, CREATE PROCEDURE)

```json
{
  "ddl": {
    "parenthesisStyle": "expandedToStatement",
    "indentParenthesesContents": true,
    "alignDataTypesAndConstraints": false,
    "placeConstraintsOnNewLines": true,
    "placeConstraintColumnsOnNewLines": "always",
    "indentClauses": true,
    "placeFirstProcedureParameterOnNewLine": "always",
    "collapseShortStatements": true,
    "collapseStatementsShorterThan": 78
  }
}
```

### Control Flow

```json
{
  "controlFlow": {
    "placeBeginKeywordOnNewLine": true,
    "indentBeginEndKeywords": false,
    "indentContentsOfStatements": true,
    "collapseShortStatements": true,
    "collapseStatementsShorterThan": 78
  }
}
```

### CTEs (Common Table Expressions)

```json
{
  "cte": {
    "placeNameOnNewLine": false,
    "indentName": false,
    "placeColumnsOnNewLine": false,
    "columnAlignment": false,
    "placeAsOnNewLine": false,
    "asAlignment": "leftAlignedToWith",
    "parenthesisStyle": "expandedToStatement",
    "indentContents": true
  }
}
```

### Variables

```json
{
  "variables": {
    "alignDataTypesAndValues": false,
    "addSpaceBetweenDataTypeAndPrecision": false,
    "placeAssignedValueOnNewLineIfLongerThanMaxLineLength": false,
    "placeEqualsSignOnNewLine": false
  }
}
```

### JOIN Statements

```json
{
  "joinStatements": {
    "join": {
      "placeOnNewLine": true,
      "keywordAlignment": "toFrom",
      "insertEmptyLineBetweenJoinClauses": false,
      "placeJoinTableOnNewLine": false,
      "indentJoinTable": false
    },
    "on": {
      "placeOnNewLine": true,
      "keywordAlignment": "indented",
      "placeConditionOnNewLine": false,
      "conditionAlignment": "indented"
    }
  }
}
```

JOIN keyword alignment: `toFrom`, `toTable`, `indented`

### INSERT Statements

```json
{
  "insertStatements": {
    "columnList": {
      "parenthesisStyle": "expandedToStatement",
      "indentContents": true,
      "placeSubsequentColumnsOnNewLines": "always"
    },
    "values": {
      "parenthesisStyle": "expandedToStatement",
      "indentContents": true,
      "placeSubsequentValuesOnNewLines": "ifLongerThanMaxLineLength"
    }
  }
}
```

### CASE Expressions

```json
{
  "caseExpressions": {
    "placeExpressionOnNewLine": false,
    "placeFirstWhenOnNewLine": "always",
    "whenAlignment": "indentedFromCase",
    "placeThenOnNewLine": false,
    "thenAlignment": "toWhen",
    "placeElseOnNewLine": true,
    "alignElseToWhen": true,
    "placeEndOnNewLine": true,
    "endAlignment": "toCase",
    "collapseShortCaseExpressions": true,
    "collapseCaseExpressionsShorterThan": 78
  }
}
```

### Operators

```json
{
  "operators": {
    "comparison": {
      "align": false,
      "addSpacesAroundComparisonOperators": true,
      "addSpacesAroundArithmeticOperators": true
    },
    "andOr": {
      "placeOnNewLine": "always",
      "alignment": "indented",
      "placeBeforeCondition": true
    },
    "between": {
      "placeOnNewLine": false,
      "placeAndKeywordOnNewLine": false,
      "andAlignment": "toBetween"
    },
    "in": {
      "placeOpeningParenthesisOnNewLine": false,
      "openingParenthesisAlignment": "indented",
      "placeFirstValueOnNewLine": "never",
      "placeSubsequentValuesOnNewLines": "never",
      "addSpaceAroundInContents": false
    }
  }
}
```

AND/OR alignment: `toStatement`, `rightAligned`, `toFirstListItem`, `indented`

## Supported SQL Constructs

### DML
- SELECT with DISTINCT, TOP, INTO
- INSERT INTO ... VALUES and INSERT INTO ... SELECT
- UPDATE with FROM and WHERE
- DELETE with WHERE

### DDL
- CREATE [OR ALTER] PROCEDURE with parameters (defaults, OUTPUT)
- CREATE TABLE with columns and constraints
- DROP TABLE [IF EXISTS]
- TRUNCATE TABLE

### Control Flow
- BEGIN...END blocks
- IF...ELSE (including ELSE IF chaining)
- WHILE loops

### Expressions
- Comparison: `=`, `<`, `>`, `<=`, `>=`, `<>`, `!=`
- Logical: AND, OR, NOT
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- LIKE, IN, BETWEEN, EXISTS, IS [NOT] NULL
- CASE expressions (simple and searched)
- Function calls with DISTINCT
- Subqueries

### Other
- Common Table Expressions (WITH)
- JOINs (INNER, LEFT, RIGHT, FULL, CROSS)
- GROUP BY, HAVING, ORDER BY
- PIVOT / UNPIVOT
- UNION, UNION ALL, EXCEPT, INTERSECT
- DECLARE, SET, PRINT, RETURN
- EXEC / EXECUTE
- Batch separation with GO
- Line comments (`--`) and block comments (`/* */`)

## Architecture

The formatter uses a three-stage pipeline:

```
SQL Text  -->  Tokenizer  -->  Parser  -->  Formatter  -->  Formatted SQL
               (lexer)        (AST)        (printer)
```

1. **Tokenizer** (`src/tokenizer.ts`) -- Splits SQL text into tokens (keywords, identifiers, strings, operators, comments, etc.). Handles `GO` batch separator detection, nested block comments, and UTF encoding.

2. **Parser** (`src/parser.ts`) -- Recursive descent parser that builds an AST from the token stream. Handles operator precedence, multi-word constructs (`GROUP BY`, `IS NOT NULL`), subqueries, and all T-SQL statement types.

3. **Formatter** (`src/formatter.ts`) -- Walks the AST and produces formatted output according to the configuration. Supports smart collapsing (short statements stay on one line), alias alignment, comment preservation, and line wrapping.

## Example

**Input:**
```sql
select a.id, a.name, b.value from dbo.table1 a inner join dbo.table2 b on a.id = b.id where a.active = 1 and b.value > 100 order by a.name
```

**Output** (with defaults):
```sql
SELECT
    a.id,
    a.name,
    b.value
FROM
    dbo.table1 a
    INNER JOIN dbo.table2 b
        ON a.id = b.id
WHERE
    a.active = 1
    AND b.value > 100
ORDER BY
    a.name
```

## File Structure

```
sql-format/
├── bin/sql-format          CLI wrapper
├── src/
│   ├── index.ts            CLI entry point
│   ├── tokenizer.ts        Lexical analysis
│   ├── tokens.ts           Token types
│   ├── parser.ts           Syntax analysis (AST)
│   ├── ast.ts              AST node definitions
│   ├── formatter.ts        Code generation
│   ├── config.ts           Configuration types & defaults
│   └── casing.ts           Keyword/function categorization & casing
├── test/                   Test suite (Vitest)
├── dist/                   Compiled JavaScript
└── package.json
```

## Development

```bash
npm run build        # Compile TypeScript
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```

## License

ISC
