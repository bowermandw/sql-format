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

describe('comments between clauses', () => {
  it('preserves comments before FROM in SELECT', () => {
    const sql = `SELECT
    column1,
    column2
-- comment before FROM
FROM
    some_table`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before FROM');
  });

  it('preserves comments before WHERE in SELECT', () => {
    const sql = `SELECT column1
FROM some_table
-- comment before WHERE
WHERE column1 = 1`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before WHERE');
  });

  it('preserves comments before GROUP BY in SELECT', () => {
    const sql = `SELECT column1, COUNT(*)
FROM some_table
-- comment before GROUP BY
GROUP BY column1`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before GROUP BY');
  });

  it('preserves comments before ORDER BY in SELECT', () => {
    const sql = `SELECT column1
FROM some_table
-- comment before ORDER BY
ORDER BY column1`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before ORDER BY');
  });

  it('preserves comments before HAVING in SELECT', () => {
    const sql = `SELECT column1, COUNT(*)
FROM some_table
GROUP BY column1
-- comment before HAVING
HAVING COUNT(*) > 1`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before HAVING');
  });

  it('preserves trailing comments after last statement', () => {
    const sql = `SELECT 1
-- trailing comment`;
    const result = formatSQL(sql);
    expect(result).toContain('-- trailing comment');
  });

  it('preserves trailing comments after GO', () => {
    const sql = `SELECT 1
GO
-- trailing comment after GO`;
    const result = formatSQL(sql);
    expect(result).toContain('-- trailing comment after GO');
  });

  it('does not insert blank lines between comments with CRLF input', () => {
    const sql = "SELECT 1\r\nGO\r\n-- comment1\r\n-- comment2\r\n";
    const result = formatSQL(sql);
    // Comments should be on consecutive lines with no blank line between them
    expect(result).toContain('-- comment1\n-- comment2');
    // No \r should remain in comment text
    expect(result).not.toContain('\r');
  });

  it('does not insert blank lines between clause comments with CRLF input', () => {
    const sql = "SELECT\r\n    column1\r\n-- comment before FROM\r\nFROM\r\n    some_table\r\n";
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before FROM');
    expect(result).not.toContain('\r');
  });
});

describe('comments between select columns', () => {
  it('preserves a line comment between columns', () => {
    const sql = `SELECT
[column1],
-- [column2],
[column3]
FROM (select [column1], [column2], [column3] FROM dbo.some_table) [tbl1]`;
    const result = formatSQL(sql);
    expect(result).toContain('-- [column2],');
    expect(result).toContain('[column1]');
    expect(result).toContain('[column3]');
  });

  it('preserves a block comment between columns', () => {
    const sql = `SELECT
[column1],
/* [column2], */
[column3]
FROM dbo.some_table WHERE [column1] = 'value_to_prevent_collapse_xxxxxxxxx'`;
    const result = formatSQL(sql);
    expect(result).toContain('/* [column2], */');
  });

  it('preserves multiple comments between columns', () => {
    const sql = `SELECT
[column1],
-- first commented column
-- second commented column
[column3]
FROM dbo.some_table WHERE [column1] = 'value_to_prevent_collapse_xxxxxxxxx'`;
    const result = formatSQL(sql);
    expect(result).toContain('-- first commented column');
    expect(result).toContain('-- second commented column');
  });
});

describe('CASE expression wrapping in SELECT columns', () => {
  it('expands CASE when line with alias exceeds wrapLinesLongerThan', () => {
    const sql = `SELECT
[column1],
CASE WHEN [aa_bbb_cccc] BETWEEN -0.1 AND 0.1 THEN 0 ELSE [aa_bbb_cccc] END AS [aa_bbb_cccc],
[column3]
FROM (SELECT [column1], [aa_bbb_cccc], [column3] FROM dbo.some_table) tbl1`;
    const result = formatSQL(sql, {
      whitespace: { ...DEFAULT_CONFIG.whitespace, wrapLinesLongerThan: 78 },
      caseExpressions: { ...DEFAULT_CONFIG.caseExpressions, collapseCaseExpressionsShorterThan: 78 },
    } as any);
    // CASE should expand to multiple lines since the full line with alias exceeds 78
    expect(result).toContain('CASE\n');
    expect(result).toContain('END AS [aa_bbb_cccc]');
    // Verify no line exceeds 78 characters
    for (const line of result.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });
});

describe('parentheses preservation in conditions', () => {
  it('preserves parentheses around OR inside AND in ON clause', () => {
    const sql = `SELECT col1
FROM some_table a
LEFT OUTER JOIN dbo.table_name b
    ON (b.col = a.col)
    AND (b.col2 = a.col2 OR (b.col2 IS NULL AND a.col2 IS NULL))`;
    const result = formatSQL(sql);
    // The OR grouped with AND must keep its parens
    expect(result).toContain('(b.col2 = a.col2');
    expect(result).toContain('OR');
    // The inner IS NULL AND group must keep its parens
    expect(result).toContain('(b.col2 IS NULL');
    expect(result).toContain('a.col2 IS NULL)');
  });

  it('preserves parentheses around OR inside AND in WHERE clause', () => {
    const sql = `SELECT col1 FROM t WHERE a = 1 AND (b = 2 OR c = 3)`;
    const result = formatSQL(sql);
    expect(result).toContain('(b = 2 OR c = 3)');
  });

  it('does not add unnecessary parens to simple conditions', () => {
    const sql = `SELECT col1 FROM t WHERE a = 1 AND b = 2`;
    const result = formatSQL(sql);
    // No parens should appear in a simple AND chain
    expect(result).not.toContain('(a');
    expect(result).not.toContain('(b');
  });
});

describe('function call wrapping', () => {
  it('wraps long CONCAT calls that exceed wrapLinesLongerThan', () => {
    const sql = `SELECT CONCAT(column1, ' - ', column2, ' / ', column3, ' (', column4, ')', ' [', column5, ']') FROM some_table`;
    const config: Partial<FormatConfig> = {
      whitespace: {
        ...DEFAULT_CONFIG.whitespace,
        wrapLongLines: true,
        wrapLinesLongerThan: 78,
      },
    };
    const result = formatSQL(sql, config);
    const lines = result.trim().split('\n');
    // Every line should respect the wrap limit
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
    // The CONCAT should be expanded across multiple lines
    expect(result).toContain('CONCAT');
    expect(result).toContain('column1');
    expect(result).toContain('column5');
  });

  it('keeps short function calls on one line', () => {
    const sql = `SELECT CONCAT(a, b, c) FROM t`;
    const config: Partial<FormatConfig> = {
      whitespace: {
        ...DEFAULT_CONFIG.whitespace,
        wrapLongLines: true,
        wrapLinesLongerThan: 78,
      },
    };
    const result = formatSQL(sql, config);
    // Short enough to stay on one line
    expect(result).toContain('CONCAT(a, b, c)');
  });

  it('alias alignment uses last line width when CONCAT is wrapped', () => {
    const sql = `SELECT CONCAT(column1, ' - ', column2, ' / ', column3, ' (', column4, ')', ' [', column5, ']') AS full_name, column1 AS col1, column2 AS col2 FROM some_table`;
    const config: Partial<FormatConfig> = {
      whitespace: {
        ...DEFAULT_CONFIG.whitespace,
        wrapLongLines: true,
        wrapLinesLongerThan: 78,
      },
      lists: {
        ...DEFAULT_CONFIG.lists,
        placeFirstItemOnNewLine: 'always' as const,
        alignAliases: true,
      },
    };
    const result = formatSQL(sql, config);
    const lines = result.split('\n');
    const fullNameLine = lines.find(l => l.includes('AS full_name'));
    const col1Line = lines.find(l => l.includes('AS col1'));
    const col2Line = lines.find(l => l.includes('AS col2'));
    expect(fullNameLine).toBeDefined();
    expect(col1Line).toBeDefined();
    expect(col2Line).toBeDefined();
    // The alias padding should NOT push aliases past the wrap limit
    expect(col1Line!.length).toBeLessThanOrEqual(78);
    expect(col2Line!.length).toBeLessThanOrEqual(78);
    // All AS keywords should be aligned at the same column
    const asCol = (line: string) => line.indexOf(' AS ');
    expect(asCol(fullNameLine!)).toBe(asCol(col1Line!));
    expect(asCol(col1Line!)).toBe(asCol(col2Line!));
  });
});

describe('CASE THEN expression wrapping', () => {
  it('wraps long THEN expressions that exceed wrapLinesLongerThan', () => {
    const sql = `SELECT CASE WHEN column1 = 'value' THEN (some_very_long_alias.some_very_long_column1 + some_very_long_alias.some_very_long_column2) * some_very_long_alias.some_very_long_column3 ELSE 0 END AS result FROM some_table`;
    const config: Partial<FormatConfig> = {
      whitespace: {
        ...DEFAULT_CONFIG.whitespace,
        wrapLongLines: true,
        wrapLinesLongerThan: 78,
      },
      caseExpressions: {
        ...DEFAULT_CONFIG.caseExpressions,
        placeThenOnNewLine: true,
        thenAlignment: 'toWhen' as const,
      },
    };
    const result = formatSQL(sql, config);
    const lines = result.trim().split('\n');
    // The THEN result expression should be wrapped so no line exceeds 78
    const thenLines = lines.filter(l => l.trimStart().startsWith('THEN') || l.includes('some_very_long'));
    for (const line of thenLines) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
    // The expression content should still be present
    expect(result).toContain('some_very_long_alias.some_very_long_column1');
    expect(result).toContain('some_very_long_alias.some_very_long_column3');
  });

  it('does not wrap short THEN expressions', () => {
    const sql = `SELECT CASE WHEN a = 1 THEN b + c ELSE 0 END FROM t`;
    const config: Partial<FormatConfig> = {
      whitespace: {
        ...DEFAULT_CONFIG.whitespace,
        wrapLongLines: true,
        wrapLinesLongerThan: 78,
      },
      caseExpressions: {
        ...DEFAULT_CONFIG.caseExpressions,
        placeThenOnNewLine: true,
        thenAlignment: 'toWhen' as const,
      },
    };
    const result = formatSQL(sql, config);
    // THEN and its expression should be on the same line
    expect(result).toMatch(/THEN b \+ c/);
  });
});

describe('EXEC/EXECUTE statements', () => {
  it('preserves EXECUTE with procedure name and parameters', () => {
    const sql = `EXECUTE dbo.stored_procedure_name @param = 'value'`;
    const result = formatSQL(sql);
    expect(result).toContain('EXECUTE');
    expect(result).toContain('dbo.stored_procedure_name');
    expect(result).toContain("@param");
    expect(result).toContain("'value'");
  });

  it('preserves EXEC with multiple parameters', () => {
    const sql = `EXEC dbo.my_proc @p1 = 'val1', @p2 = 42`;
    const result = formatSQL(sql);
    expect(result).toContain('EXEC');
    expect(result).toContain('dbo.my_proc');
    expect(result).toContain('@p1');
    expect(result).toContain('@p2');
    expect(result).toContain("'val1'");
    expect(result).toContain('42');
  });

  it('preserves EXECUTE inside BEGIN/END', () => {
    const sql = `BEGIN\n    EXECUTE dbo.some_proc @param = 'value';\nEND`;
    const result = formatSQL(sql);
    expect(result).toContain('EXECUTE');
    expect(result).toContain('dbo.some_proc');
    expect(result).toContain("@param");
  });

  it('does not consume the following statement', () => {
    const sql = `EXECUTE dbo.stored_proc_name @param1 = 'value'\n\nDECLARE @now DATETIME = GETDATE();`;
    const result = formatSQL(sql);
    // EXECUTE should have its own content
    expect(result).toContain("EXECUTE dbo.stored_proc_name @param1 = 'value'");
    // DECLARE should be a separate statement, not consumed by EXEC
    expect(result).toContain('DECLARE @now DATETIME');
    expect(result).toContain('GETDATE()');
  });

  it('does not consume a SELECT that follows', () => {
    const sql = `EXEC dbo.my_proc @p = 1\nSELECT 1`;
    const result = formatSQL(sql);
    expect(result).toContain('EXEC dbo.my_proc @p = 1');
    expect(result).toContain('SELECT 1');
  });
});

describe('comments before closing paren', () => {
  it('preserves comment before closing paren of subquery in FROM', () => {
    const sql = `SELECT * FROM (SELECT column FROM dbo.some_table\n-- where column = 'value'\n) [tbl3]`;
    const result = formatSQL(sql);
    expect(result).toContain("-- where column = 'value'");
    expect(result).toContain('[tbl3]');
  });

  it('preserves comment before closing paren of subquery in JOIN', () => {
    const sql = `SELECT a.col FROM dbo.t a LEFT OUTER JOIN (SELECT id FROM dbo.other\n-- AND active = 1\n) b ON a.id = b.id`;
    const result = formatSQL(sql);
    expect(result).toContain('-- AND active = 1');
  });
});
