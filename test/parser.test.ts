import { describe, it, expect } from 'vitest';
import { tokenize, attachComments } from '../src/tokenizer';
import { parse } from '../src/parser';

function parseSQL(sql: string) {
  const tokens = attachComments(tokenize(sql));
  return parse(tokens);
}

describe('parser', () => {
  it('parses a simple SELECT', () => {
    const ast = parseSQL('SELECT column1, column2 FROM dbo.table1');
    expect(ast.type).toBe('batch');
    expect(ast.batches).toHaveLength(1);
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('select');
    if (stmt.type === 'select') {
      expect(stmt.columns).toHaveLength(2);
      expect(stmt.from).toBeDefined();
    }
  });

  it('parses SELECT with WHERE', () => {
    const ast = parseSQL('SELECT a FROM t WHERE a > 1');
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('select');
    if (stmt.type === 'select') {
      expect(stmt.where).toBeDefined();
      expect(stmt.where!.type).toBe('where');
    }
  });

  it('parses SELECT with GROUP BY and ORDER BY', () => {
    const ast = parseSQL('SELECT a, COUNT(*) FROM t GROUP BY a ORDER BY a DESC');
    const stmt = ast.batches[0].statements[0];
    if (stmt.type === 'select') {
      expect(stmt.groupBy).toBeDefined();
      expect(stmt.orderBy).toBeDefined();
      expect(stmt.orderBy!.items[0].direction!.value.toUpperCase()).toBe('DESC');
    }
  });

  it('parses CASE expression', () => {
    const ast = parseSQL("SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t");
    const stmt = ast.batches[0].statements[0];
    if (stmt.type === 'select') {
      const col = stmt.columns[0];
      expect(col.type).toBe('case');
    }
  });

  it('parses CREATE OR ALTER PROCEDURE', () => {
    const ast = parseSQL(`
      CREATE OR ALTER PROCEDURE dbo.myProc (@id INT)
      AS
      BEGIN
        SELECT 1
      END
    `);
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('createProcedure');
    if (stmt.type === 'createProcedure') {
      expect(stmt.keywords).toHaveLength(4); // CREATE, OR, ALTER, PROCEDURE
      expect(stmt.parameters).toHaveLength(1);
      expect(stmt.body.type).toBe('beginEnd');
    }
  });

  it('parses IF/ELSE', () => {
    const ast = parseSQL("IF @x > 0 PRINT 'yes' ELSE PRINT 'no'");
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('ifElse');
    if (stmt.type === 'ifElse') {
      expect(stmt.elseClause).toBeDefined();
    }
  });

  it('parses BEGIN/END block', () => {
    const ast = parseSQL('BEGIN SELECT 1 SELECT 2 END');
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('beginEnd');
    if (stmt.type === 'beginEnd') {
      expect(stmt.statements).toHaveLength(2);
    }
  });

  it('parses SET NOCOUNT ON', () => {
    const ast = parseSQL('SET NOCOUNT ON');
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('set');
    if (stmt.type === 'set') {
      expect(stmt.isSpecial).toBe(true);
    }
  });

  it('parses DECLARE statement', () => {
    const ast = parseSQL('DECLARE @x INT = 5');
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('declare');
    if (stmt.type === 'declare') {
      expect(stmt.variables).toHaveLength(1);
      expect(stmt.variables[0].name.value).toBe('@x');
      expect(stmt.variables[0].default).toBeDefined();
    }
  });

  it('parses batch separator (GO)', () => {
    const ast = parseSQL('SELECT 1\nGO\nSELECT 2');
    expect(ast.batches).toHaveLength(2);
    expect(ast.batches[0].separator).toBeDefined();
  });

  it('parses function calls', () => {
    const ast = parseSQL('SELECT COUNT(*), ISNULL(a, 0) FROM t');
    const stmt = ast.batches[0].statements[0];
    if (stmt.type === 'select') {
      expect(stmt.columns[0].type).toBe('functionCall');
      expect(stmt.columns[1].type).toBe('functionCall');
    }
  });

  it('parses qualified names with dots', () => {
    const ast = parseSQL('SELECT dbo.table1.column1 FROM dbo.table1');
    const stmt = ast.batches[0].statements[0];
    if (stmt.type === 'select') {
      const col = stmt.columns[0];
      expect(col.type).toBe('identifier');
      if (col.type === 'identifier') {
        expect(col.parts).toHaveLength(3);
      }
    }
  });

  it('parses column aliases with AS', () => {
    const ast = parseSQL('SELECT a AS alias1, b alias2 FROM t');
    const stmt = ast.batches[0].statements[0];
    if (stmt.type === 'select') {
      const col1 = stmt.columns[0] as any;
      expect(col1.alias).toBeDefined();
      expect(col1.alias.asToken).toBeDefined();
      const col2 = stmt.columns[1] as any;
      expect(col2.alias).toBeDefined();
    }
  });

  it('parses INSERT statement', () => {
    const ast = parseSQL('INSERT INTO t (a, b) VALUES (1, 2)');
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('insert');
    if (stmt.type === 'insert') {
      expect(stmt.columns).toHaveLength(2);
      expect(stmt.values!.rows).toHaveLength(1);
    }
  });

  it('parses UPDATE statement', () => {
    const ast = parseSQL('UPDATE t SET a = 1, b = 2 WHERE c = 3');
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('update');
    if (stmt.type === 'update') {
      expect(stmt.assignments).toHaveLength(2);
      expect(stmt.where).toBeDefined();
    }
  });

  it('parses DELETE statement', () => {
    const ast = parseSQL('DELETE FROM t WHERE a = 1');
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('delete');
    if (stmt.type === 'delete') {
      expect(stmt.where).toBeDefined();
    }
  });

  it('parses storedproctest.sql without errors', () => {
    const sql = `create or alter procedure dbo.rpt_stuff (@user_id VARCHAR(20), @fiscal_year INT = 2025,
@some_param VARCHAR(50) = NULL,
@some_param2 VARCHAR(50) = NULL
)
as
begin
set nocount on;
select column1, column2, column3,
column4,
case when column1 = 'asdf' then 1 else 0 end as column5
from dbo.some_table

if @@rowcount > 0
    print 'good'
    else print 'bad'
end
go`;
    const ast = parseSQL(sql);
    expect(ast.batches).toHaveLength(1);
    const stmt = ast.batches[0].statements[0];
    expect(stmt.type).toBe('createProcedure');
    if (stmt.type === 'createProcedure') {
      expect(stmt.parameters).toHaveLength(4);
      expect(stmt.body.type).toBe('beginEnd');
    }
  });
});
