import { CaseOption } from './config';

/** T-SQL reserved keywords */
export const RESERVED_KEYWORDS = new Set([
  'ADD', 'ALL', 'ALTER', 'AND', 'ANY', 'AS', 'ASC', 'AUTHORIZATION', 'BACKUP',
  'BEGIN', 'BETWEEN', 'BREAK', 'BROWSE', 'BULK', 'BY', 'CASCADE', 'CASE',
  'CHECK', 'CHECKPOINT', 'CLOSE', 'CLUSTERED', 'COALESCE', 'COLLATE', 'COLUMN',
  'COMMIT', 'COMPUTE', 'CONSTRAINT', 'CONTAINS', 'CONTAINSTABLE', 'CONTINUE',
  'CONVERT', 'CREATE', 'CROSS', 'CURRENT', 'CURRENT_DATE', 'CURRENT_TIME',
  'CURRENT_TIMESTAMP', 'CURRENT_USER', 'CURSOR', 'DATABASE', 'DBCC', 'DEALLOCATE',
  'DECLARE', 'DEFAULT', 'DELETE', 'DENY', 'DESC', 'DISK', 'DISTINCT',
  'DISABLE', 'DISTRIBUTED', 'DOUBLE', 'DROP', 'DUMP', 'ELSE', 'ENABLE', 'END', 'ERRLVL', 'ESCAPE',
  'EXCEPT', 'EXEC', 'EXECUTE', 'EXISTS', 'EXIT', 'EXTERNAL', 'FETCH', 'FILE',
  'FILLFACTOR', 'FOR', 'FOREIGN', 'FREETEXT', 'FREETEXTTABLE', 'FROM', 'FULL',
  'FUNCTION', 'GOTO', 'GRANT', 'GROUP', 'HAVING', 'HOLDLOCK', 'IDENTITY',
  'IDENTITY_INSERT', 'IDENTITYCOL', 'IF', 'IN', 'INDEX', 'INNER', 'INSERT',
  'INTERSECT', 'INTO', 'IS', 'JOIN', 'KEY', 'KILL', 'LEFT', 'LIKE', 'LINENO',
  'LOAD', 'MERGE', 'NATIONAL', 'NOCHECK', 'NONCLUSTERED', 'NOT', 'NULL',
  'NULLIF', 'OF', 'OFF', 'OFFSETS', 'ON', 'OPEN', 'OPENDATASOURCE', 'OPENQUERY',
  'OPENROWSET', 'OPENXML', 'OPTION', 'OR', 'ORDER', 'OUTER', 'OUTPUT', 'OVER',
  'PERCENT', 'PIVOT', 'PLAN', 'PRECISION', 'PRIMARY', 'PRINT', 'PROC',
  'PROCEDURE', 'PUBLIC', 'RAISERROR', 'READ', 'READTEXT', 'RECONFIGURE',
  'REFERENCES', 'REPLICATION', 'RESTORE', 'RESTRICT', 'RETURN', 'REVERT',
  'REVOKE', 'RIGHT', 'ROLLBACK', 'ROWCOUNT', 'ROWGUIDCOL', 'RULE', 'SAVE',
  'SCHEMA', 'SECURITYAUDIT', 'SELECT', 'SEMANTICKEYPHRASETABLE',
  'SEMANTICSIMILARITYDETAILSTABLE', 'SEMANTICSIMILARITYTABLE', 'SESSION_USER',
  'SET', 'SETUSER', 'SHUTDOWN', 'SOME', 'STATISTICS', 'SYSTEM_USER', 'TABLE',
  'TABLESAMPLE', 'TEXTSIZE', 'THEN', 'THROW', 'TO', 'TOP', 'TRAN',
  'TRANSACTION', 'TRIGGER', 'TRUNCATE', 'TRY_CONVERT', 'TSEQUAL', 'UNION',
  'UNIQUE', 'UNPIVOT', 'UPDATE', 'UPDATETEXT', 'USE', 'USER', 'VALUES',
  'VARYING', 'VIEW', 'WAITFOR', 'WHEN', 'WHERE', 'WHILE', 'WITH',
  'WITHIN GROUP', 'WRITETEXT',
  // SET options
  'NOCOUNT', 'ANSI_NULLS', 'ANSI_PADDING', 'QUOTED_IDENTIFIER', 'XACT_ABORT',
  'ARITHABORT', 'CONCAT_NULL_YIELDS_NULL', 'ANSI_WARNINGS', 'NUMERIC_ROUNDABORT',
  // Batch separator
  'GO',
]);

/** T-SQL built-in functions */
export const BUILTIN_FUNCTIONS = new Set([
  // Aggregate
  'AVG', 'COUNT', 'COUNT_BIG', 'MAX', 'MIN', 'SUM', 'STDEV', 'STDEVP',
  'VAR', 'VARP', 'GROUPING', 'GROUPING_ID', 'STRING_AGG', 'APPROX_COUNT_DISTINCT',
  // String
  'ASCII', 'CHAR', 'CHARINDEX', 'CONCAT', 'CONCAT_WS', 'DIFFERENCE', 'FORMAT',
  'LEFT', 'LEN', 'LOWER', 'LTRIM', 'NCHAR', 'PATINDEX', 'QUOTENAME',
  'REPLACE', 'REPLICATE', 'REVERSE', 'RIGHT', 'RTRIM', 'SOUNDEX', 'SPACE',
  'STR', 'STRING_ESCAPE', 'STRING_SPLIT', 'STUFF', 'SUBSTRING', 'TRANSLATE',
  'TRIM', 'UNICODE', 'UPPER',
  // Date/time
  'DATEADD', 'DATEDIFF', 'DATEDIFF_BIG', 'DATENAME', 'DATEPART', 'DATETRUNC',
  'DAY', 'EOMONTH', 'GETDATE', 'GETUTCDATE', 'ISDATE', 'MONTH',
  'SWITCHOFFSET', 'SYSDATETIME', 'SYSDATETIMEOFFSET', 'SYSUTCDATETIME',
  'TODATETIMEOFFSET', 'YEAR', 'CURRENT_TIMESTAMP',
  // Math
  'ABS', 'ACOS', 'ASIN', 'ATAN', 'ATN2', 'CEILING', 'COS', 'COT', 'DEGREES',
  'EXP', 'FLOOR', 'LOG', 'LOG10', 'PI', 'POWER', 'RADIANS', 'RAND', 'ROUND',
  'SIGN', 'SIN', 'SQRT', 'SQUARE', 'TAN',
  // Conversion
  'CAST', 'CONVERT', 'PARSE', 'TRY_CAST', 'TRY_CONVERT', 'TRY_PARSE',
  // System
  'COALESCE', 'NULLIF', 'ISNULL', 'IIF', 'CHOOSE',
  'DB_ID', 'DB_NAME', 'HOST_ID', 'HOST_NAME', 'NEWID', 'NEWSEQUENTIALID',
  'OBJECT_ID', 'OBJECT_NAME', 'SCOPE_IDENTITY', 'SERVERPROPERTY',
  'SESSIONPROPERTY', 'SUSER_ID', 'SUSER_NAME', 'SUSER_SNAME', 'USER_ID',
  'USER_NAME', 'SCHEMA_ID', 'SCHEMA_NAME', 'TYPE_ID', 'TYPE_NAME',
  // Ranking
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE',
  // Analytic
  'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'CUME_DIST', 'PERCENT_RANK',
  'PERCENTILE_CONT', 'PERCENTILE_DISC',
  // JSON
  'ISJSON', 'JSON_VALUE', 'JSON_QUERY', 'JSON_MODIFY', 'JSON_PATH_EXISTS',
  'OPENJSON',
  // Misc
  'ERROR_LINE', 'ERROR_MESSAGE', 'ERROR_NUMBER', 'ERROR_PROCEDURE',
  'ERROR_SEVERITY', 'ERROR_STATE', 'FORMATMESSAGE', 'XACT_STATE',
]);

/** T-SQL built-in data types */
export const BUILTIN_DATA_TYPES = new Set([
  'BIGINT', 'INT', 'SMALLINT', 'TINYINT', 'BIT',
  'DECIMAL', 'NUMERIC', 'MONEY', 'SMALLMONEY', 'FLOAT', 'REAL',
  'DATE', 'TIME', 'DATETIME', 'DATETIME2', 'DATETIMEOFFSET', 'SMALLDATETIME',
  'CHAR', 'VARCHAR', 'TEXT', 'NCHAR', 'NVARCHAR', 'NTEXT',
  'BINARY', 'VARBINARY', 'IMAGE',
  'UNIQUEIDENTIFIER', 'XML', 'SQL_VARIANT', 'TABLE',
  'CURSOR', 'HIERARCHYID', 'GEOMETRY', 'GEOGRAPHY', 'ROWVERSION', 'TIMESTAMP',
  'SYSNAME',
]);

/** T-SQL global variables */
export const GLOBAL_VARIABLES = new Set([
  '@@CONNECTIONS', '@@CPU_BUSY', '@@CURSOR_ROWS', '@@DATEFIRST', '@@DBTS',
  '@@ERROR', '@@FETCH_STATUS', '@@IDENTITY', '@@IDLE', '@@IO_BUSY',
  '@@LANGID', '@@LANGUAGE', '@@LOCK_TIMEOUT', '@@MAX_CONNECTIONS',
  '@@MAX_PRECISION', '@@NESTLEVEL', '@@OPTIONS', '@@PACK_RECEIVED',
  '@@PACK_SENT', '@@PACKET_ERRORS', '@@PROCID', '@@REMSERVER', '@@ROWCOUNT',
  '@@SERVERNAME', '@@SERVICENAME', '@@SPID', '@@TEXTSIZE', '@@TIMETICKS',
  '@@TOTAL_ERRORS', '@@TOTAL_READ', '@@TOTAL_WRITE', '@@TRANCOUNT', '@@VERSION',
]);

export type WordCategory = 'keyword' | 'function' | 'dataType' | 'globalVariable' | 'identifier';

export function categorizeWord(word: string): WordCategory {
  const upper = word.toUpperCase();
  if (upper.startsWith('@@') && GLOBAL_VARIABLES.has(upper)) return 'globalVariable';
  if (BUILTIN_DATA_TYPES.has(upper)) return 'dataType';
  if (BUILTIN_FUNCTIONS.has(upper)) return 'function';
  if (RESERVED_KEYWORDS.has(upper)) return 'keyword';
  return 'identifier';
}

export function applyCase(word: string, option: CaseOption): string {
  switch (option) {
    case 'asis': return word;
    case 'lowercase': return word.toLowerCase();
    case 'uppercase': return word.toUpperCase();
    case 'lowerCamelCase': return toCamelCase(word, false);
    case 'upperCamelCase': return toCamelCase(word, true);
    default: return word;
  }
}

function toCamelCase(word: string, upperFirst: boolean): string {
  // Split on underscores or word boundaries
  const parts = word.split('_').filter(p => p.length > 0);
  return parts.map((part, i) => {
    if (i === 0 && !upperFirst) {
      return part.toLowerCase();
    }
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('');
}

export function caseWord(word: string, config: {
  reservedKeywords: CaseOption;
  builtInFunctions: CaseOption;
  builtInDataTypes: CaseOption;
  globalVariables: CaseOption;
}): string {
  // Don't modify @variables or quoted identifiers
  if (word.startsWith('@') && !word.startsWith('@@')) return word;
  if (word.startsWith('[') || word.startsWith('"')) return word;

  const category = categorizeWord(word);
  switch (category) {
    case 'keyword': return applyCase(word, config.reservedKeywords);
    case 'function': return applyCase(word, config.builtInFunctions);
    case 'dataType': return applyCase(word, config.builtInDataTypes);
    case 'globalVariable': return applyCase(word, config.globalVariables);
    default: return word; // identifiers keep their original case
  }
}
