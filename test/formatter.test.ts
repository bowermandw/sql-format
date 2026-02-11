import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tokenize, attachComments } from '../src/tokenizer';
import { parse } from '../src/parser';
import { format } from '../src/formatter';
import { loadConfig, DEFAULT_CONFIG, FormatConfig } from '../src/config';

function formatSQL(sql: string, config?: Partial<FormatConfig>): string {
  const tokens = attachComments(tokenize(sql));
  const ast = parse(tokens);
  const mergedConfig = config ? { ...DEFAULT_CONFIG, ...config } as FormatConfig : DEFAULT_CONFIG;
  return format(ast, mergedConfig);
}

describe('formatter', () => {
  it('formats a simple SELECT', () => {
    const result = formatSQL('select a, b from t');
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
  });

  it('applies uppercase casing to keywords', () => {
    const result = formatSQL('select a from t where a = 1');
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
    expect(result).toContain('WHERE');
  });

  it('applies lowercase casing when configured', () => {
    const config = {
      ...DEFAULT_CONFIG,
      casing: { ...DEFAULT_CONFIG.casing, reservedKeywords: 'lowercase' as const },
    };
    const tokens = attachComments(tokenize('SELECT a FROM t'));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('select');
    expect(result).toContain('from');
  });

  it('formats CASE expression collapsed when short', () => {
    const result = formatSQL("select case when x = 1 then 'a' else 'b' end from t");
    expect(result).toContain("CASE WHEN");
    expect(result).toContain("THEN");
    expect(result).toContain("ELSE");
    expect(result).toContain("END");
  });

  it('formats IF/ELSE collapsed when short', () => {
    const result = formatSQL("if @x > 0 print 'yes' else print 'no'");
    // Should be collapsed since it's short
    expect(result).toContain("IF");
    expect(result).toContain("ELSE");
  });

  it('formats SET NOCOUNT ON', () => {
    const result = formatSQL('set nocount on');
    expect(result.trim()).toBe('SET NOCOUNT ON');
  });

  it('formats BEGIN/END blocks with indentation', () => {
    const result = formatSQL('begin select 1 end');
    expect(result).toContain('BEGIN');
    expect(result).toContain('END');
    const lines = result.trim().split('\n');
    expect(lines[0].trim()).toBe('BEGIN');
    expect(lines[lines.length - 1].trim()).toBe('END');
  });

  it('formats DECLARE statement', () => {
    const result = formatSQL('declare @x int = 5');
    expect(result).toContain('DECLARE');
    expect(result).toContain('@x');
    expect(result).toContain('INT');
  });

  it('formats procedure parameters on new lines', () => {
    const result = formatSQL(`create procedure dbo.myProc (@a int, @b varchar(20))
as begin select 1 end`);
    expect(result).toContain('CREATE PROCEDURE');
    expect(result).toContain('@a');
    expect(result).toContain('@b');
  });

  it('formats with leading commas when configured', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      lists: {
        ...DEFAULT_CONFIG.lists,
        placeFirstItemOnNewLine: 'never' as const,
        commas: {
          ...DEFAULT_CONFIG.lists.commas,
          placeCommasBeforeItems: true,
        },
      },
      dml: {
        ...DEFAULT_CONFIG.dml,
        collapseShortStatements: false,
      },
    };
    const tokens = attachComments(tokenize('select a, b, c from t'));
    const ast = parse(tokens);
    const result = format(ast, config);
    // Should have lines with leading commas
    const lines = result.trim().split('\n');
    const commaLines = lines.filter(l => l.trimStart().startsWith(','));
    expect(commaLines.length).toBeGreaterThan(0);
  });

  it('handles idempotent formatting', () => {
    const sql = 'select column1, column2, column3 from dbo.table1 where column1 = 1';
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });

  it('encloses identifiers with brackets when configured', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      identifiers: {
        ...DEFAULT_CONFIG.identifiers,
        encloseIdentifiers: 'withBrackets',
      },
    };
    const tokens = attachComments(tokenize('SELECT column1, column2 FROM dbo.table1'));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('[column1]');
    expect(result).toContain('[column2]');
    expect(result).toContain('[dbo].[table1]');
    // Keywords should NOT be bracketed
    expect(result).not.toContain('[SELECT]');
    expect(result).not.toContain('[FROM]');
  });

  it('does not bracket data types with withBrackets', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      identifiers: {
        ...DEFAULT_CONFIG.identifiers,
        encloseIdentifiers: 'withBrackets',
      },
    };
    const tokens = attachComments(tokenize('DECLARE @x INT'));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('INT');
    expect(result).not.toContain('[INT]');
  });

  it('encloses data types with brackets when configured', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      dataTypes: { encloseDataTypes: 'withBrackets' },
    };
    const tokens = attachComments(tokenize('DECLARE @x VARCHAR(50), @y INT'));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('[VARCHAR](50)');
    expect(result).toContain('[INT]');
  });

  it('does not bracket identifiers when only enclose-datatypes is set', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      dataTypes: { encloseDataTypes: 'withBrackets' },
    };
    const tokens = attachComments(tokenize('SELECT col1 FROM dbo.t1'));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).not.toContain('[col1]');
    expect(result).not.toContain('[dbo]');
  });

  it('strips brackets with withoutBrackets', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      identifiers: {
        ...DEFAULT_CONFIG.identifiers,
        encloseIdentifiers: 'withoutBrackets',
      },
    };
    const tokens = attachComments(tokenize('SELECT [column1] FROM [dbo].[table1]'));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).not.toContain('[');
    expect(result).toContain('column1');
    expect(result).toContain('dbo.table1');
  });
  it('inserts semicolons after statements when configured', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      whitespace: { ...DEFAULT_CONFIG.whitespace, insertSemicolons: 'insert' },
    };
    const tokens = attachComments(tokenize('SET NOCOUNT ON\nSELECT a FROM t'));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('SET NOCOUNT ON;');
    expect(result).toMatch(/FROM\s+t;/);
  });

  it('does not insert semicolons by default', () => {
    const result = formatSQL('SET NOCOUNT ON\nSELECT a FROM t');
    expect(result).not.toContain(';');
  });

  it('inserts semicolons inside BEGIN/END blocks', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      whitespace: { ...DEFAULT_CONFIG.whitespace, insertSemicolons: 'insert' },
    };
    const tokens = attachComments(tokenize('BEGIN\nSET NOCOUNT ON\nSELECT 1\nEND'));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('SET NOCOUNT ON;');
    // BEGIN and END themselves should NOT have semicolons
    expect(result).not.toMatch(/BEGIN;/);
    expect(result).not.toMatch(/END;/);
  });
});

describe('formatter with style1.json', () => {
  const stylePath = path.resolve(__dirname, '../style1.json');

  it('formats storedproctest.sql', () => {
    const config = loadConfig(stylePath);
    const sql = fs.readFileSync(path.resolve(__dirname, 'fixtures/storedproctest.sql'), 'utf-8');
    const tokens = attachComments(tokenize(sql));
    const ast = parse(tokens);
    const result = format(ast, config);

    // Check key formatting features
    expect(result).toContain('CREATE OR ALTER PROCEDURE');
    expect(result).toContain('dbo.rpt_stuff');
    expect(result).toContain('@user_id     VARCHAR(20)');
    expect(result).toContain('AS');
    expect(result).toContain('BEGIN');
    expect(result).toContain('SET NOCOUNT ON');
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
    expect(result).toContain('dbo.some_table');
    expect(result).toContain('END');
    expect(result).toContain('GO');
  });
});

describe('alignment', () => {
  it('aligns proc param data types when ddl.alignDataTypesAndConstraints is true', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      ddl: {
        ...DEFAULT_CONFIG.ddl,
        alignDataTypesAndConstraints: true,
        placeFirstProcedureParameterOnNewLine: 'always',
      },
    };
    const sql = `CREATE PROCEDURE dbo.myProc (@a INT, @longname VARCHAR(50) = NULL)
AS BEGIN SELECT 1 END`;
    const tokens = attachComments(tokenize(sql));
    const ast = parse(tokens);
    const result = format(ast, config);
    // @a should be padded to match @longname width
    expect(result).toContain('@a        INT');
    expect(result).toContain('@longname VARCHAR(50)');
  });

  it('does not align proc params when ddl.alignDataTypesAndConstraints is false', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      ddl: {
        ...DEFAULT_CONFIG.ddl,
        alignDataTypesAndConstraints: false,
        placeFirstProcedureParameterOnNewLine: 'always',
      },
    };
    const sql = `CREATE PROCEDURE dbo.myProc (@a INT, @longname VARCHAR(50))
AS BEGIN SELECT 1 END`;
    const tokens = attachComments(tokenize(sql));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('@a INT');
    expect(result).toContain('@longname VARCHAR(50)');
  });

  it('aligns DECLARE data types when variables.alignDataTypesAndValues is true', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      variables: {
        ...DEFAULT_CONFIG.variables,
        alignDataTypesAndValues: true,
      },
    };
    const sql = 'DECLARE @x INT, @longvar VARCHAR(50) = NULL';
    const tokens = attachComments(tokenize(sql));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('@x       INT');
    expect(result).toContain('@longvar VARCHAR(50)');
  });

  it('aligns CREATE TABLE column data types when ddl.alignDataTypesAndConstraints is true', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      ddl: {
        ...DEFAULT_CONFIG.ddl,
        alignDataTypesAndConstraints: true,
      },
    };
    const sql = 'CREATE TABLE dbo.t (id INT, longcolumn VARCHAR(50))';
    const tokens = attachComments(tokenize(sql));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('id         INT');
    expect(result).toContain('longcolumn VARCHAR(50)');
  });

  it('does not align CREATE TABLE columns when ddl.alignDataTypesAndConstraints is false', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      ddl: {
        ...DEFAULT_CONFIG.ddl,
        alignDataTypesAndConstraints: false,
      },
    };
    const sql = 'CREATE TABLE dbo.t (id INT, longcolumn VARCHAR(50))';
    const tokens = attachComments(tokenize(sql));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('id INT');
    expect(result).toContain('longcolumn VARCHAR(50)');
  });

  it('does not align DECLARE data types when variables.alignDataTypesAndValues is false', () => {
    const config: FormatConfig = {
      ...DEFAULT_CONFIG,
      variables: {
        ...DEFAULT_CONFIG.variables,
        alignDataTypesAndValues: false,
      },
    };
    const sql = 'DECLARE @x INT, @longvar VARCHAR(50)';
    const tokens = attachComments(tokenize(sql));
    const ast = parse(tokens);
    const result = format(ast, config);
    expect(result).toContain('@x INT');
    expect(result).toContain('@longvar VARCHAR(50)');
  });
});

describe('PIVOT / UNPIVOT', () => {
  it('formats a basic PIVOT query', () => {
    const sql = `SELECT VendorID, [250] AS Emp1, [251] AS Emp2
FROM (SELECT VendorID, EmployeeID, Amount FROM Purchasing.PurchaseOrderHeader) AS src
PIVOT (SUM(Amount) FOR EmployeeID IN ([250], [251], [252])) AS pvt`;
    const result = formatSQL(sql);
    expect(result).toContain('PIVOT');
    expect(result).toContain('SUM(Amount)');
    expect(result).toContain('FOR');
    expect(result).toContain('IN');
    expect(result).toContain('AS pvt');
  });

  it('formats PIVOT with correct indentation structure', () => {
    const sql = `SELECT VendorID, [250], [251]
FROM (SELECT VendorID, EmployeeID, Amount FROM Purchasing.PurchaseOrderHeader) AS src
PIVOT (SUM(Amount) FOR EmployeeID IN ([250], [251])) AS pvt`;
    const result = formatSQL(sql);
    const lines = result.split('\n');
    // Find the PIVOT line
    const pivotLine = lines.find(l => l.trim() === 'PIVOT');
    expect(pivotLine).toBeDefined();
    // Verify the structure: PIVOT, (, aggregation, FOR...IN, ), has proper nesting
    const pivotIdx = lines.indexOf(pivotLine!);
    expect(lines[pivotIdx + 1].trim()).toBe('(');
    expect(lines[pivotIdx + 2].trim()).toContain('SUM(Amount)');
    expect(lines[pivotIdx + 3].trim()).toMatch(/^FOR/);
  });

  it('formats UNPIVOT query', () => {
    const sql = `SELECT VendorID, Employee, Orders
FROM pvt
UNPIVOT (Orders FOR Employee IN ([Emp1], [Emp2], [Emp3])) AS unpvt`;
    const result = formatSQL(sql);
    expect(result).toContain('UNPIVOT');
    expect(result).toContain('FOR');
    expect(result).toContain('IN');
    expect(result).toContain('AS unpvt');
  });

  it('PIVOT output is idempotent', () => {
    const sql = `SELECT VendorID, [250], [251]
FROM (SELECT VendorID, EmployeeID, Amount FROM Purchasing.PurchaseOrderHeader) AS src
PIVOT (SUM(Amount) FOR EmployeeID IN ([250], [251])) AS pvt`;
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(second).toBe(first);
  });

  it('UNPIVOT output is idempotent', () => {
    const sql = `SELECT VendorID, Employee, Orders
FROM pvt
UNPIVOT (Orders FOR Employee IN ([Emp1], [Emp2], [Emp3])) AS unpvt`;
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(second).toBe(first);
  });

  it('PIVOT does not consume PIVOT/UNPIVOT as alias', () => {
    const sql = `SELECT * FROM t PIVOT (SUM(x) FOR y IN ([a], [b])) AS p`;
    const result = formatSQL(sql);
    expect(result).toContain('PIVOT');
    // PIVOT should appear as a keyword with a paren block, not as a bare alias of t
    expect(result).toContain('SUM(x)');
    expect(result).toContain('AS p');
  });
});

describe('formatter with smartish_style.json', () => {
  const stylePath = path.resolve(__dirname, '../smartish_style.json');

  it('uses lowercase keywords', () => {
    const config = loadConfig(stylePath);
    const sql = 'SELECT a, b FROM dbo.table1 WHERE a = 1';
    const tokens = attachComments(tokenize(sql));
    const ast = parse(tokens);
    const result = format(ast, config);

    expect(result).toContain('select');
    expect(result).toContain('from');
    expect(result).toContain('where');
  });

  it('uses leading commas', () => {
    const config = loadConfig(stylePath);
    const sql = 'SELECT a, b, c FROM dbo.table1';
    const tokens = attachComments(tokenize(sql));
    const ast = parse(tokens);
    const result = format(ast, config);

    const lines = result.trim().split('\n');
    const commaLines = lines.filter(l => l.trimStart().startsWith(','));
    expect(commaLines.length).toBeGreaterThan(0);
  });
});
