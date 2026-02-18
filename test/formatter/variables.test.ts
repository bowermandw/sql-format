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
