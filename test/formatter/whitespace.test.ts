import { describe, it, expect } from 'vitest';
import { formatSQL, SQL_SIMPLE_SELECT, SQL_SET_NOCOUNT, SQL_DECLARE, SQL_BEGIN_END, SQL_SELECT_WHERE, SQL_LONG_SELECT, SQL_CREATE_PROC } from '../helpers';

// ---- whitespace.tabBehavior + numberOfSpacesInTab ----

describe('whitespace.tabBehavior', () => {
  it('onlySpaces: indents with spaces (default)', () => {
    const result = formatSQL('BEGIN SELECT 1 END', {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    const lines = result.trim().split('\n');
    const selectLine = lines.find(l => l.includes('SELECT'));
    expect(selectLine).toBeDefined();
    expect(selectLine!.startsWith('    ')).toBe(true);
    expect(selectLine!.startsWith('\t')).toBe(false);
  });

  it('onlyTabs: indents with tabs', () => {
    const result = formatSQL('BEGIN SELECT 1 END', {
      whitespace: { tabBehavior: 'onlyTabs', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    const lines = result.trim().split('\n');
    const selectLine = lines.find(l => l.includes('SELECT'));
    expect(selectLine).toBeDefined();
    expect(selectLine!.startsWith('\t')).toBe(true);
  });

  it('numberOfSpacesInTab: 2 spaces per indent level', () => {
    const result = formatSQL('BEGIN SELECT 1 END', {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 2, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    const lines = result.trim().split('\n');
    const selectLine = lines.find(l => l.includes('SELECT'));
    expect(selectLine).toBeDefined();
    expect(selectLine!.startsWith('  SELECT')).toBe(true);
    expect(selectLine!.startsWith('    ')).toBe(false);
  });

  it('numberOfSpacesInTab: 8 spaces per indent level', () => {
    const result = formatSQL('BEGIN SELECT 1 END', {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 8, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    const lines = result.trim().split('\n');
    const selectLine = lines.find(l => l.includes('SELECT'));
    expect(selectLine).toBeDefined();
    expect(selectLine!.startsWith('        SELECT')).toBe(true);
  });
});

// ---- whitespace.wrapLongLines + wrapLinesLongerThan ----

describe('whitespace.wrapLongLines', () => {
  it('wraps lines exceeding wrapLinesLongerThan', () => {
    const sql = "SELECT CONCAT(column1, ' - ', column2, ' / ', column3, ' (', column4, ')', ' [', column5, ']') FROM some_table";
    const result = formatSQL(sql, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 78, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    for (const line of result.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });

  it('does not wrap when wrapLongLines is false', () => {
    const sql = "SELECT CONCAT(column1, ' - ', column2, ' / ', column3, ' (', column4, ')') FROM some_table";
    const result = formatSQL(sql, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: false, wrapLinesLongerThan: 40, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    // CONCAT should stay on one line since wrapping is disabled
    expect(result).toContain('CONCAT(column1');
    const concatLine = result.split('\n').find(l => l.includes('CONCAT'));
    expect(concatLine).toBeDefined();
    expect(concatLine!.includes('\n')).toBe(false);
  });

  it('keeps short lines on one line', () => {
    const result = formatSQL('SELECT CONCAT(a, b) FROM t', {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 78, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result).toContain('CONCAT(a, b)');
  });
});

// ---- whitespace.whitespaceBeforeSemicolon ----

describe('whitespace.whitespaceBeforeSemicolon', () => {
  it('none: semicolon immediately after statement', () => {
    const result = formatSQL(SQL_SET_NOCOUNT, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'insert', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result.trim()).toBe('SET NOCOUNT ON;');
  });

  it('spaceBefore: space before semicolon', () => {
    const result = formatSQL(SQL_SET_NOCOUNT, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'spaceBefore', insertSemicolons: 'insert', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result.trim()).toBe('SET NOCOUNT ON ;');
  });

  it('newLineBefore: semicolon on new line', () => {
    const result = formatSQL(SQL_SET_NOCOUNT, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'newLineBefore', insertSemicolons: 'insert', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result).toContain('SET NOCOUNT ON\n;');
  });
});

// ---- whitespace.insertSemicolons ----

describe('whitespace.insertSemicolons', () => {
  it('insert: adds semicolons after leaf statements', () => {
    const result = formatSQL('SET NOCOUNT ON\nSELECT a FROM t', {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'insert', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result).toContain('SET NOCOUNT ON;');
    expect(result).toMatch(/FROM\s+t;/);
  });

  it('asis: does not add semicolons when absent', () => {
    const result = formatSQL('SET NOCOUNT ON\nSELECT a FROM t');
    expect(result).not.toContain(';');
  });

  it('insert: adds semicolons inside BEGIN/END', () => {
    const result = formatSQL('BEGIN\nSET NOCOUNT ON\nSELECT 1\nEND', {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'insert', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result).toContain('SET NOCOUNT ON;');
    expect(result).not.toMatch(/BEGIN;/);
    expect(result).not.toMatch(/END;/);
  });

  it('insert: does not add semicolons to BEGIN/END keywords', () => {
    const result = formatSQL('BEGIN SELECT 1 END', {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'insert', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result).not.toMatch(/BEGIN;/);
    expect(result).not.toMatch(/END;/);
  });
});

// ---- whitespace.newLines.preserveExistingEmptyLinesBetweenStatements ----

describe('whitespace.newLines.preserveExistingEmptyLinesBetweenStatements', () => {
  it('true: preserves blank lines between statements', () => {
    const sql = 'SET NOCOUNT ON\n\nSELECT 1';
    const result = formatSQL(sql, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    // Should have a blank line between the two statements
    expect(result).toContain('SET NOCOUNT ON\n\nSELECT 1');
  });

  it('false: removes blank lines between statements', () => {
    const sql = 'SET NOCOUNT ON\n\nSELECT 1';
    const result = formatSQL(sql, {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: false, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    // No blank line between
    expect(result).toContain('SET NOCOUNT ON\nSELECT 1');
  });
});

// ---- whitespace.lineEnding ----

describe('whitespace.lineEnding', () => {
  it('lf: uses LF line endings', () => {
    const result = formatSQL('BEGIN\nSELECT 1\nEND', {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'lf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result).not.toContain('\r\n');
    expect(result).toContain('\n');
  });

  it('crlf: uses CRLF line endings', () => {
    const result = formatSQL('BEGIN\nSELECT 1\nEND', {
      whitespace: { tabBehavior: 'onlySpaces', numberOfSpacesInTab: 4, lineEnding: 'crlf', wrapLongLines: true, wrapLinesLongerThan: 120, whitespaceBeforeSemicolon: 'none', insertSemicolons: 'asis', newLines: { preserveExistingEmptyLinesBetweenStatements: true, emptyLinesBetweenStatements: 1, emptyLinesAfterBatchSeparator: 1, preserveExistingEmptyLinesAfterBatchSeparator: true, preserveExistingEmptyLinesWithinStatements: true } },
    });
    expect(result).toContain('\r\n');
    // Every newline should be CRLF
    const lfOnly = result.replace(/\r\n/g, '');
    expect(lfOnly).not.toContain('\n');
  });
});

// ---- whitespace.newLines.preserveExistingEmptyLinesBetweenComments ----

describe('whitespace.newLines.preserveExistingEmptyLinesBetweenComments', () => {
  it('true: preserves blank lines between leading comments', () => {
    const sql = '-- comment 1\n\n-- comment 2\nSELECT 1';
    const result = formatSQL(sql);
    expect(result).toContain('-- comment 1\n\n-- comment 2');
  });

  it('false: collapses blank lines between leading comments', () => {
    const sql = '-- comment 1\n\n-- comment 2\nSELECT 1';
    const result = formatSQL(sql, {
      whitespace: { newLines: { preserveExistingEmptyLinesBetweenComments: false } },
    } as any);
    expect(result).toContain('-- comment 1\n-- comment 2');
    expect(result).not.toContain('-- comment 1\n\n-- comment 2');
  });

  it('multiple blank lines collapse to a single blank line', () => {
    const sql = '-- comment 1\n\n\n\n-- comment 2\nSELECT 1';
    const result = formatSQL(sql);
    // Should have exactly one blank line, not multiple
    expect(result).toContain('-- comment 1\n\n-- comment 2');
    expect(result).not.toContain('-- comment 1\n\n\n-- comment 2');
  });

  it('preserves blank lines between comments before statements inside BEGIN/END', () => {
    const sql = 'BEGIN\n-- first comment\n\n-- second comment\nSELECT 1\nEND';
    const result = formatSQL(sql);
    expect(result).toContain('-- first comment\n\n');
    expect(result).toContain('-- second comment');
  });
});
