import { describe, it, expect } from 'vitest';
import { tokenize, attachComments } from '../src/tokenizer';
import { parse } from '../src/parser';
import { analyze, Warning } from '../src/analyzer';

function getWarnings(sql: string, opts: { schema?: boolean; alias?: boolean; nocount?: boolean; nullability?: boolean; checkInsertColumns?: boolean } = {}): Warning[] {
  const tokens = attachComments(tokenize(sql));
  const ast = parse(tokens);
  return analyze(ast, {
    warnMissingSchema: opts.schema ?? false,
    warnMissingAlias: opts.alias ?? false,
    warnMissingNocount: opts.nocount ?? false,
    warnMissingNullability: opts.nullability ?? false,
    checkInsertColumns: opts.checkInsertColumns ?? false,
  });
}

describe('analyzer', () => {
  describe('missing schema warnings', () => {
    it('warns when table has no schema prefix', () => {
      const warnings = getWarnings('SELECT * FROM table_name', { schema: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Schema is missing from table_name');
    });

    it('does not warn when table has schema prefix', () => {
      const warnings = getWarnings('SELECT * FROM dbo.table_name', { schema: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn for temp tables', () => {
      const warnings = getWarnings('SELECT * FROM #temp', { schema: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn for bracketed temp tables', () => {
      const warnings = getWarnings('INSERT INTO [#temp_table] (col1) VALUES (1)', { schema: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn for table variables', () => {
      const warnings = getWarnings('SELECT * FROM @tableVar', { schema: true });
      expect(warnings).toHaveLength(0);
    });

    it('warns for both tables in a join', () => {
      const warnings = getWarnings(
        'SELECT a.col1 FROM t1 a INNER JOIN t2 b ON a.id = b.id',
        { schema: true },
      );
      expect(warnings).toHaveLength(2);
      expect(warnings[0].message).toContain('Schema is missing from t1');
      expect(warnings[1].message).toContain('Schema is missing from t2');
    });

    it('warns for INSERT target without schema', () => {
      const warnings = getWarnings('INSERT INTO table_name (col1) VALUES (1)', { schema: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Schema is missing from table_name');
    });

    it('warns for UPDATE target without schema', () => {
      const warnings = getWarnings('UPDATE table_name SET col1 = 1', { schema: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Schema is missing from table_name');
    });

    it('warns for DELETE target without schema', () => {
      const warnings = getWarnings('DELETE FROM table_name', { schema: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Schema is missing from table_name');
    });

    it('warns for EXEC proc without schema', () => {
      const warnings = getWarnings("EXEC proc_name @p = 1", { schema: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Schema is missing from proc_name');
    });

    it('does not warn for EXEC proc with schema', () => {
      const warnings = getWarnings("EXEC dbo.proc_name @p = 1", { schema: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn for CTE references', () => {
      const warnings = getWarnings(
        'WITH cte AS (SELECT a FROM dbo.t) SELECT * FROM cte',
        { schema: true },
      );
      expect(warnings).toHaveLength(0);
    });

    it('includes line number in warning message', () => {
      const warnings = getWarnings('SELECT *\nFROM table_name', { schema: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toMatch(/\(line \d+\)/);
    });
  });

  describe('missing alias warnings', () => {
    it('warns when table has no alias', () => {
      const warnings = getWarnings('SELECT * FROM table_name', { alias: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('table_name is not aliased');
    });

    it('does not warn when table has alias (implicit)', () => {
      const warnings = getWarnings('SELECT * FROM table_name t', { alias: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn when table has alias (AS keyword)', () => {
      const warnings = getWarnings('SELECT * FROM table_name AS t', { alias: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn for temp tables', () => {
      const warnings = getWarnings('SELECT * FROM #temp', { alias: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn for table variables', () => {
      const warnings = getWarnings('SELECT * FROM @tableVar', { alias: true });
      expect(warnings).toHaveLength(0);
    });

    it('warns for join table without alias', () => {
      const warnings = getWarnings(
        'SELECT * FROM dbo.t1 a INNER JOIN dbo.t2 ON a.id = dbo.t2.id',
        { alias: true },
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('dbo.t2 is not aliased');
    });

    it('does not warn for INSERT target without alias', () => {
      const warnings = getWarnings('INSERT INTO table_name (col1) VALUES (1)', { alias: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn for UPDATE target without alias', () => {
      const warnings = getWarnings('UPDATE table_name SET col1 = 1', { alias: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn for DELETE target without alias', () => {
      const warnings = getWarnings('DELETE FROM table_name', { alias: true });
      expect(warnings).toHaveLength(0);
    });

    it('does not warn for CTE references', () => {
      const warnings = getWarnings(
        'WITH cte AS (SELECT a FROM dbo.t b) SELECT * FROM cte',
        { alias: true },
      );
      expect(warnings).toHaveLength(0);
    });
  });

  describe('both warnings enabled', () => {
    it('produces both schema and alias warnings', () => {
      const warnings = getWarnings('SELECT * FROM table_name', { schema: true, alias: true });
      expect(warnings).toHaveLength(2);
      expect(warnings[0].message).toContain('Schema is missing from table_name');
      expect(warnings[1].message).toContain('table_name is not aliased');
    });
  });

  describe('missing SET NOCOUNT ON warnings', () => {
    it('warns when stored procedure lacks SET NOCOUNT ON', () => {
      const sql = `CREATE PROCEDURE dbo.MyProc
AS
BEGIN
  SELECT 1
END`;
      const warnings = getWarnings(sql, { nocount: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('does not contain SET NOCOUNT ON');
      expect(warnings[0].message).toContain('dbo.MyProc');
    });

    it('does not warn when SET NOCOUNT ON is present', () => {
      const sql = `CREATE PROCEDURE dbo.MyProc
AS
BEGIN
  SET NOCOUNT ON
  SELECT 1
END`;
      const warnings = getWarnings(sql, { nocount: true });
      expect(warnings).toHaveLength(0);
    });

    it('warns when SET NOCOUNT OFF is used instead', () => {
      const sql = `CREATE PROCEDURE dbo.MyProc
AS
BEGIN
  SET NOCOUNT OFF
  SELECT 1
END`;
      const warnings = getWarnings(sql, { nocount: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('does not contain SET NOCOUNT ON');
    });

    it('does not warn when option is disabled', () => {
      const sql = `CREATE PROCEDURE dbo.MyProc
AS
BEGIN
  SELECT 1
END`;
      const warnings = getWarnings(sql, { nocount: false });
      expect(warnings).toHaveLength(0);
    });

    it('includes line number in warning', () => {
      const sql = `CREATE PROCEDURE dbo.MyProc
AS
BEGIN
  SELECT 1
END`;
      const warnings = getWarnings(sql, { nocount: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toMatch(/\(line \d+\)/);
    });
  });

  describe('missing nullability warnings', () => {
    it('does not warn when all columns have NULL or NOT NULL', () => {
      const sql = 'CREATE TABLE #t (id INT NOT NULL, name VARCHAR(50) NULL)';
      const warnings = getWarnings(sql, { nullability: true });
      expect(warnings).toHaveLength(0);
    });

    it('warns when a column is missing nullability', () => {
      const sql = 'CREATE TABLE #t (id INT, name VARCHAR(50) NOT NULL)';
      const warnings = getWarnings(sql, { nullability: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Column id in #t is missing NULL or NOT NULL');
    });

    it('warns for table variable missing nullability', () => {
      const sql = 'DECLARE @t TABLE (id INT, name VARCHAR(50) NULL)';
      const warnings = getWarnings(sql, { nullability: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Column id in @t is missing NULL or NOT NULL');
    });

    it('does not warn for regular (non-temp) CREATE TABLE', () => {
      const sql = 'CREATE TABLE dbo.t1 (id INT)';
      const warnings = getWarnings(sql, { nullability: true });
      expect(warnings).toHaveLength(0);
    });

    it('warns for column with IDENTITY but no NULL/NOT NULL', () => {
      const sql = 'CREATE TABLE #t (id INT IDENTITY(1,1), name VARCHAR(50) NOT NULL)';
      const warnings = getWarnings(sql, { nullability: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Column id in #t');
    });

    it('warns only for columns missing nullability when some have it', () => {
      const sql = 'CREATE TABLE #t (id INT, name VARCHAR(50) NOT NULL, age INT)';
      const warnings = getWarnings(sql, { nullability: true });
      expect(warnings).toHaveLength(2);
      expect(warnings[0].message).toContain('Column id');
      expect(warnings[1].message).toContain('Column age');
    });

    it('handles bracketed column names', () => {
      const sql = 'CREATE TABLE #t ([col1] INT, [col2] VARCHAR(50) NULL)';
      const warnings = getWarnings(sql, { nullability: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('[col1]');
    });

    it('includes line number in warning', () => {
      const sql = 'CREATE TABLE #t (\n  id INT\n)';
      const warnings = getWarnings(sql, { nullability: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toMatch(/\(line \d+\)/);
    });

    it('does not warn when option is disabled', () => {
      const sql = 'CREATE TABLE #t (id INT)';
      const warnings = getWarnings(sql, { nullability: false });
      expect(warnings).toHaveLength(0);
    });
  });

  describe('no warnings when disabled', () => {
    it('produces no warnings when all options are false', () => {
      const warnings = getWarnings('SELECT * FROM table_name');
      expect(warnings).toHaveLength(0);
    });
  });

  describe('insert column mapping check', () => {
    it('shows mapping with no MISMATCH when columns align', () => {
      const sql = `INSERT INTO dbo.t (col1, col2, col3) SELECT col1, col2, col3 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('INSERT into dbo.t');
      expect(m).toContain('col1 -> col1');
      expect(m).toContain('col2 -> col2');
      expect(m).toContain('col3 -> col3');
      expect(m).not.toContain('[MISMATCH]');
    });

    it('flags swapped columns as MISMATCH', () => {
      const sql = `INSERT INTO t (col1, col2, col3, col4) SELECT col1, col2, 'x' AS col4, 'x' AS col3 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('col4 -> col3   [MISMATCH]');
      expect(m).toContain('col3 -> col4   [MISMATCH]');
      const mismatches = m.match(/\[MISMATCH\]/g);
      expect(mismatches).toHaveLength(2);
    });

    it('uses last part of qualified source name for comparison', () => {
      const sql = `INSERT INTO t (col1, col2) SELECT s.col1, s.col2 FROM src s`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).not.toContain('[MISMATCH]');
    });

    it('uses alias instead of underlying expression name', () => {
      const sql = `INSERT INTO t (col1, col2) SELECT other_col AS col1, col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('col1 -> col1');
      expect(m).not.toContain('[MISMATCH]');
    });

    it('shows <expr> and flags MISMATCH for literal without alias', () => {
      const sql = `INSERT INTO t (col1, col2) SELECT 'hardcoded', col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('<expr> -> col1   [MISMATCH]');
      expect(m).toContain('col2   -> col2');
    });

    it('emits column-count mismatch warning line and pads short side', () => {
      const sql = `INSERT INTO t (col1, col2, col3) SELECT col1, col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('INSERT has 3 target column(s) but SELECT has 2 item(s).');
      expect(m).toContain('(missing)');
    });

    it('emits nothing for INSERT without explicit column list', () => {
      const sql = `INSERT INTO t SELECT col1, col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(0);
    });

    it('emits nothing for INSERT...VALUES', () => {
      const sql = `INSERT INTO t (col1, col2) VALUES ('a', 'b')`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(0);
    });

    it('detects INSERT inside BEGIN...END', () => {
      const sql = `BEGIN INSERT INTO t (col1, col2) SELECT col2, col1 FROM src END`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      const mismatches = m.match(/\[MISMATCH\]/g);
      expect(mismatches).toHaveLength(2);
    });

    it('compares case-insensitively and strips brackets', () => {
      const sql = `INSERT INTO t ([col1], col2) SELECT [COL1], COL2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).not.toContain('[MISMATCH]');
    });

    it('emits nothing when checkInsertColumns is false', () => {
      const sql = `INSERT INTO t (col1, col2) SELECT col2, col1 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: false });
      expect(warnings).toHaveLength(0);
    });
  });

  describe('insert column mapping with temp-table inference', () => {
    it('infers target columns from earlier CREATE TABLE #t', () => {
      const sql = `CREATE TABLE #t (col1 INT, col2 INT, col3 INT);
INSERT INTO #t SELECT col1, col2, col3 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('INSERT into #t');
      expect(m).toContain('col1 -> col1');
      expect(m).toContain('col2 -> col2');
      expect(m).toContain('col3 -> col3');
      expect(m).not.toContain('[MISMATCH]');
    });

    it('flags swapped columns when inferred from CREATE TABLE #t', () => {
      const sql = `CREATE TABLE #t (col1 INT, col2 INT, col3 INT);
INSERT INTO #t SELECT col1, 'x' AS col3, 'x' AS col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('col3 -> col2   [MISMATCH]');
      expect(m).toContain('col2 -> col3   [MISMATCH]');
      const mismatches = m.match(/\[MISMATCH\]/g);
      expect(mismatches).toHaveLength(2);
    });

    it('infers target columns from earlier DECLARE @t TABLE', () => {
      const sql = `DECLARE @t TABLE (col1 INT, col2 INT);
INSERT INTO @t SELECT col2, col1 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('INSERT into @t');
      expect(m).toContain('col2 -> col1   [MISMATCH]');
      expect(m).toContain('col1 -> col2   [MISMATCH]');
    });

    it('stays silent when no prior temp-table definition exists', () => {
      const sql = `INSERT INTO #t SELECT col1, col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(0);
    });

    it('uses most recent definition when temp table is re-CREATE-d', () => {
      const sql = `CREATE TABLE #t (a INT, b INT);
DROP TABLE #t;
CREATE TABLE #t (col1 INT, col2 INT);
INSERT INTO #t SELECT col1, col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('col1 -> col1');
      expect(m).toContain('col2 -> col2');
      expect(m).not.toContain('[MISMATCH]');
    });

    it('matches bracketed insert target [#t] against #t definition', () => {
      const sql = `CREATE TABLE #t (col1 INT, col2 INT);
INSERT INTO [#t] SELECT col1, col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).not.toContain('[MISMATCH]');
    });

    it('does not leak definitions from CREATE PROCEDURE body to outer batch', () => {
      const sql = `CREATE PROCEDURE p AS
BEGIN
  CREATE TABLE #t (col1 INT, col2 INT);
END;
INSERT INTO #t SELECT col1, col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(0);
    });

    it('detects mismatch inside CREATE PROCEDURE body using locally defined #t', () => {
      const sql = `CREATE PROCEDURE p AS
BEGIN
  CREATE TABLE #t (col1 INT, col2 INT);
  INSERT INTO #t SELECT col2, col1 FROM src;
END`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const mismatches = warnings[0].message.match(/\[MISMATCH\]/g);
      expect(mismatches).toHaveLength(2);
    });

    it('does not infer for non-temp table without column list', () => {
      const sql = `CREATE TABLE dbo.t (col1 INT, col2 INT);
INSERT INTO dbo.t SELECT col2, col1 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(0);
    });

    it('ignores constraint rows when extracting column names', () => {
      const sql = `CREATE TABLE #t (col1 INT, col2 INT, PRIMARY KEY (col1));
INSERT INTO #t SELECT col1, col2 FROM src`;
      const warnings = getWarnings(sql, { checkInsertColumns: true });
      expect(warnings).toHaveLength(1);
      const m = warnings[0].message;
      expect(m).toContain('col1 -> col1');
      expect(m).toContain('col2 -> col2');
      expect(m).not.toContain('[MISMATCH]');
      expect(m).not.toContain('PRIMARY');
    });
  });
});
