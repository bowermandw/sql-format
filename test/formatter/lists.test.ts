import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- lists.placeFirstItemOnNewLine ----

describe('lists.placeFirstItemOnNewLine', () => {
  const base = {
    dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
  };

  it('always: first column on new line after SELECT', () => {
    const result = formatSQL('SELECT a, b, c FROM t', {
      ...base,
      lists: { placeFirstItemOnNewLine: 'always', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: false, alignComments: false, commas: { placeCommasBeforeItems: false, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    });
    const lines = result.trim().split('\n');
    expect(lines[0].trim()).toBe('SELECT');
    expect(lines[1].trim()).toBe('a,');
  });

  it('never: first column on same line as SELECT', () => {
    const result = formatSQL('SELECT a, b, c FROM t', {
      ...base,
      lists: { placeFirstItemOnNewLine: 'never', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: false, alignComments: false, commas: { placeCommasBeforeItems: false, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    });
    const lines = result.trim().split('\n');
    expect(lines[0].trim()).toMatch(/^SELECT a,/);
  });

  it('onlyIfSubsequentItems: first item on new line when multiple columns', () => {
    const result = formatSQL('SELECT a, b FROM t', {
      ...base,
      lists: { placeFirstItemOnNewLine: 'onlyIfSubsequentItems', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: false, alignComments: false, commas: { placeCommasBeforeItems: false, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    });
    const lines = result.trim().split('\n');
    expect(lines[0].trim()).toBe('SELECT');
  });

  it('onlyIfSubsequentItems: single column stays on SELECT line', () => {
    const result = formatSQL('SELECT a FROM t', {
      ...base,
      lists: { placeFirstItemOnNewLine: 'onlyIfSubsequentItems', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: false, alignComments: false, commas: { placeCommasBeforeItems: false, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    });
    const lines = result.trim().split('\n');
    expect(lines[0].trim()).toMatch(/^SELECT a$/);
  });
});

// ---- lists.alignAliases ----

describe('lists.alignAliases', () => {
  const base = {
    dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    lists: { placeFirstItemOnNewLine: 'always', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: true, alignComments: false, commas: { placeCommasBeforeItems: false, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
  };

  it('aligns AS keywords to same column', () => {
    const result = formatSQL('SELECT a AS col1, longer_name AS col2, b AS col3 FROM t', base);
    const lines = result.trim().split('\n');
    const asPositions = lines.filter(l => l.includes(' AS ')).map(l => l.indexOf(' AS '));
    // All AS should be at the same position
    expect(new Set(asPositions).size).toBe(1);
  });

  it('does not align when alignAliases is false', () => {
    const cfg = { ...base, lists: { ...base.lists, alignAliases: false } };
    const result = formatSQL('SELECT a AS col1, longer_name AS col2 FROM t', cfg);
    const lines = result.trim().split('\n');
    const asPositions = lines.filter(l => l.includes(' AS ')).map(l => l.indexOf(' AS '));
    // Without alignment, AS positions will differ
    if (asPositions.length >= 2) {
      expect(asPositions[0]).not.toBe(asPositions[1]);
    }
  });
});

// ---- lists.commas.placeCommasBeforeItems ----

describe('lists.commas.placeCommasBeforeItems', () => {
  const noCollapse = {
    dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
  };

  it('true: commas before items (leading commas)', () => {
    const result = formatSQL('SELECT a, b, c FROM t', {
      ...noCollapse,
      lists: { placeFirstItemOnNewLine: 'never', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: false, alignComments: false, commas: { placeCommasBeforeItems: true, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    });
    const lines = result.trim().split('\n');
    const commaLines = lines.filter(l => l.trimStart().startsWith(','));
    expect(commaLines.length).toBeGreaterThan(0);
  });

  it('false: commas after items (trailing commas)', () => {
    const result = formatSQL('SELECT a, b, c FROM t', {
      ...noCollapse,
      lists: { placeFirstItemOnNewLine: 'never', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: false, alignComments: false, commas: { placeCommasBeforeItems: false, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    });
    const lines = result.trim().split('\n');
    // First column should end with comma (trailing)
    const trailingCommaLines = lines.filter(l => l.trimEnd().endsWith(','));
    expect(trailingCommaLines.length).toBeGreaterThan(0);
    // No leading commas
    const leadingCommaLines = lines.filter(l => l.trimStart().startsWith(','));
    expect(leadingCommaLines.length).toBe(0);
  });

  it('leading commas work with placeFirstItemOnNewLine=always', () => {
    const result = formatSQL('SELECT a, b, c FROM t', {
      ...noCollapse,
      lists: { placeFirstItemOnNewLine: 'always', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: false, alignComments: false, commas: { placeCommasBeforeItems: true, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    });
    const lines = result.trim().split('\n');
    // First line is just SELECT
    expect(lines[0].trim()).toBe('SELECT');
    // First column has no comma before it
    expect(lines[1].trimStart().startsWith(',')).toBe(false);
    // Second column has leading comma
    expect(lines[2].trimStart().startsWith(',')).toBe(true);
  });
});

// ---- lists.alignComments ----

describe('lists.alignComments', () => {
  it('preserves inline comment on INSERT VALUES line', () => {
    // The parser attaches trailing comments to values within INSERT rows
    const sql = "INSERT INTO t (a, b) VALUES\n(1, -- short comment\n2)";
    const result = formatSQL(sql, {
      lists: { placeFirstItemOnNewLine: 'never', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: false, alignComments: true, commas: { placeCommasBeforeItems: false, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    });
    expect(result).toContain('-- short comment');
  });
});

// ---- lists.alignAliases (table aliases in FROM/JOIN) ----

describe('lists.alignAliases for table aliases', () => {
  const base = {
    lists: { placeFirstItemOnNewLine: 'always', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: true, alignComments: false, commas: { placeCommasBeforeItems: false, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    dml: { collapseShortStatements: false },
  };

  it('aligns AS keywords across FROM source and INNER JOIN', () => {
    const sql = 'SELECT * FROM dbo.table_name_1 AS [a] INNER JOIN [dbo].[tbl2] AS [b] ON a.col1 = b.col1';
    const result = formatSQL(sql, base);
    const lines = result.split('\n');
    const fromLine = lines.find(l => l.includes('dbo.table_name_1'))!;
    const joinLine = lines.find(l => l.includes('INNER JOIN'))!;
    const fromAsPos = fromLine.indexOf(' AS ');
    const joinAsPos = joinLine.indexOf(' AS ');
    expect(fromAsPos).toBeGreaterThan(0);
    expect(joinAsPos).toBeGreaterThan(0);
    expect(fromAsPos).toBe(joinAsPos);
  });

  it('aligns across multiple JOINs with different keyword lengths', () => {
    const sql = 'SELECT * FROM dbo.t1 AS a INNER JOIN dbo.t2 AS b ON a.id = b.id LEFT OUTER JOIN dbo.t3 AS c ON a.id = c.id';
    const result = formatSQL(sql, base);
    const lines = result.split('\n');
    const fromLine = lines.find(l => l.includes('dbo.t1'))!;
    const innerLine = lines.find(l => l.includes('INNER JOIN'))!;
    const leftLine = lines.find(l => l.includes('LEFT OUTER JOIN'))!;
    const fromAsPos = fromLine.indexOf(' AS ');
    const innerAsPos = innerLine.indexOf(' AS ');
    const leftAsPos = leftLine.indexOf(' AS ');
    expect(fromAsPos).toBe(innerAsPos);
    expect(fromAsPos).toBe(leftAsPos);
  });

  it('does not crash when table has no alias', () => {
    const sql = 'SELECT * FROM dbo.table_name_1 INNER JOIN dbo.tbl2 AS b ON table_name_1.col1 = b.col1';
    const result = formatSQL(sql, base);
    expect(result).toContain('dbo.table_name_1');
    expect(result).toContain('AS b');
  });

  it('does not align when alignAliases is false', () => {
    const sql = 'SELECT * FROM dbo.table_name_1 AS [a] INNER JOIN [dbo].[tbl2] AS [b] ON a.col1 = b.col1';
    const result = formatSQL(sql, { ...base, lists: { ...base.lists, alignAliases: false } });
    const lines = result.split('\n');
    const fromLine = lines.find(l => l.includes('dbo.table_name_1'))!;
    const joinLine = lines.find(l => l.includes('INNER JOIN'))!;
    const fromAsPos = fromLine.indexOf(' AS ');
    const joinAsPos = joinLine.indexOf(' AS ');
    // They should NOT be aligned (different positions)
    expect(fromAsPos).not.toBe(joinAsPos);
  });

  it('does not add padding with single FROM and no JOINs', () => {
    const sql = 'SELECT * FROM dbo.table_name_1 AS a';
    const result = formatSQL(sql, base);
    const fromLine = result.split('\n').find(l => l.includes('dbo.table_name_1'))!;
    // No extra spaces before AS
    expect(fromLine).toMatch(/dbo\.table_name_1 AS a/);
  });
});
