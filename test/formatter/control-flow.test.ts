import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- controlFlow.collapseShortStatements + collapseStatementsShorterThan ----

describe('controlFlow.collapseShortStatements', () => {
  const collapseOn = {
    controlFlow: { placeBeginKeywordOnNewLine: true, indentBeginEndKeywords: false, indentContentsOfStatements: true, collapseShortStatements: true, collapseStatementsShorterThan: 78 },
  };
  const collapseOff = {
    controlFlow: { placeBeginKeywordOnNewLine: true, indentBeginEndKeywords: false, indentContentsOfStatements: true, collapseShortStatements: false, collapseStatementsShorterThan: 78 },
  };

  it('collapses short IF/ELSE to one line', () => {
    const result = formatSQL("IF @x > 0 PRINT 'yes' ELSE PRINT 'no'", collapseOn);
    expect(result.trim().split('\n').length).toBe(1);
    expect(result).toContain('IF');
    expect(result).toContain('ELSE');
  });

  it('expands IF/ELSE when collapse disabled', () => {
    const result = formatSQL("IF @x > 0 PRINT 'yes' ELSE PRINT 'no'", collapseOff);
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('collapses short IF-only (no ELSE)', () => {
    const result = formatSQL("IF @x > 0 PRINT 'yes'", collapseOn);
    expect(result.trim().split('\n').length).toBe(1);
    expect(result.trim()).toContain("IF @x > 0 PRINT 'yes'");
  });

  it('expands long IF when exceeding threshold', () => {
    const result = formatSQL("IF @some_very_long_variable_name > 0 PRINT 'this is a very long print statement that goes beyond threshold'", {
      controlFlow: { placeBeginKeywordOnNewLine: true, indentBeginEndKeywords: false, indentContentsOfStatements: true, collapseShortStatements: true, collapseStatementsShorterThan: 40 },
    });
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('collapses short WHILE to one line', () => {
    const result = formatSQL('WHILE @i < 10 SET @i = @i + 1', collapseOn);
    expect(result.trim().split('\n').length).toBe(1);
  });

  it('expands WHILE when collapse disabled', () => {
    const result = formatSQL('WHILE @i < 10 SET @i = @i + 1', collapseOff);
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('does not collapse IF with BEGIN/END body (always multi-line)', () => {
    const result = formatSQL('IF @x > 0 BEGIN SELECT 1 END ELSE BEGIN SELECT 2 END', collapseOff);
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(result).toContain('BEGIN');
    expect(result).toContain('END');
  });

  it('nested IF inside BEGIN/END: inner IF can collapse', () => {
    const result = formatSQL("BEGIN\nIF @x > 0 PRINT 'yes'\nEND", collapseOn);
    // The inner IF should be collapsed
    const lines = result.trim().split('\n');
    const ifLine = lines.find(l => l.includes('IF'));
    expect(ifLine).toBeDefined();
    expect(ifLine).toContain("PRINT 'yes'");
  });
});

// ---- Comments before END ----

describe('comments before END keyword', () => {
  it('preserves comments before END in BEGIN/END block', () => {
    const sql = 'BEGIN\nSELECT 1\n-- comment before end\nEND';
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before end');
    expect(result).toContain('END');
  });

  it('preserves blank line before comments before END', () => {
    const sql = 'BEGIN\nSELECT 1\n\n-- comment 1\n-- comment 2\nEND';
    const result = formatSQL(sql);
    expect(result).toContain('-- comment 1');
    expect(result).toContain('-- comment 2');
    // Blank line should be preserved before the comments
    const lines = result.split('\n');
    const selectIdx = lines.findIndex(l => l.includes('SELECT'));
    const commentIdx = lines.findIndex(l => l.includes('-- comment 1'));
    expect(lines[selectIdx + 1]).toBe('');
    expect(commentIdx).toBe(selectIdx + 2);
  });
});
