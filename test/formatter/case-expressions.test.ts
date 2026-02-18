import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- caseExpressions.collapseShortCaseExpressions + collapseCaseExpressionsShorterThan ----

describe('caseExpressions.collapseShortCaseExpressions', () => {
  const collapseOn = {
    caseExpressions: { placeExpressionOnNewLine: false, placeFirstWhenOnNewLine: 'always', whenAlignment: 'indentedFromCase', placeThenOnNewLine: false, thenAlignment: 'toWhen', placeElseOnNewLine: true, alignElseToWhen: true, placeEndOnNewLine: true, endAlignment: 'toCase', collapseShortCaseExpressions: true, collapseCaseExpressionsShorterThan: 78 },
    dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
  };
  const collapseOff = {
    caseExpressions: { placeExpressionOnNewLine: false, placeFirstWhenOnNewLine: 'always', whenAlignment: 'indentedFromCase', placeThenOnNewLine: false, thenAlignment: 'toWhen', placeElseOnNewLine: true, alignElseToWhen: true, placeEndOnNewLine: true, endAlignment: 'toCase', collapseShortCaseExpressions: false, collapseCaseExpressionsShorterThan: 78 },
    dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
  };

  it('collapses short CASE to one line', () => {
    const result = formatSQL("SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t", collapseOn);
    expect(result).toContain("CASE WHEN x = 1 THEN 'a' ELSE 'b' END");
  });

  it('expands CASE when collapse disabled', () => {
    const result = formatSQL("SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t", collapseOff);
    expect(result).toContain('CASE\n');
  });

  it('expands CASE when exceeding threshold', () => {
    const sql = "SELECT CASE WHEN some_column = 'very_long_value' THEN 'result_one' WHEN some_column = 'another_long_value' THEN 'result_two' ELSE 'default' END FROM t";
    const result = formatSQL(sql, {
      ...collapseOn,
      caseExpressions: { ...collapseOn.caseExpressions, collapseCaseExpressionsShorterThan: 40 },
    });
    expect(result).toContain('CASE\n');
  });

  it('collapses simple CASE (input expression)', () => {
    const result = formatSQL("SELECT CASE x WHEN 1 THEN 'a' ELSE 'b' END FROM t", collapseOn);
    expect(result).toContain("CASE x WHEN 1 THEN 'a' ELSE 'b' END");
  });

  it('collapses CASE in WHERE clause', () => {
    const result = formatSQL("SELECT a FROM t WHERE CASE WHEN a > 0 THEN 1 ELSE 0 END = 1", collapseOn);
    expect(result).toContain('CASE WHEN a > 0 THEN 1 ELSE 0 END');
  });

  it('collapses CASE in UPDATE SET', () => {
    const result = formatSQL("UPDATE t SET col1 = CASE WHEN x = 1 THEN 'a' ELSE 'b' END WHERE id = 1", collapseOn);
    expect(result).toContain("CASE WHEN x = 1 THEN 'a' ELSE 'b' END");
  });
});

// ---- caseExpressions.placeThenOnNewLine + thenAlignment ----

describe('caseExpressions.placeThenOnNewLine', () => {
  const base = {
    caseExpressions: { placeExpressionOnNewLine: false, placeFirstWhenOnNewLine: 'always', whenAlignment: 'indentedFromCase', placeThenOnNewLine: true, thenAlignment: 'toWhen', placeElseOnNewLine: true, alignElseToWhen: true, placeEndOnNewLine: true, endAlignment: 'toCase', collapseShortCaseExpressions: false, collapseCaseExpressionsShorterThan: 78 },
    dml: { clauseAlignment: 'toStatement', clauseIndentation: 4, placeDistinctAndTopClausesOnNewLine: false, addNewLineAfterDistinctAndTopClauses: false, collapseShortStatements: false, collapseStatementsShorterThan: 78, collapseShortSubqueries: true, collapseSubqueriesShorterThan: 78, listItems: { placeFromTableOnNewLine: 'always', placeWhereConditionOnNewLine: 'always', placeGroupByAndOrderByOnNewLine: 'always', placeInsertTableOnNewLine: false } },
  };

  it('true: THEN on separate line from WHEN', () => {
    const result = formatSQL("SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t", base);
    const lines = result.split('\n');
    const whenLine = lines.find(l => l.trim().startsWith('WHEN'));
    const thenLine = lines.find(l => l.trim().startsWith('THEN'));
    expect(whenLine).toBeDefined();
    expect(thenLine).toBeDefined();
    // WHEN and THEN should be on different lines
    expect(whenLine).not.toContain('THEN');
  });

  it('false: THEN on same line as WHEN', () => {
    const cfg = {
      ...base,
      caseExpressions: { ...base.caseExpressions, placeThenOnNewLine: false },
    };
    const result = formatSQL("SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t", cfg);
    const lines = result.split('\n');
    const whenLine = lines.find(l => l.trim().startsWith('WHEN'));
    expect(whenLine).toBeDefined();
    expect(whenLine).toContain('THEN');
  });

  it('thenAlignment toWhen: THEN aligns with WHEN', () => {
    const result = formatSQL("SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t", base);
    const lines = result.split('\n');
    const whenLine = lines.find(l => l.trim().startsWith('WHEN'));
    const thenLine = lines.find(l => l.trim().startsWith('THEN'));
    if (whenLine && thenLine) {
      const whenIndent = whenLine.length - whenLine.trimStart().length;
      const thenIndent = thenLine.length - thenLine.trimStart().length;
      expect(thenIndent).toBe(whenIndent);
    }
  });

  it('wraps long THEN expressions', () => {
    const sql = "SELECT CASE WHEN column1 = 'value' THEN (some_very_long_alias.some_very_long_column1 + some_very_long_alias.some_very_long_column2) * some_very_long_alias.some_very_long_column3 ELSE 0 END AS result FROM some_table";
    const result = formatSQL(sql, {
      ...base,
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 78, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    // All lines should respect the wrap limit
    for (const line of result.split('\n').filter(l => l.trim())) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
    expect(result).toContain('some_very_long_alias.some_very_long_column1');
  });

  it('does not wrap short THEN expressions', () => {
    const result = formatSQL("SELECT CASE WHEN a = 1 THEN b + c ELSE 0 END FROM t", base);
    const thenLine = result.split('\n').find(l => l.trim().startsWith('THEN'));
    expect(thenLine).toBeDefined();
    expect(thenLine).toContain('b + c');
  });
});
