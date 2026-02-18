import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- variables.alignDataTypesAndValues ----

describe('variables.alignDataTypesAndValues', () => {
  const alignOn = {
    variables: { alignDataTypesAndValues: true, addSpaceBetweenDataTypeAndPrecision: false, placeAssignedValueOnNewLineIfLongerThanMaxLineLength: false, placeEqualsSignOnNewLine: false },
  };
  const alignOff = {
    variables: { alignDataTypesAndValues: false, addSpaceBetweenDataTypeAndPrecision: false, placeAssignedValueOnNewLineIfLongerThanMaxLineLength: false, placeEqualsSignOnNewLine: false },
  };

  it('aligns data types across multiple variables when true', () => {
    const result = formatSQL('DECLARE @x INT, @longvar VARCHAR(50) = NULL', alignOn);
    expect(result).toContain('@x       INT');
    expect(result).toContain('@longvar VARCHAR(50)');
  });

  it('does not align when false', () => {
    const result = formatSQL('DECLARE @x INT, @longvar VARCHAR(50)', alignOff);
    expect(result).toContain('@x INT');
    expect(result).toContain('@longvar VARCHAR(50)');
  });

  it('single variable is unaffected by alignment setting', () => {
    const result = formatSQL('DECLARE @x INT = 5', alignOn);
    expect(result.trim()).toBe('DECLARE @x INT = 5');
  });

  it('aligns three variables with varying name lengths', () => {
    const result = formatSQL('DECLARE @a INT, @bb VARCHAR(50), @ccc DATETIME', alignOn);
    const lines = result.split('\n').filter(l => l.includes('@'));
    // All data types should start at the same column
    const typePositions = lines.map(l => {
      const match = l.match(/(INT|VARCHAR|DATETIME)/);
      return match ? l.indexOf(match[0]) : -1;
    });
    expect(new Set(typePositions).size).toBe(1);
  });

  it('preserves default values when aligned', () => {
    const result = formatSQL("DECLARE @x INT = 5, @longvar VARCHAR(50) = 'hello'", alignOn);
    expect(result).toContain('= 5');
    expect(result).toContain("= 'hello'");
  });
});

// ---- DECLARE table variables ----

describe('DECLARE table variable', () => {
  it('formats DECLARE @t AS TABLE with columns', () => {
    const result = formatSQL('DECLARE @table_variable AS TABLE ( column_1 VARCHAR(50))');
    expect(result).toContain('DECLARE @table_variable AS TABLE');
    expect(result).toContain('column_1 VARCHAR(50)');
    expect(result).toContain('(');
    expect(result).toContain(')');
  });

  it('formats DECLARE @t TABLE without AS keyword', () => {
    const result = formatSQL('DECLARE @t TABLE (id INT, name VARCHAR(50))');
    expect(result).toContain('DECLARE @t TABLE');
    expect(result).toContain('id INT');
    expect(result).toContain('name VARCHAR(50)');
  });

  it('formats table variable with constraints', () => {
    const result = formatSQL('DECLARE @t TABLE (id INT NOT NULL, name VARCHAR(50), CONSTRAINT pk_t PRIMARY KEY (id))');
    expect(result).toContain('CONSTRAINT pk_t PRIMARY KEY (id)');
  });

  it('table variable with column alignment', () => {
    const result = formatSQL('DECLARE @t TABLE (id INT NOT NULL, longername VARCHAR(255))', {
      ddl: { alignDataTypesAndConstraints: true },
    });
    const lines = result.split('\n').filter(l => l.trim().startsWith('id') || l.trim().startsWith('longername'));
    expect(lines.length).toBe(2);
    // Data types should align
    const intPos = lines[0].indexOf('INT');
    const varcharPos = lines[1].indexOf('VARCHAR');
    expect(intPos).toBe(varcharPos);
  });

  it('DECLARE table variable is idempotent', () => {
    const sql = 'DECLARE @table_variable AS TABLE ( column_1 VARCHAR(50), column_2 INT)';
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });

  it('DECLARE table variable without AS is idempotent', () => {
    const sql = 'DECLARE @t TABLE (id INT NOT NULL, name VARCHAR(50))';
    const first = formatSQL(sql);
    const second = formatSQL(first);
    expect(first).toBe(second);
  });
});
