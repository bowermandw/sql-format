import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- dml.collapseShortStatements + collapseStatementsShorterThan ----

describe('dml.collapseShortStatements', () => {
  it('collapses short SELECT to one line when enabled', () => {
    const result = formatSQL('SELECT a FROM t', {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: true, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    expect(result.trim()).toBe('SELECT a FROM t');
  });

  it('expands SELECT when disabled', () => {
    const result = formatSQL('SELECT a FROM t', {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('expands when exceeding collapseStatementsShorterThan', () => {
    const sql = "SELECT column1, column2, column3, column4, column5 FROM dbo.some_very_long_table_name WHERE column1 = 'value'";
    const result = formatSQL(sql, {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: true, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('collapses SELECT with WHERE when short enough', () => {
    const result = formatSQL('SELECT a FROM t WHERE a = 1', {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: true, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    expect(result.trim()).toBe('SELECT a FROM t WHERE a = 1');
  });

  it('collapses short SELECT with DISTINCT', () => {
    const result = formatSQL('SELECT DISTINCT a FROM t', {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: true, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    expect(result.trim()).toBe('SELECT DISTINCT a FROM t');
  });

  it('uses custom threshold (40 chars)', () => {
    const result = formatSQL('SELECT a FROM t WHERE a = 1', {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: true, collapseStatementsShorterThan: 40, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    // "SELECT a FROM t WHERE a = 1" is 28 chars, shorter than 40
    expect(result.trim()).toBe('SELECT a FROM t WHERE a = 1');
  });
});

// ---- dml.collapseShortStatements for INSERT ----

describe('dml.collapseShortStatements for INSERT', () => {
  const dmlConfig = {
    dml: { collapseShortStatements: true, collapseStatementsShorterThan: 1000 },
  };

  it('collapses short INSERT VALUES to one line', () => {
    const result = formatSQL('INSERT INTO dbo.t (col1, col2) VALUES (1, 2)', dmlConfig);
    expect(result.trim()).toBe('INSERT INTO dbo.t (col1, col2) VALUES (1, 2)');
  });

  it('collapses short INSERT SELECT to one line', () => {
    const result = formatSQL('INSERT INTO dbo.t (col1) SELECT a FROM t2', dmlConfig);
    expect(result.trim()).toBe('INSERT INTO dbo.t (col1) SELECT a FROM t2');
  });

  it('stays expanded when exceeding threshold', () => {
    const result = formatSQL('INSERT INTO dbo.t (col1, col2) VALUES (1, 2)', {
      dml: { collapseShortStatements: true, collapseStatementsShorterThan: 20 },
    });
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('stays expanded when collapse is disabled', () => {
    const result = formatSQL('INSERT INTO dbo.t (col1, col2) VALUES (1, 2)', {
      dml: { collapseShortStatements: false, collapseStatementsShorterThan: 1000 },
    });
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });
});

// ---- dml.collapseShortStatements for UPDATE ----

describe('dml.collapseShortStatements for UPDATE', () => {
  const dmlConfig = {
    dml: { collapseShortStatements: true, collapseStatementsShorterThan: 1000 },
  };

  it('collapses short UPDATE to one line', () => {
    const result = formatSQL("UPDATE dbo.t SET col1 = 1 WHERE id = 1", dmlConfig);
    expect(result.trim()).toBe('UPDATE dbo.t SET col1 = 1 WHERE id = 1');
  });

  it('collapses UPDATE with multiple assignments', () => {
    const result = formatSQL("UPDATE dbo.t SET a = 1, b = 2", dmlConfig);
    expect(result.trim()).toBe('UPDATE dbo.t SET a = 1, b = 2');
  });

  it('stays expanded when exceeding threshold', () => {
    const result = formatSQL("UPDATE dbo.t SET col1 = 1 WHERE id = 1", {
      dml: { collapseShortStatements: true, collapseStatementsShorterThan: 20 },
    });
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });
});

// ---- dml.collapseShortSubqueries + collapseSubqueriesShorterThan ----

describe('dml.collapseShortSubqueries', () => {
  it('collapses short subqueries to one line', () => {
    const result = formatSQL('SELECT a FROM (SELECT a FROM t) sub', {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    expect(result).toContain('(SELECT a FROM t) sub');
  });

  it('expands subqueries when disabled', () => {
    const result = formatSQL('SELECT a FROM (SELECT a FROM t) sub', {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: false, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    // Should be expanded to multiple lines
    expect(result).toContain('(\n');
    expect(result).toContain(') sub');
  });

  it('expands long subqueries even when collapse is enabled', () => {
    const sql = "SELECT a FROM (SELECT col1, col2, col3, col4, col5 FROM dbo.very_long_table WHERE col1 = 'some_value_here') sub";
    const result = formatSQL(sql, {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    // Subquery is too long to collapse
    expect(result).toContain('(\n');
  });

  it('collapses subquery in JOIN', () => {
    const result = formatSQL('SELECT a.col FROM t a INNER JOIN (SELECT id FROM u) b ON a.id = b.id', {
      dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
    });
    expect(result).toContain('(SELECT id FROM u) b');
  });
});
