import { tokenize, attachComments } from '../src/tokenizer';
import { parse } from '../src/parser';
import { format } from '../src/formatter';
import { DEFAULT_CONFIG, FormatConfig } from '../src/config';

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function formatSQL(sql: string, overrides?: Record<string, any>): string {
  const tokens = attachComments(tokenize(sql));
  const ast = parse(tokens);
  const config = overrides ? deepMerge(DEFAULT_CONFIG, overrides) as FormatConfig : DEFAULT_CONFIG;
  return format(ast, config);
}

export { DEFAULT_CONFIG, FormatConfig };

// ---- SQL Fixture Constants ----

export const SQL_SIMPLE_SELECT = 'SELECT a, b FROM t';
export const SQL_SELECT_WHERE = 'SELECT a, b FROM t WHERE a = 1';
export const SQL_SELECT_JOIN = 'SELECT a.col1, b.col2 FROM dbo.t1 a INNER JOIN dbo.t2 b ON a.id = b.id';
export const SQL_SELECT_GROUPBY = 'SELECT a, COUNT(*) FROM t GROUP BY a';
export const SQL_SELECT_ORDERBY = 'SELECT a, b FROM t ORDER BY a ASC, b DESC';
export const SQL_SELECT_HAVING = 'SELECT a, COUNT(*) FROM t GROUP BY a HAVING COUNT(*) > 1';
export const SQL_SELECT_SUBQUERY = "SELECT a FROM (SELECT a FROM t WHERE a > 0) sub";
export const SQL_SELECT_CTE = 'WITH cte AS (SELECT a FROM t) SELECT a FROM cte';
export const SQL_SELECT_CASE = "SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t";
export const SQL_SELECT_DISTINCT = 'SELECT DISTINCT a, b FROM t';
export const SQL_SELECT_TOP = 'SELECT TOP (10) a, b FROM t';

export const SQL_INSERT = 'INSERT INTO dbo.t1 (col1, col2) VALUES (1, 2)';
export const SQL_INSERT_SELECT = 'INSERT INTO dbo.t1 (col1, col2) SELECT a, b FROM t2';
export const SQL_UPDATE = "UPDATE dbo.t1 SET col1 = 1, col2 = 'a' WHERE id = 1";
export const SQL_DELETE = 'DELETE FROM dbo.t1 WHERE id = 1';

export const SQL_CREATE_TABLE = 'CREATE TABLE dbo.t1 (id INT, name VARCHAR(50), active BIT)';
export const SQL_CREATE_PROC = "CREATE PROCEDURE dbo.myProc (@a INT, @b VARCHAR(20)) AS BEGIN SELECT 1 END";
export const SQL_CREATE_PROC_SINGLE_PARAM = "CREATE PROCEDURE dbo.myProc (@a INT) AS BEGIN SELECT 1 END";

export const SQL_DECLARE = 'DECLARE @x INT = 5';
export const SQL_DECLARE_MULTI = 'DECLARE @x INT, @longvar VARCHAR(50) = NULL';
export const SQL_SET = 'SET @x = 1';
export const SQL_SET_NOCOUNT = 'SET NOCOUNT ON';

export const SQL_IF_ELSE = "IF @x > 0 PRINT 'yes' ELSE PRINT 'no'";
export const SQL_IF_BEGIN = "IF @x > 0 BEGIN SELECT 1 END ELSE BEGIN SELECT 2 END";
export const SQL_WHILE = 'WHILE @i < 10 SET @i = @i + 1';

export const SQL_BEGIN_END = 'BEGIN SELECT 1 END';

export const SQL_EXEC = "EXEC dbo.myProc @p1 = 'val1', @p2 = 42";

export const SQL_CASE_SIMPLE = "SELECT CASE x WHEN 1 THEN 'a' WHEN 2 THEN 'b' ELSE 'c' END FROM t";
export const SQL_CASE_SEARCHED = "SELECT CASE WHEN x = 1 THEN 'a' WHEN x = 2 THEN 'b' ELSE 'c' END FROM t";

export const SQL_IN_EXPR = "SELECT a FROM t WHERE a IN (1, 2, 3)";
export const SQL_BETWEEN_EXPR = "SELECT a FROM t WHERE a BETWEEN 1 AND 10";

export const SQL_LONG_SELECT = "SELECT column1, column2, column3, column4, column5 FROM dbo.some_very_long_table_name WHERE column1 = 'some_value'";
