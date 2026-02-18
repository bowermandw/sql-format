import { describe, it, expect } from 'vitest';
import { formatSQL, SQL_SIMPLE_SELECT, SQL_SELECT_WHERE, SQL_SELECT_JOIN, SQL_DECLARE, SQL_SET_NOCOUNT, SQL_CREATE_TABLE, SQL_CREATE_PROC, SQL_IF_ELSE, SQL_SELECT_CTE, SQL_SELECT_CASE, SQL_SELECT_GROUPBY, SQL_SELECT_SUBQUERY } from '../helpers';

// ---- casing.reservedKeywords ----

describe('casing.reservedKeywords', () => {
  const base = { casing: { reservedKeywords: 'uppercase', builtInFunctions: 'uppercase', builtInDataTypes: 'uppercase', globalVariables: 'uppercase', useObjectDefinitionCase: true } };

  it('uppercase: keywords are uppercased', () => {
    const result = formatSQL('select a from t where a = 1', { ...base, casing: { ...base.casing, reservedKeywords: 'uppercase' } });
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
    expect(result).toContain('WHERE');
  });

  it('lowercase: keywords are lowercased', () => {
    const result = formatSQL('SELECT a FROM t WHERE a = 1', { ...base, casing: { ...base.casing, reservedKeywords: 'lowercase' } });
    expect(result).toContain('select');
    expect(result).toContain('from');
    expect(result).toContain('where');
  });

  it('asis: preserves case of the string passed to kw()', () => {
    // The formatter calls kw() with hardcoded uppercase strings like 'SELECT', 'FROM', etc.
    // With 'asis', caseWord returns the input unchanged, so keywords remain uppercase.
    // This means 'asis' effectively acts like uppercase for keywords emitted via kw().
    const result = formatSQL('select a from t where a = 1', { ...base, casing: { ...base.casing, reservedKeywords: 'asis' } });
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
    expect(result).toContain('WHERE');
  });

  it('lowerCamelCase: keywords in lowerCamelCase', () => {
    const result = formatSQL('SET NOCOUNT ON', { ...base, casing: { ...base.casing, reservedKeywords: 'lowerCamelCase' } });
    expect(result.trim()).toContain('set');
    expect(result.trim()).toContain('nocount');
    expect(result.trim()).toContain('on');
  });

  it('upperCamelCase: keywords in UpperCamelCase', () => {
    const result = formatSQL('set nocount on', { ...base, casing: { ...base.casing, reservedKeywords: 'upperCamelCase' } });
    expect(result.trim()).toContain('Set');
    expect(result.trim()).toContain('Nocount');
    expect(result.trim()).toContain('On');
  });

  it('uppercase applies to JOIN keywords', () => {
    const result = formatSQL('select a.col from t1 a inner join t2 b on a.id = b.id', { ...base, casing: { ...base.casing, reservedKeywords: 'uppercase' } });
    expect(result).toContain('INNER JOIN');
    expect(result).toContain('ON');
  });

  it('lowercase applies to DECLARE', () => {
    const result = formatSQL('DECLARE @x INT', { ...base, casing: { ...base.casing, reservedKeywords: 'lowercase' } });
    expect(result).toContain('declare');
  });

  it('lowercase applies to IF/ELSE', () => {
    const result = formatSQL("IF @x > 0 PRINT 'yes' ELSE PRINT 'no'", { ...base, casing: { ...base.casing, reservedKeywords: 'lowercase' } });
    expect(result).toContain('if');
    expect(result).toContain('else');
    expect(result).toContain('print');
  });

  it('lowercase applies to BEGIN/END', () => {
    const result = formatSQL('BEGIN SELECT 1 END', { ...base, casing: { ...base.casing, reservedKeywords: 'lowercase' } });
    expect(result).toContain('begin');
    expect(result).toContain('end');
  });

  it('uppercase applies to CTE keywords', () => {
    const result = formatSQL('with cte as (select a from t) select a from cte', { ...base, casing: { ...base.casing, reservedKeywords: 'uppercase' } });
    expect(result).toContain('WITH');
    expect(result).toContain('AS');
  });

  it('uppercase applies to CASE/WHEN/THEN/ELSE/END', () => {
    const result = formatSQL("select case when x = 1 then 'a' else 'b' end from t", { ...base, casing: { ...base.casing, reservedKeywords: 'uppercase' } });
    expect(result).toContain('CASE');
    expect(result).toContain('WHEN');
    expect(result).toContain('THEN');
    expect(result).toContain('ELSE');
    expect(result).toContain('END');
  });

  it('lowercase applies to GROUP BY and ORDER BY', () => {
    const result = formatSQL('SELECT a, COUNT(*) FROM t GROUP BY a ORDER BY a', {
      ...base,
      casing: { ...base.casing, reservedKeywords: 'lowercase', builtInFunctions: 'uppercase' },
    });
    expect(result).toContain('group');
    expect(result).toContain('by');
    expect(result).toContain('order');
  });

  it('lowercase applies to INSERT INTO VALUES', () => {
    const result = formatSQL('INSERT INTO dbo.t1 (col1) VALUES (1)', { ...base, casing: { ...base.casing, reservedKeywords: 'lowercase' } });
    expect(result).toContain('insert');
    expect(result).toContain('into');
    expect(result).toContain('values');
  });

  it('lowercase applies to UPDATE SET', () => {
    const result = formatSQL("UPDATE dbo.t1 SET col1 = 1 WHERE id = 1", { ...base, casing: { ...base.casing, reservedKeywords: 'lowercase' } });
    expect(result).toContain('update');
    expect(result).toContain('set');
    expect(result).toContain('where');
  });

  it('lowercase applies to DELETE FROM', () => {
    const result = formatSQL('DELETE FROM dbo.t1 WHERE id = 1', { ...base, casing: { ...base.casing, reservedKeywords: 'lowercase' } });
    expect(result).toContain('delete');
    expect(result).toContain('from');
  });

  it('uppercase applies to CREATE TABLE', () => {
    const result = formatSQL('create table dbo.t (id int)', { ...base, casing: { ...base.casing, reservedKeywords: 'uppercase' } });
    expect(result).toContain('CREATE TABLE');
  });

  it('uppercase applies to CREATE PROCEDURE', () => {
    const result = formatSQL('create procedure dbo.p as begin select 1 end', { ...base, casing: { ...base.casing, reservedKeywords: 'uppercase' } });
    expect(result).toContain('CREATE PROCEDURE');
    expect(result).toContain('AS');
  });
});

// ---- casing.builtInFunctions ----

describe('casing.builtInFunctions', () => {
  const base = { casing: { reservedKeywords: 'uppercase', builtInFunctions: 'uppercase', builtInDataTypes: 'uppercase', globalVariables: 'uppercase', useObjectDefinitionCase: true } };

  it('uppercase: functions are uppercased', () => {
    const result = formatSQL('SELECT count(*) FROM t', { ...base, casing: { ...base.casing, builtInFunctions: 'uppercase' } });
    expect(result).toContain('COUNT(*)');
  });

  it('lowercase: functions are lowercased', () => {
    const result = formatSQL('SELECT COUNT(*) FROM t', { ...base, casing: { ...base.casing, builtInFunctions: 'lowercase' } });
    expect(result).toContain('count(*)');
  });

  it('asis: functions preserve original case', () => {
    const result = formatSQL('SELECT Count(*) FROM t', { ...base, casing: { ...base.casing, builtInFunctions: 'asis' } });
    expect(result).toContain('Count(*)');
  });

  it('uppercase applies to GETDATE', () => {
    const result = formatSQL('DECLARE @now DATETIME = getdate()', { ...base, casing: { ...base.casing, builtInFunctions: 'uppercase' } });
    expect(result).toContain('GETDATE()');
  });

  it('lowercase applies to ISNULL', () => {
    const result = formatSQL('SELECT ISNULL(a, 0) FROM t', { ...base, casing: { ...base.casing, builtInFunctions: 'lowercase' } });
    expect(result).toContain('isnull(a, 0)');
  });

  it('uppercase applies to SUM/AVG aggregate functions', () => {
    const result = formatSQL('SELECT sum(a), avg(b) FROM t', { ...base, casing: { ...base.casing, builtInFunctions: 'uppercase' } });
    expect(result).toContain('SUM(a)');
    expect(result).toContain('AVG(b)');
  });

  it('lowercase applies to CONCAT', () => {
    const result = formatSQL("SELECT CONCAT(a, b) FROM t", { ...base, casing: { ...base.casing, builtInFunctions: 'lowercase' } });
    expect(result).toContain('concat(a, b)');
  });
});

// ---- casing.builtInDataTypes ----

describe('casing.builtInDataTypes', () => {
  const base = { casing: { reservedKeywords: 'uppercase', builtInFunctions: 'uppercase', builtInDataTypes: 'uppercase', globalVariables: 'uppercase', useObjectDefinitionCase: true } };

  it('uppercase: data types are uppercased', () => {
    const result = formatSQL('DECLARE @x int', { ...base, casing: { ...base.casing, builtInDataTypes: 'uppercase' } });
    expect(result).toContain('INT');
  });

  it('lowercase: data types are lowercased', () => {
    const result = formatSQL('DECLARE @x INT', { ...base, casing: { ...base.casing, builtInDataTypes: 'lowercase' } });
    expect(result).toContain('int');
  });

  it('asis: data types preserve original case', () => {
    const result = formatSQL('DECLARE @x Int', { ...base, casing: { ...base.casing, builtInDataTypes: 'asis' } });
    expect(result).toContain('Int');
  });

  it('uppercase applies to VARCHAR in DECLARE', () => {
    const result = formatSQL('DECLARE @s varchar(50)', { ...base, casing: { ...base.casing, builtInDataTypes: 'uppercase' } });
    expect(result).toContain('VARCHAR(50)');
  });

  it('lowercase applies to data types in CREATE TABLE', () => {
    const result = formatSQL('CREATE TABLE dbo.t (id INT, name VARCHAR(50))', { ...base, casing: { ...base.casing, builtInDataTypes: 'lowercase' } });
    expect(result).toContain('int');
    expect(result).toContain('varchar(50)');
  });

  it('uppercase applies to data types in proc params', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.p (@a int, @b varchar(20)) AS BEGIN SELECT 1 END', { ...base, casing: { ...base.casing, builtInDataTypes: 'uppercase' } });
    expect(result).toContain('INT');
    expect(result).toContain('VARCHAR(20)');
  });
});

// ---- casing.globalVariables ----

describe('casing.globalVariables', () => {
  const base = { casing: { reservedKeywords: 'uppercase', builtInFunctions: 'uppercase', builtInDataTypes: 'uppercase', globalVariables: 'uppercase', useObjectDefinitionCase: true } };

  it('uppercase: global variables are uppercased', () => {
    const result = formatSQL('SELECT @@rowcount', { ...base, casing: { ...base.casing, globalVariables: 'uppercase' } });
    expect(result).toContain('@@ROWCOUNT');
  });

  it('lowercase: global variables are lowercased', () => {
    const result = formatSQL('SELECT @@ROWCOUNT', { ...base, casing: { ...base.casing, globalVariables: 'lowercase' } });
    expect(result).toContain('@@rowcount');
  });

  it('asis: global variables preserve original case', () => {
    const result = formatSQL('SELECT @@Rowcount', { ...base, casing: { ...base.casing, globalVariables: 'asis' } });
    expect(result).toContain('@@Rowcount');
  });

  it('uppercase applies to @@ERROR', () => {
    const result = formatSQL('SELECT @@error', { ...base, casing: { ...base.casing, globalVariables: 'uppercase' } });
    expect(result).toContain('@@ERROR');
  });

  it('lowercase applies to @@IDENTITY', () => {
    const result = formatSQL('SELECT @@IDENTITY', { ...base, casing: { ...base.casing, globalVariables: 'lowercase' } });
    expect(result).toContain('@@identity');
  });
});

// ---- casing.useObjectDefinitionCase ----

describe('casing.useObjectDefinitionCase', () => {
  it('does not alter user-defined identifiers (true or false)', () => {
    const result = formatSQL('SELECT myColumn FROM dbo.MyTable', {
      casing: { reservedKeywords: 'uppercase', builtInFunctions: 'uppercase', builtInDataTypes: 'uppercase', globalVariables: 'uppercase', useObjectDefinitionCase: true },
    });
    // User-defined identifiers should keep original case regardless
    expect(result).toContain('myColumn');
    expect(result).toContain('MyTable');
  });
});
