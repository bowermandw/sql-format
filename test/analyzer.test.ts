import { describe, it, expect } from 'vitest';
import { tokenize, attachComments } from '../src/tokenizer';
import { parse } from '../src/parser';
import { analyze, Warning } from '../src/analyzer';

function getWarnings(sql: string, opts: { schema?: boolean; alias?: boolean; nocount?: boolean } = {}): Warning[] {
  const tokens = attachComments(tokenize(sql));
  const ast = parse(tokens);
  return analyze(ast, {
    warnMissingSchema: opts.schema ?? false,
    warnMissingAlias: opts.alias ?? false,
    warnMissingNocount: opts.nocount ?? false,
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

  describe('no warnings when disabled', () => {
    it('produces no warnings when all options are false', () => {
      const warnings = getWarnings('SELECT * FROM table_name');
      expect(warnings).toHaveLength(0);
    });
  });
});
