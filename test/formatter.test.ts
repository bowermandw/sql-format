import { describe, it, expect } from 'vitest';
import { formatSQL } from './helpers';

// ---- Structural / Integration Tests ----
// Config-specific tests have been moved to test/formatter/*.test.ts

describe('formatter: structural', () => {
  it('handles idempotent formatting', () => {
    const sql = 'select column1, column2, column3 from dbo.table1 where column1 = 1';
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });

  it('formats a simple SELECT', () => {
    const result = formatSQL('select a, b from t');
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
  });

  it('formats SET NOCOUNT ON', () => {
    const result = formatSQL('set nocount on');
    expect(result.trim()).toBe('SET NOCOUNT ON');
  });

  it('formats BEGIN/END blocks with indentation', () => {
    const result = formatSQL('begin select 1 end');
    const lines = result.trim().split('\n');
    expect(lines[0].trim()).toBe('BEGIN');
    expect(lines[lines.length - 1].trim()).toBe('END');
  });

  it('formats DECLARE statement', () => {
    const result = formatSQL('declare @x int = 5');
    expect(result.trim()).toBe('DECLARE @x INT = 5');
  });

  it('formats procedure parameters on new lines', () => {
    const result = formatSQL(`create procedure dbo.stored_procedure_name (@a int, @b varchar(20))
as begin select 1 end`);
    expect(result).toContain('CREATE PROCEDURE');
    expect(result).toContain('@a');
    expect(result).toContain('@b');
  });
});

// ---- Style1 config integration tests ----
// Inlined from style1.json: wrapLinesLongerThan=78, placeFirstItemOnNewLine=always,
// alignAliases=true, alignComments=true, ddl.alignDataTypesAndConstraints=true, etc.

const STYLE1_CONFIG = {
  whitespace: { wrapLinesLongerThan: 78 },
  lists: {
    placeFirstItemOnNewLine: 'always',
    alignItemsToTabStops: true,
    alignAliases: true,
    alignComments: true,
  },
  parentheses: {
    parenthesisStyle: 'expandedToStatement',
    indentParenthesesContents: true,
    collapseShortParenthesisContents: true,
    collapseParenthesesShorterThan: 78,
  },
  casing: {
    reservedKeywords: 'uppercase',
    builtInFunctions: 'uppercase',
    builtInDataTypes: 'uppercase',
    globalVariables: 'uppercase',
    useObjectDefinitionCase: true,
  },
  dml: {
    placeDistinctAndTopClausesOnNewLine: true,
    addNewLineAfterDistinctAndTopClauses: true,
    collapseShortStatements: true,
    collapseStatementsShorterThan: 78,
    collapseShortSubqueries: true,
    collapseSubqueriesShorterThan: 78,
    listItems: {
      placeFromTableOnNewLine: 'always',
      placeWhereConditionOnNewLine: 'always',
      placeGroupByAndOrderByOnNewLine: 'always',
    },
  },
  ddl: {
    parenthesisStyle: 'expandedToStatement',
    indentParenthesesContents: true,
    alignDataTypesAndConstraints: true,
    placeConstraintsOnNewLines: true,
    placeConstraintColumnsOnNewLines: 'always',
    indentClauses: true,
    placeFirstProcedureParameterOnNewLine: 'always',
    collapseShortStatements: true,
    collapseStatementsShorterThan: 78,
  },
  controlFlow: {
    collapseShortStatements: true,
    collapseStatementsShorterThan: 78,
  },
  cte: {
    parenthesisStyle: 'expandedToStatement',
    indentContents: true,
    placeNameOnNewLine: true,
    indentName: true,
    placeAsOnNewLine: false,
  },
  variables: {
    placeAssignedValueOnNewLineIfLongerThanMaxLineLength: false,
    placeEqualsSignOnNewLine: true,
  },
  joinStatements: {
    join: { keywordAlignment: 'toTable' },
    on: { keywordAlignment: 'indented', conditionAlignment: 'indented' },
  },
  insertStatements: {
    values: {
      parenthesisStyle: 'expandedToStatement',
      indentContents: true,
      placeSubsequentValuesOnNewLines: 'ifLongerThanMaxLineLength',
    },
  },
  caseExpressions: {
    placeExpressionOnNewLine: false,
    placeThenOnNewLine: true,
    thenAlignment: 'toWhen',
    collapseShortCaseExpressions: true,
    collapseCaseExpressionsShorterThan: 78,
  },
  operators: {
    comparison: { align: true },
    andOr: { alignment: 'indented' },
    between: { placeOnNewLine: false, placeAndKeywordOnNewLine: true },
    in: {
      placeOpeningParenthesisOnNewLine: true,
      placeFirstValueOnNewLine: 'always',
      placeSubsequentValuesOnNewLines: 'never',
    },
  },
};

describe('formatter with style1 config', () => {
  // Inlined from test/fixtures/storedproctest.sql
  const STOREDPROCTEST_SQL = `create or alter procedure dbo.rpt_stuff (@user_id VARCHAR(20), @fiscal_year INT = 2025,
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
go
`;

  it('formats storedproctest with correct structure', () => {
    const result = formatSQL(STOREDPROCTEST_SQL, STYLE1_CONFIG);

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

  it('storedproctest is idempotent', () => {
    const first = formatSQL(STOREDPROCTEST_SQL, STYLE1_CONFIG);
    const second = formatSQL(first, STYLE1_CONFIG);
    expect(first).toBe(second);
  });

  it('aligns proc param data types', () => {
    const result = formatSQL(STOREDPROCTEST_SQL, STYLE1_CONFIG);
    // @user_id and @some_param should be padded to align data types
    expect(result).toContain('@user_id     VARCHAR(20)');
    expect(result).toContain('@some_param  VARCHAR(50)');
    expect(result).toContain('@some_param2 VARCHAR(50)');
  });
});

// ---- Smartish style config integration tests ----
// Inlined from smartish_style.json: lowercase keywords, leading commas, etc.

const SMARTISH_CONFIG = {
  whitespace: {
    newLines: {
      emptyLinesAfterBatchSeparator: 1,
      emptyLinesBetweenStatements: 1,
      preserveExistingEmptyLinesAfterBatchSeparator: false,
    },
    wrapLongLines: true,
    wrapLinesLongerThan: 120,
  },
  lists: {
    alignItemsAcrossClauses: false,
    alignAliases: false,
    alignComments: true,
    commas: { placeCommasBeforeItems: true },
    alignSubsequentItemsWithFirstItem: true,
    placeSubsequentItemsOnNewLines: 'always',
    placeFirstItemOnNewLine: 'never',
  },
  parentheses: {
    parenthesisStyle: 'compactToStatement',
    indentParenthesesContents: true,
    collapseParenthesesShorterThan: 75,
    collapseShortParenthesisContents: true,
  },
  casing: {
    reservedKeywords: 'lowercase',
    builtInFunctions: 'lowercase',
    builtInDataTypes: 'lowercase',
    globalVariables: 'lowercase',
    useObjectDefinitionCase: true,
  },
  dml: {
    addNewLineAfterDistinctAndTopClauses: true,
    collapseStatementsShorterThan: 75,
    collapseShortSubqueries: true,
    collapseSubqueriesShorterThan: 75,
    collapseShortStatements: false,
  },
  ddl: {
    parenthesisStyle: 'compactToStatement',
    indentParenthesesContents: true,
    placeConstraintsOnNewLines: true,
    placeConstraintColumnsOnNewLines: 'ifLongerOrMultipleColumns',
    collapseShortStatements: true,
    collapseStatementsShorterThan: 75,
  },
  controlFlow: {
    collapseStatementsShorterThan: 78,
  },
  variables: {
    alignDataTypesAndValues: true,
    placeEqualsSignOnNewLine: true,
    placeAssignedValueOnNewLineIfLongerThanMaxLineLength: true,
  },
  joinStatements: {
    join: {
      keywordAlignment: 'indented',
      indentJoinTable: false,
      placeJoinTableOnNewLine: false,
      placeOnNewLine: true,
    },
    on: {
      keywordAlignment: 'indented',
      placeOnNewLine: false,
      placeConditionOnNewLine: false,
    },
  },
  insertStatements: {
    values: { indentContents: true },
  },
  caseExpressions: {
    collapseCaseExpressionsShorterThan: 75,
  },
  operators: {
    andOr: { alignment: 'toFirstListItem' },
    in: {
      placeFirstValueOnNewLine: 'never',
      placeSubsequentValuesOnNewLines: 'never',
      addSpaceAroundInContents: true,
    },
  },
};

describe('formatter with smartish config', () => {
  it('uses lowercase keywords', () => {
    const result = formatSQL('SELECT a, b FROM dbo.table1 WHERE a = 1', SMARTISH_CONFIG);
    expect(result).toContain('select');
    expect(result).toContain('from');
    expect(result).toContain('where');
  });

  it('uses leading commas', () => {
    const result = formatSQL('SELECT a, b, c FROM dbo.table1', SMARTISH_CONFIG);
    const lines = result.trim().split('\n');
    const commaLines = lines.filter(l => l.trimStart().startsWith(','));
    expect(commaLines.length).toBeGreaterThan(0);
  });
});

// ---- Subquery tests ----
// Inlined from subquerytest.sql through subquerytest6.sql

describe('subquery formatting', () => {
  // subquerytest.sql: proc with short subqueries in FROM and JOIN
  const SUBQUERY1 = `create or alter procedure dbo.some_proc ( @param1 varchar(20), @param2 varchar(20))
as
begin
 select tbl1.col1, tbl2.col2, tbl1.col2 - tbl2.col3 as col4
 from ( select col1, col2, col3 from some_table1) tbl1
 inner join ( select col1, col2, col3 from some_table2) tbl2
 on tbl1.col1 = tbl2.col1
 order by 1

end
go
`;

  it('subquerytest1: formats proc with subqueries in FROM and JOIN', () => {
    const result = formatSQL(SUBQUERY1, STYLE1_CONFIG);
    expect(result).toContain('CREATE OR ALTER PROCEDURE');
    expect(result).toContain('dbo.some_proc');
    expect(result).toContain('@param1 VARCHAR(20)');
    expect(result).toContain('tbl1.col1');
    expect(result).toContain('tbl2.col2');
    expect(result).toContain('tbl1.col2 - tbl2.col3');
    expect(result).toContain('col4');
    expect(result).toContain('some_table1');
    expect(result).toContain('some_table2');
    expect(result).toContain('INNER JOIN');
    expect(result).toContain('ORDER BY');
    expect(result).toContain('GO');
  });

  it('subquerytest1: is idempotent', () => {
    const first = formatSQL(SUBQUERY1, STYLE1_CONFIG);
    const second = formatSQL(first, STYLE1_CONFIG);
    expect(first).toBe(second);
  });

  // subquerytest2.sql: proc with long subqueries that exceed collapse threshold
  const SUBQUERY2 = `create or alter procedure dbo.some_proc ( @param1 varchar(20), @param2 varchar(20))
as
begin
 select tbl1.col1, tbl2.col2, tbl1.col2 - tbl2.col3 as col4
 from ( select long_column_name_1, long_column_name_2, long_column_name_3
 from some_long_table1) tbl1
 inner join ( select long_column_name_1, long_column_name_2, long_column_name_3 from some_long_table2) tbl2
 on tbl1.col1 = tbl2.col1
 order by 1

end
go
`;

  it('subquerytest2: formats long subqueries expanded', () => {
    const result = formatSQL(SUBQUERY2, STYLE1_CONFIG);
    expect(result).toContain('long_column_name_1');
    expect(result).toContain('long_column_name_2');
    expect(result).toContain('long_column_name_3');
    expect(result).toContain('some_long_table1');
    expect(result).toContain('some_long_table2');
    expect(result).toContain('INNER JOIN');
    // Long subqueries should be expanded (multi-line)
    expect(result).toContain('(\n');
  });

  it('subquerytest2: is idempotent', () => {
    const first = formatSQL(SUBQUERY2, STYLE1_CONFIG);
    const second = formatSQL(first, STYLE1_CONFIG);
    expect(first).toBe(second);
  });

  // subquerytest3.sql: proc with aliases, SUM aggregate, GROUP BY in subquery
  const SUBQUERY3 = `create or alter procedure dbo.some_proc ( @param1 varchar(20), @param2 varchar(20))
as
begin
 select tbl1.column_1 AS some_alias1, tbl2.long_column_name_2 AS some_alias2, tbl1.aa_amount - tbl2.long_column_name_3 as col4
 from ( select [column_1], SUM([aa_amount]) AS [aa_amount]

 from some_long_table1
 group by [column_1]) tbl1
 inner join ( select column_1, long_column_name_2, long_column_name_3 from some_long_table2) tbl2
 on tbl1.column_1 = tbl2.column_1
 order by 1

end
go
`;

  it('subquerytest3: formats proc with aggregate subquery', () => {
    const result = formatSQL(SUBQUERY3, STYLE1_CONFIG);
    expect(result).toContain('some_alias1');
    expect(result).toContain('some_alias2');
    expect(result).toContain('SUM([aa_amount])');
    expect(result).toContain('GROUP BY');
    expect(result).toContain('AS [aa_amount]');
    expect(result).toContain('INNER JOIN');
    expect(result).toContain('ORDER BY');
  });

  it('subquerytest3: is idempotent', () => {
    const first = formatSQL(SUBQUERY3, STYLE1_CONFIG);
    const second = formatSQL(first, STYLE1_CONFIG);
    expect(first).toBe(second);
  });

  // subquerytest4.sql: pre-formatted with brackets, flowerbox comment, TRUNCATE, expanded subqueries
  const SUBQUERY4 = `CREATE OR ALTER PROCEDURE [dbo].[some_proc]
(
    @param1 VARCHAR(20),
    @param2 VARCHAR(20)
)
AS
BEGIN
    /*******************
    flowerbox
    stuff here
    ********************/
    SET NOCOUNT ON;
    TRUNCATE TABLE [dbo].[some_long_table3];

    SELECT
        [tbl1].[column_1]                                AS [some_alias1],
        [tbl2].[long_column_name_2]                      AS [some_alias2],
        [tbl1].[aa_amount] - [tbl2].[long_column_name_3] AS [col4]
    FROM
        (
            SELECT
                [column_1],
                SUM([aa_amount]) AS [aa_amount]
            FROM
                [some_long_table1]
            GROUP BY
                [column_1]
        ) [tbl1]
        INNER JOIN
        (
            SELECT
                [column_1],
                [long_column_name_2],
                [long_column_name_3]
            FROM
                [some_long_table2]
        ) [tbl2]
            ON [tbl1].[column_1] = [tbl2].[column_1]
    ORDER BY
        1;
END
GO`;

  it('subquerytest4: preserves flowerbox comment', () => {
    const result = formatSQL(SUBQUERY4, STYLE1_CONFIG);
    expect(result).toContain('flowerbox');
    expect(result).toContain('stuff here');
  });

  it('subquerytest4: preserves TRUNCATE TABLE', () => {
    const result = formatSQL(SUBQUERY4, STYLE1_CONFIG);
    expect(result).toContain('TRUNCATE TABLE');
    expect(result).toContain('[some_long_table3]');
  });

  it('subquerytest4: has correct structure', () => {
    const result = formatSQL(SUBQUERY4, STYLE1_CONFIG);
    expect(result).toContain('CREATE OR ALTER PROCEDURE');
    expect(result).toContain('[some_proc]');
    expect(result).toContain('SET NOCOUNT ON');
    expect(result).toContain('SUM([aa_amount])');
    expect(result).toContain('GROUP BY');
    expect(result).toContain('INNER JOIN');
    expect(result).toContain('ORDER BY');
    expect(result).toContain('END');
    expect(result).toContain('GO');
  });

  it('subquerytest4: is idempotent', () => {
    const first = formatSQL(SUBQUERY4, STYLE1_CONFIG);
    const second = formatSQL(first, STYLE1_CONFIG);
    expect(first).toBe(second);
  });

  // subquerytest5.sql: complex proc with INSERT, temp table, IN clause, CASE in subquery, trailing comments
  const SUBQUERY5 = `CREATE OR ALTER PROCEDURE [dbo].[some_proc]
(
    @param1 VARCHAR(20),
    @param2 VARCHAR(20)
)
AS
BEGIN
    /*******************
    flowerbox
    stuff here
    ********************/
    SET NOCOUNT ON;
    TRUNCATE TABLE [dbo].[some_long_table3];

    CREATE TABLE #temptable (
        column1 varchar(20),
        column2 varchar(20),
        column3 NUMERIC(28,15)
    );

    INSERT INTO #temptable
    SELECT
        [tbl1].[column_1]                                AS [some_alias1],
        [tbl2].[long_column_name_2]                      AS [some_alias2],
        [tbl1].[aa_amount] - [tbl2].[long_column_name_3] AS [col4]
    FROM
        (
            SELECT
                [column_1],
                [column_2],
                SUM([aa_amount]) AS [aa_amount]
            FROM
                [some_long_table1]
            WHERE column_4 IN ('some_value1', 'some_value1', 'some_value1', 'some_value1', 'some_value1', 'some_value1', 'some_value1', 'some_value1')
            GROUP BY
                [column_1], [column_2]
        ) [tbl1]
        INNER JOIN
        (
            SELECT [column_1], [long_column_name_2], [long_column_name_3], column4 + ' (' + CASE [some_type] WHEN 'ONE' THEN 1 WHEN 'TWO' THEN 2 ELSE 0 END AS column5, column6
            FROM
            [some_long_table2]
        ) [tbl2]
            ON [tbl1].[column_1] = [tbl2].[column_1] AND [tbl1].[column_2] = [tbl2].[long_column_name_2]
    ORDER BY
        1;
END
GO

-- Comment test
-- another`;

  it('subquerytest5: formats complex proc with INSERT into temp table', () => {
    const result = formatSQL(SUBQUERY5, STYLE1_CONFIG);
    expect(result).toContain('INSERT INTO #temptable');
    expect(result).toContain('CREATE TABLE #temptable');
    expect(result).toContain('NUMERIC(28, 15)');
  });

  it('subquerytest5: preserves IN clause values', () => {
    const result = formatSQL(SUBQUERY5, STYLE1_CONFIG);
    expect(result).toContain('IN');
    expect(result).toContain("'some_value1'");
  });

  it('subquerytest5: formats CASE in subquery', () => {
    const result = formatSQL(SUBQUERY5, STYLE1_CONFIG);
    expect(result).toContain('CASE');
    expect(result).toContain("[some_type]");
    expect(result).toContain("'ONE'");
  });

  it('subquerytest5: preserves trailing comments after GO', () => {
    const result = formatSQL(SUBQUERY5, STYLE1_CONFIG);
    expect(result).toContain('-- Comment test');
    expect(result).toContain('-- another');
  });

  it('subquerytest5: is idempotent', () => {
    const first = formatSQL(SUBQUERY5, STYLE1_CONFIG);
    const second = formatSQL(first, STYLE1_CONFIG);
    expect(first).toBe(second);
  });

  // subquerytest6.sql: single-line SELECT with nested CASE and IN in subquery
  const SUBQUERY6 = `SELECT * FROM (SELECT [column1] + ' ' + CASE [column2] WHEN 'A' THEN 'X' WHEN 'Y' THEN 'Y' ELSE 'Z' END + ' ' AS [column3], [column4] FROM dbo.some_table WHERE [column1] IN ('asdf','qwer')) [tbl1]
`;

  it('subquerytest6: formats single-line SELECT with CASE and IN in subquery', () => {
    const result = formatSQL(SUBQUERY6, STYLE1_CONFIG);
    expect(result).toContain('[column1]');
    expect(result).toContain('CASE');
    expect(result).toContain("[column2]");
    expect(result).toContain("'X'");
    expect(result).toContain("'Z'");
    expect(result).toContain('[column3]');
    expect(result).toContain('[column4]');
    expect(result).toContain('dbo.some_table');
    expect(result).toContain('IN');
    expect(result).toContain("'asdf'");
    expect(result).toContain("'qwer'");
    expect(result).toContain('[tbl1]');
  });

  it('subquerytest6: is idempotent', () => {
    const first = formatSQL(SUBQUERY6, STYLE1_CONFIG);
    const second = formatSQL(first, STYLE1_CONFIG);
    expect(first).toBe(second);
  });
});

// ---- PIVOT / UNPIVOT ----

describe('PIVOT / UNPIVOT', () => {
  it('formats a basic PIVOT query', () => {
    const sql = `SELECT VendorID, [250] AS Emp1, [251] AS Emp2
FROM (SELECT VendorID, EmployeeID, Amount FROM Purchasing.PurchaseOrderHeader) AS src
PIVOT (SUM(Amount) FOR EmployeeID IN ([250], [251], [252])) AS pvt`;
    const result = formatSQL(sql);
    expect(result).toContain('PIVOT');
    expect(result).toContain('SUM(Amount)');
    expect(result).toContain('FOR');
    expect(result).toContain('AS pvt');
  });

  it('formats PIVOT with correct indentation structure', () => {
    const sql = `SELECT VendorID, [250], [251]
FROM (SELECT VendorID, EmployeeID, Amount FROM Purchasing.PurchaseOrderHeader) AS src
PIVOT (SUM(Amount) FOR EmployeeID IN ([250], [251])) AS pvt`;
    const result = formatSQL(sql);
    const lines = result.split('\n');
    const pivotLine = lines.find(l => l.trim() === 'PIVOT');
    expect(pivotLine).toBeDefined();
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
    expect(result).toContain('SUM(x)');
    expect(result).toContain('AS p');
  });
});

// ---- Comments ----

describe('comments between clauses', () => {
  it('preserves comments before FROM in SELECT', () => {
    const sql = `SELECT
    column1,
    column2
-- comment before FROM
FROM
    table_name_1`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before FROM');
  });

  it('preserves comments before WHERE in SELECT', () => {
    const sql = `SELECT column1
FROM table_name_1
-- comment before WHERE
WHERE column1 = 1`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before WHERE');
  });

  it('preserves comments before GROUP BY in SELECT', () => {
    const sql = `SELECT column1, COUNT(*)
FROM table_name_1
-- comment before GROUP BY
GROUP BY column1`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before GROUP BY');
  });

  it('preserves comments before ORDER BY in SELECT', () => {
    const sql = `SELECT column1
FROM table_name_1
-- comment before ORDER BY
ORDER BY column1`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before ORDER BY');
  });

  it('preserves comments before HAVING in SELECT', () => {
    const sql = `SELECT column1, COUNT(*)
FROM table_name_1
GROUP BY column1
-- comment before HAVING
HAVING COUNT(*) > 1`;
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before HAVING');
  });

  it('preserves trailing comments after last statement', () => {
    const result = formatSQL(`SELECT 1\n-- trailing comment`);
    expect(result).toContain('-- trailing comment');
  });

  it('preserves trailing comments after GO', () => {
    const result = formatSQL(`SELECT 1\nGO\n-- trailing comment after GO`);
    expect(result).toContain('-- trailing comment after GO');
  });

  it('preserves inline trailing comment on SELECT FROM', () => {
    const result = formatSQL('SELECT * FROM [dbo].[t1] -- comment');
    expect(result).toContain('[dbo].[t1] -- comment');
  });

  it('preserves inline trailing comments on multiple statements', () => {
    const sql = `SELECT * FROM [dbo].[t1] -- 1\nSELECT * FROM [dbo].[t2] -- 2\nSELECT * FROM [dbo].[t3] WHERE [col] = 1 -- 3`;
    const result = formatSQL(sql);
    expect(result).toContain('[t1] -- 1');
    expect(result).toContain('[t2] -- 2');
    expect(result).toContain('= 1 -- 3');
  });

  it('preserves inline trailing comment on SET statement', () => {
    const result = formatSQL('SET @x = 1 -- set x');
    expect(result).toContain('= 1 -- set x');
  });

  it('preserves inline trailing comment on DECLARE', () => {
    const result = formatSQL('DECLARE @x INT -- my var');
    expect(result).toContain('INT -- my var');
  });

  it('preserves inline trailing comment on DELETE', () => {
    const result = formatSQL('DELETE FROM dbo.t WHERE id = 1 -- remove');
    expect(result).toContain('= 1 -- remove');
  });

  it('does not parse TRUNCATE as table alias after FROM', () => {
    const sql = `SELECT TOP (10) * FROM dbo.table_name\n\n-- Some Comment\nTRUNCATE TABLE dbo.table_name_2;\nEXECUTE dbo.stored_proc_name_1;`;
    const result = formatSQL(sql);
    expect(result).toContain('SELECT TOP (10) * FROM dbo.table_name');
    expect(result).toContain('-- Some Comment');
    expect(result).toContain('TRUNCATE TABLE dbo.table_name_2');
    expect(result).toContain('EXECUTE dbo.stored_proc_name_1');
  });

  it('does not parse WHILE or WITH as table alias', () => {
    const sql = 'SELECT * FROM dbo.t\nWHILE @i < 10 SET @i = @i + 1';
    const result = formatSQL(sql);
    expect(result).toContain('FROM');
    expect(result).toContain('dbo.t');
    expect(result).toContain('WHILE');
    // WHILE should not appear as an alias on the same line as FROM
    const fromLine = result.split('\n').find(l => l.includes('dbo.t'));
    expect(fromLine).not.toContain('WHILE');
  });

  it('does not insert blank lines between comments with CRLF input', () => {
    const sql = "SELECT 1\r\nGO\r\n-- comment1\r\n-- comment2\r\n";
    const result = formatSQL(sql);
    expect(result).toContain('-- comment1\n-- comment2');
    expect(result).not.toContain('\r');
  });

  it('does not insert blank lines between clause comments with CRLF input', () => {
    const sql = "SELECT\r\n    column1\r\n-- comment before FROM\r\nFROM\r\n    table_name_1\r\n";
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before FROM');
    expect(result).not.toContain('\r');
  });

  it('does not insert extra blank lines in flowerbox comment with CRLF input', () => {
    const sql = "/********************\r\nLine1\r\nLine2\r\nLine3\r\n********************/\r\n";
    const result = formatSQL(sql);
    expect(result).toContain("/********************\nLine1\nLine2\nLine3\n********************/");
    expect(result).not.toContain('\r');
  });

  it('does not insert extra blank lines in flowerbox comment with CRLF output', () => {
    const sql = "/********************\r\nLine1\r\nLine2\r\nLine3\r\n********************/\r\n";
    const result = formatSQL(sql, { whitespace: { lineEnding: 'crlf' } });
    expect(result).toContain("/********************\r\nLine1\r\nLine2\r\nLine3\r\n********************/");
    expect(result).not.toContain('\r\r');
  });

  it('does not treat SELECT as alias when comments separate statements', () => {
    const sql = `SELECT * FROM dbo.table_name_2
-- some comment
--another comment
SELECT * FROM dbo.table_name_3`;
    const result = formatSQL(sql);
    expect(result).toContain('SELECT * FROM dbo.table_name_2');
    expect(result).toContain('SELECT * FROM dbo.table_name_3');
    expect(result).toContain('-- some comment');
    expect(result).toContain('--another comment');
  });
});

describe('comments between select columns', () => {
  it('preserves a line comment between columns', () => {
    const sql = `SELECT
[column1],
-- [column2],
[column3]
FROM (select [column1], [column2], [column3] FROM dbo.table_name_1) [tbl1]`;
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
FROM dbo.table_name_1 WHERE [column1] = 'value_to_prevent_collapse_xxxxxxxxx'`;
    const result = formatSQL(sql);
    expect(result).toContain('/* [column2], */');
  });

  it('preserves multiple comments between columns', () => {
    const sql = `SELECT
[column1],
-- first commented column
-- second commented column
[column3]
FROM dbo.table_name_1 WHERE [column1] = 'value_to_prevent_collapse_xxxxxxxxx'`;
    const result = formatSQL(sql);
    expect(result).toContain('-- first commented column');
    expect(result).toContain('-- second commented column');
  });

  it('preserves comment before function call column', () => {
    const sql = `SELECT\nISNULL(column1, 0) AS [column1],\n--column_commented_out\n\nISNULL(column2, 0) AS [column2]\nFROM dbo.table_name_1`;
    const result = formatSQL(sql);
    expect(result).toContain('--column_commented_out');
    expect(result).toContain('ISNULL(column2, 0)');
  });
});

// ---- Parentheses preservation ----

describe('parentheses preservation in conditions', () => {
  it('preserves parentheses around OR inside AND in ON clause', () => {
    const sql = `SELECT col1
FROM table_name_1 a
LEFT OUTER JOIN dbo.table_name b
    ON (b.col = a.col)
    AND (b.col2 = a.col2 OR (b.col2 IS NULL AND a.col2 IS NULL))`;
    const result = formatSQL(sql);
    expect(result).toContain('(b.col2 = a.col2');
    expect(result).toContain('OR');
    expect(result).toContain('(b.col2 IS NULL');
    expect(result).toContain('a.col2 IS NULL)');
  });

  it('preserves parentheses around OR inside AND in WHERE clause', () => {
    const result = formatSQL(`SELECT col1 FROM t WHERE a = 1 AND (b = 2 OR c = 3)`);
    expect(result).toContain('(b = 2 OR c = 3)');
  });

  it('does not add unnecessary parens to simple conditions', () => {
    const result = formatSQL(`SELECT col1 FROM t WHERE a = 1 AND b = 2`);
    expect(result).not.toContain('(a');
    expect(result).not.toContain('(b');
  });
});

// ---- Function call wrapping ----

describe('function call wrapping', () => {
  it('wraps long CONCAT calls that exceed wrapLinesLongerThan', () => {
    const sql = `SELECT CONCAT(column1, ' - ', column2, ' / ', column3, ' (', column4, ')', ' [', column5, ']') FROM table_name_1`;
    const result = formatSQL(sql, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 78, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    for (const line of result.trim().split('\n')) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
    expect(result).toContain('CONCAT');
    expect(result).toContain('column5');
  });

  it('keeps short function calls on one line', () => {
    const result = formatSQL(`SELECT CONCAT(a, b, c) FROM t`, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 78, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result).toContain('CONCAT(a, b, c)');
  });

  it('alias alignment uses last line width when CONCAT is wrapped', () => {
    const sql = `SELECT CONCAT(column1, ' - ', column2, ' / ', column3, ' (', column4, ')', ' [', column5, ']') AS full_name, column1 AS col1, column2 AS col2 FROM table_name_1`;
    const result = formatSQL(sql, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 78, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
      lists: { placeFirstItemOnNewLine: 'always', placeSubsequentItemsOnNewLines: 'always', alignSubsequentItemsWithFirstItem: false, alignItemsAcrossClauses: false, indentListItems: true, alignItemsToTabStops: false, alignAliases: true, alignComments: false, commas: { placeCommasBeforeItems: false, commaAlignment: 'beforeItem', addSpaceBeforeComma: false, addSpaceAfterComma: true } },
    });
    const lines = result.split('\n');
    const fullNameLine = lines.find(l => l.includes('AS full_name'));
    const col1Line = lines.find(l => l.includes('AS col1'));
    const col2Line = lines.find(l => l.includes('AS col2'));
    expect(fullNameLine).toBeDefined();
    expect(col1Line).toBeDefined();
    expect(col2Line).toBeDefined();
    expect(col1Line!.length).toBeLessThanOrEqual(78);
    expect(col2Line!.length).toBeLessThanOrEqual(78);
    const asCol = (line: string) => line.indexOf(' AS ');
    expect(asCol(fullNameLine!)).toBe(asCol(col1Line!));
    expect(asCol(col1Line!)).toBe(asCol(col2Line!));
  });
});

// ---- CASE THEN expression wrapping ----

describe('CASE THEN expression wrapping', () => {
  it('wraps long THEN expressions that exceed wrapLinesLongerThan', () => {
    const sql = `SELECT CASE WHEN column1 = 'value' THEN (some_very_long_alias.some_very_long_column1 + some_very_long_alias.some_very_long_column2) * some_very_long_alias.some_very_long_column3 ELSE 0 END AS result FROM table_name_1`;
    const result = formatSQL(sql, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 78, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
      caseExpressions: { placeExpressionOnNewLine: false, placeFirstWhenOnNewLine: 'always', whenAlignment: 'indentedFromCase', placeThenOnNewLine: true, thenAlignment: 'toWhen', placeElseOnNewLine: true, alignElseToWhen: true, placeEndOnNewLine: true, endAlignment: 'toCase', collapseShortCaseExpressions: true, collapseCaseExpressionsShorterThan: 78 },
    });
    const lines = result.trim().split('\n');
    const thenLines = lines.filter(l => l.trimStart().startsWith('THEN') || l.includes('some_very_long'));
    for (const line of thenLines) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
    expect(result).toContain('some_very_long_alias.some_very_long_column1');
    expect(result).toContain('some_very_long_alias.some_very_long_column3');
  });

  it('does not wrap short THEN expressions', () => {
    const result = formatSQL(`SELECT CASE WHEN a = 1 THEN b + c ELSE 0 END FROM t`, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 78, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
      caseExpressions: { placeExpressionOnNewLine: false, placeFirstWhenOnNewLine: 'always', whenAlignment: 'indentedFromCase', placeThenOnNewLine: true, thenAlignment: 'toWhen', placeElseOnNewLine: true, alignElseToWhen: true, placeEndOnNewLine: true, endAlignment: 'toCase', collapseShortCaseExpressions: false, collapseCaseExpressionsShorterThan: 78 },
    });
    expect(result).toMatch(/THEN b \+ c/);
  });
});

// ---- CASE expression wrapping in SELECT columns ----

describe('CASE expression wrapping in SELECT columns', () => {
  it('expands CASE when line with alias exceeds wrapLinesLongerThan', () => {
    const sql = `SELECT
[column1],
CASE WHEN [aa_bbb_cccc] BETWEEN -0.1 AND 0.1 THEN 0 ELSE [aa_bbb_cccc] END AS [aa_bbb_cccc],
[column3]
FROM (SELECT [column1], [aa_bbb_cccc], [column3] FROM dbo.table_name_1) tbl1`;
    const result = formatSQL(sql, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 78, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
      caseExpressions: { placeExpressionOnNewLine: false, placeFirstWhenOnNewLine: 'always', whenAlignment: 'indentedFromCase', placeThenOnNewLine: false, thenAlignment: 'toWhen', placeElseOnNewLine: true, alignElseToWhen: true, placeEndOnNewLine: true, endAlignment: 'toCase', collapseShortCaseExpressions: true, collapseCaseExpressionsShorterThan: 78 },
    });
    expect(result).toContain('CASE\n');
    expect(result).toContain('END AS [aa_bbb_cccc]');
    for (const line of result.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });
});

// ---- EXEC/EXECUTE statements ----

describe('EXEC/EXECUTE statements', () => {
  it('preserves EXECUTE with procedure name and parameters', () => {
    const result = formatSQL(`EXECUTE dbo.stored_procedure_name @param = 'value'`);
    expect(result).toContain('EXECUTE');
    expect(result).toContain('dbo.stored_procedure_name');
    expect(result).toContain("@param");
    expect(result).toContain("'value'");
  });

  it('preserves EXEC with multiple parameters', () => {
    const result = formatSQL(`EXEC dbo.stored_procedure_name @p1 = 'val1', @p2 = 42`);
    expect(result).toContain('EXEC');
    expect(result).toContain('dbo.stored_procedure_name');
    expect(result).toContain('@p1');
    expect(result).toContain('@p2');
  });

  it('preserves EXECUTE inside BEGIN/END', () => {
    const result = formatSQL(`BEGIN\n    EXECUTE dbo.stored_procedure_name @param = 'value';\nEND`);
    expect(result).toContain('EXECUTE');
    expect(result).toContain('dbo.stored_procedure_name');
  });

  it('does not consume the following statement', () => {
    const result = formatSQL(`EXECUTE dbo.stored_proc_name @param1 = 'value'\n\nDECLARE @now DATETIME = GETDATE();`);
    expect(result).toContain("EXECUTE dbo.stored_proc_name @param1 = 'value'");
    expect(result).toContain('DECLARE @now DATETIME');
    expect(result).toContain('GETDATE()');
  });

  it('does not consume a SELECT that follows', () => {
    const result = formatSQL(`EXEC dbo.stored_procedure_name @p = 1\nSELECT 1`);
    expect(result).toContain('EXEC dbo.stored_procedure_name @p = 1');
    expect(result).toContain('SELECT 1');
  });
});

// ---- Comments before closing paren ----

describe('comments before closing paren', () => {
  it('preserves comment before closing paren of subquery in FROM', () => {
    const result = formatSQL(`SELECT * FROM (SELECT column_1 FROM dbo.table_name_1\n-- where column_1 = 'value'\n) [tbl3]`);
    expect(result).toContain("-- where column_1 = 'value'");
    expect(result).toContain('[tbl3]');
  });

  it('preserves comment before closing paren of subquery in JOIN', () => {
    const result = formatSQL(`SELECT a.column_1 FROM dbo.table_name_1 a LEFT OUTER JOIN (SELECT id FROM dbo.table_name_2\n-- AND active = 1\n) b ON a.id = b.id`);
    expect(result).toContain('-- AND active = 1');
  });

  it('preserves comment between JOIN clauses', () => {
    const sql = `SELECT * FROM dbo.tbl1 a LEFT OUTER JOIN dbo.tbl2 b ON a.col1 = b.col1\n/* comment between joins */\nCROSS APPLY (SELECT * FROM dbo.tbl3) AS x`;
    const result = formatSQL(sql);
    expect(result).toContain('/* comment between joins */');
  });

  it('preserves comment inside subquery paren group', () => {
    const sql = `SELECT * FROM dbo.tbl1 a CROSS APPLY (\n/* inner comment */\nSELECT * FROM dbo.tbl2) AS x`;
    const result = formatSQL(sql);
    expect(result).toContain('/* inner comment */');
  });

  it('preserves comments before parenthesized expression in select list', () => {
    const sql = `SELECT col1,\ncol2,\n-- commented column\n-- another comment\n(col_value1 * col_value2) AS value\nFROM dbo.t`;
    const result = formatSQL(sql, { dml: { collapseShortStatements: false } });
    expect(result).toContain('-- commented column');
    expect(result).toContain('-- another comment');
    expect(result).toContain('(col_value1 * col_value2)');
  });
});

// ---- CREATE TABLE with CONSTRAINT ----

describe('CREATE TABLE with CONSTRAINT', () => {
  it('formats CREATE TABLE with CONSTRAINT in column list', () => {
    const sql = `DROP TABLE IF EXISTS dbo.table_name_1
GO
CREATE TABLE dbo.table_name_1 (
id INT IDENTITY(1,1) NOT NULL,
column_1 VARCHAR(50) NOT NULL,
column_2 VARCHAR(255) NOT NULL,
column_3 VARCHAR(50) NULL,
CONSTRAINT pk_table_name_1 PRIMARY KEY (id)
)
GO`;
    const result = formatSQL(sql);
    expect(result).toContain('DROP TABLE IF EXISTS');
    expect(result).toContain('CREATE TABLE dbo.table_name_1');
    expect(result).toContain('CONSTRAINT pk_table_name_1 PRIMARY KEY');
    expect(result).toContain('id');
    expect(result).toContain('column_1');
    expect(result).toContain('column_2');
    expect(result).toContain('column_3');
    expect(result).toContain('GO');
  });

  it('CREATE TABLE with CONSTRAINT is idempotent', () => {
    const sql = `CREATE TABLE dbo.table_name_1 (
id INT IDENTITY(1,1) NOT NULL,
column_1 VARCHAR(50) NOT NULL,
CONSTRAINT pk_table_name_1 PRIMARY KEY (id)
)`;
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });

  it('encloses column names and constraint identifiers with brackets', () => {
    const sql = `CREATE TABLE dbo.table_name_1 (
id INT IDENTITY(1,1) NOT NULL,
column_1 VARCHAR(50) NOT NULL,
column_2 VARCHAR(255) NOT NULL,
CONSTRAINT pk_table_name_1 PRIMARY KEY (id)
)`;
    const result = formatSQL(sql, {
      identifiers: { encloseIdentifiers: 'withBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: true },
    });
    expect(result).toContain('[dbo].[table_name_1]');
    expect(result).toContain('[id]');
    expect(result).toContain('[column_1]');
    expect(result).toContain('[column_2]');
    expect(result).toContain('CONSTRAINT [pk_table_name_1] PRIMARY KEY ([id])');
  });

  it('strips brackets from column names with withoutBrackets', () => {
    const sql = `CREATE TABLE [dbo].[table_name_1] (
[id] INT NOT NULL,
[column_1] VARCHAR(50) NOT NULL,
CONSTRAINT [pk_table_name_1] PRIMARY KEY ([id])
)`;
    const result = formatSQL(sql, {
      identifiers: { encloseIdentifiers: 'withoutBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: false },
    });
    expect(result).toContain('dbo.table_name_1');
    expect(result).not.toMatch(/\[id\]/);
    expect(result).not.toMatch(/\[column_1\]/);
    expect(result).toContain('CONSTRAINT pk_table_name_1 PRIMARY KEY (id)');
  });

  it('CREATE TABLE with brackets is idempotent', () => {
    const sql = `CREATE TABLE dbo.table_name_1 (
id INT IDENTITY(1,1) NOT NULL,
column_1 VARCHAR(50) NOT NULL,
CONSTRAINT pk_table_name_1 PRIMARY KEY (id)
)`;
    const config = {
      identifiers: { encloseIdentifiers: 'withBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: true },
    };
    const first = formatSQL(sql, config);
    const second = formatSQL(first, config);
    expect(first).toBe(second);
  });
});

// ---- CROSS APPLY / OUTER APPLY ----

describe('CROSS APPLY / OUTER APPLY', () => {
  it('formats CROSS APPLY with table-valued function', () => {
    const sql = `SELECT * FROM (SELECT [json_column] FROM dbo.table_name_1) [tbl] CROSS APPLY OPENJSON([json_column]) AS [w]`;
    const result = formatSQL(sql);
    expect(result).toContain('CROSS APPLY');
    expect(result).toContain('OPENJSON([json_column])');
    expect(result).toContain('AS [w]');
  });

  it('formats OUTER APPLY with subquery', () => {
    const sql = `SELECT * FROM dbo.t1 OUTER APPLY (SELECT TOP 1 col1 FROM dbo.t2 WHERE t2.id = t1.id) AS x`;
    const result = formatSQL(sql);
    expect(result).toContain('OUTER APPLY');
    expect(result).toContain('AS x');
  });

  it('formats CROSS APPLY with STRING_SPLIT', () => {
    const sql = `SELECT * FROM dbo.t1 CROSS APPLY STRING_SPLIT(col1, ',') AS s`;
    const result = formatSQL(sql);
    expect(result).toContain('CROSS APPLY');
    expect(result).toContain("STRING_SPLIT(col1, ',')");
    expect(result).toContain('AS s');
  });

  it('CROSS APPLY is idempotent', () => {
    const sql = `SELECT * FROM (SELECT [json_column] FROM dbo.table_name_1) [tbl] CROSS APPLY OPENJSON([json_column]) AS [w]`;
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });

  it('OUTER APPLY is idempotent', () => {
    const sql = `SELECT * FROM dbo.t1 OUTER APPLY (SELECT TOP 1 col1 FROM dbo.t2 WHERE t2.id = t1.id) AS x`;
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });
});

// ---- Leading comma input reformatting ----

describe('leading comma input', () => {
  it('reformats leading commas to trailing commas in SELECT', () => {
    const sql = `SELECT column1\n,column2\n,column3\nFROM @table_variable`;
    const result = formatSQL(sql);
    expect(result).toContain('column1');
    expect(result).toContain('column2');
    expect(result).toContain('column3');
    expect(result).toContain('FROM');
    // Should NOT have semicolons between columns
    expect(result).not.toMatch(/column1;\s/);
    expect(result).not.toMatch(/column2;\s/);
  });

  it('reformats leading commas in INSERT INTO ... SELECT', () => {
    const sql = `INSERT INTO dbo.table_name_1\n(\ncolumn1\n,column2\n,column3\n)\nSELECT column1\n,column2\n,column3\nFROM @table_variable`;
    const result = formatSQL(sql);
    expect(result).toContain('INSERT INTO');
    expect(result).toContain('column1');
    expect(result).toContain('column2');
    expect(result).toContain('column3');
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
    // All three columns should be in the SELECT
    const selectIdx = result.indexOf('SELECT');
    const fromIdx = result.indexOf('FROM', selectIdx);
    const selectPart = result.substring(selectIdx, fromIdx);
    expect(selectPart).toContain('column1');
    expect(selectPart).toContain('column2');
    expect(selectPart).toContain('column3');
  });

  it('reformats leading commas with brackets and semicolons', () => {
    const sql = `INSERT INTO dbo.table_name_1\n(\ncolumn1\n,column2\n,column3\n)\nSELECT column1\n,column2\n,column3\nFROM @table_variable`;
    const result = formatSQL(sql, {
      identifiers: { encloseIdentifiers: 'withBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: true },
      whitespace: { insertSemicolons: 'insert' },
    });
    expect(result).toContain('[column1]');
    expect(result).toContain('[column2]');
    expect(result).toContain('[column3]');
    // Should NOT produce individual semicolons after each column
    expect(result).not.toMatch(/\[column1\];?\s*\n\s*\[column2\]/);
  });

  it('leading comma SELECT is idempotent', () => {
    const sql = `SELECT column1\n,column2\n,column3\nFROM @table_variable`;
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });

  it('leading comma INSERT INTO SELECT is idempotent', () => {
    const sql = `INSERT INTO dbo.table_name_1\n(\ncolumn1\n,column2\n,column3\n)\nSELECT column1\n,column2\n,column3\nFROM @table_variable`;
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });
});

// ---- CTE with bracket-quoted names ----

describe('CTE with bracket-quoted names', () => {
  it('parses and formats CTE with bracket-quoted name', () => {
    const sql = 'WITH [cte1] AS (SELECT 1 AS col1) SELECT * FROM [cte1]';
    const result = formatSQL(sql);
    expect(result).toContain('WITH [cte1] AS');
    expect(result).toContain('SELECT * FROM [cte1]');
  });

  it('parses and formats CTE with bracket-quoted name and column list', () => {
    const sql = 'WITH [cte1] ([col1]) AS (SELECT DISTINCT [col1] FROM dbo.t1) SELECT * FROM [cte1]';
    const result = formatSQL(sql);
    expect(result).toContain('WITH [cte1] ([col1]) AS');
    expect(result).toContain('SELECT * FROM [cte1]');
  });

  it('parses multiple bracket-quoted CTEs', () => {
    const sql = 'WITH [cte1] ([col1]) AS (SELECT 1 AS col1), [cte2] ([col1]) AS (SELECT 2 AS col1) SELECT * FROM [cte2]';
    const result = formatSQL(sql);
    expect(result).toContain('[cte1]');
    expect(result).toContain('[cte2]');
  });
});

// ---- UNION / UNION ALL / EXCEPT / INTERSECT ----

describe('UNION / EXCEPT / INTERSECT', () => {
  it('formats UNION between two SELECTs', () => {
    const result = formatSQL('SELECT col1 FROM t1 UNION SELECT col1 FROM t2');
    expect(result).toContain('UNION');
    expect(result).toContain('FROM');
    expect(result.split('SELECT').length).toBe(3); // 2 SELECTs + 1 empty before first
  });

  it('formats UNION ALL', () => {
    const result = formatSQL('SELECT col1 FROM t1 UNION ALL SELECT col1 FROM t2');
    expect(result).toContain('UNION ALL');
  });

  it('formats EXCEPT', () => {
    const result = formatSQL('SELECT col1 FROM t1 EXCEPT SELECT col1 FROM t2');
    expect(result).toContain('EXCEPT');
  });

  it('formats INTERSECT', () => {
    const result = formatSQL('SELECT col1 FROM t1 INTERSECT SELECT col1 FROM t2');
    expect(result).toContain('INTERSECT');
  });

  it('formats chained UNIONs', () => {
    const result = formatSQL('SELECT col1 FROM t1 UNION SELECT col1 FROM t2 UNION SELECT col1 FROM t3');
    const unions = result.match(/UNION/g);
    expect(unions).toHaveLength(2);
  });

  // --- WITHIN GROUP (ORDER BY) ---

  it('formats STRING_AGG with WITHIN GROUP (ORDER BY)', () => {
    const result = formatSQL('SELECT STRING_AGG(name, \',\') WITHIN GROUP (ORDER BY name) FROM t1');
    expect(result).toContain('WITHIN GROUP (ORDER BY');
    expect(result).toContain('name)');
  });

  it('formats WITHIN GROUP with direction (ASC/DESC)', () => {
    const result = formatSQL('SELECT STRING_AGG(col, \',\') WITHIN GROUP (ORDER BY col DESC) FROM t1');
    expect(result).toContain('WITHIN GROUP (ORDER BY');
    expect(result).toContain('DESC)');
  });

  it('formats WITHIN GROUP with alias', () => {
    const result = formatSQL('SELECT STRING_AGG(name, \',\') WITHIN GROUP (ORDER BY name) AS names FROM t1');
    expect(result).toContain('WITHIN GROUP (ORDER BY');
    expect(result).toContain('AS names');
  });

  it('formats WITHIN GROUP with multiple ORDER BY columns', () => {
    const result = formatSQL('SELECT STRING_AGG(name, \',\') WITHIN GROUP (ORDER BY last_name, first_name ASC) FROM t1');
    expect(result).toContain('WITHIN GROUP (ORDER BY');
    expect(result).toContain('last_name, first_name ASC)');
  });

  it('formats WITHIN GROUP idempotently', () => {
    const sql = 'SELECT STRING_AGG(name, \',\') WITHIN GROUP (ORDER BY name DESC) AS names FROM t1';
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });

  it('expands function args when WITHIN GROUP suffix exceeds wrap limit', () => {
    const sql = "SELECT @var = STRING_AGG(CONCAT('[', column_name, ']'), ',') WITHIN GROUP (ORDER BY column_name, column2) FROM dbo.table_name_1 WHERE col2 = 'n'";
    const result = formatSQL(sql, {
      whitespace: { wrapLongLines: true, wrapLinesLongerThan: 78 },
      dml: { collapseShortStatements: false },
    });
    // The function args should be expanded across multiple lines
    expect(result).toContain('STRING_AGG (\n');
    expect(result).toContain('WITHIN GROUP (ORDER BY');
    // Every line should be within the wrap limit
    for (const line of result.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });
});
