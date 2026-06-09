import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- operators.comparison.addSpacesAroundComparisonOperators ----

describe('operators.comparison.addSpacesAroundComparisonOperators', () => {
  const spacesOn = {
    operators: { comparison: { align: false, addSpacesAroundComparisonOperators: true, addSpacesAroundArithmeticOperators: true }, andOr: { placeOnNewLine: 'always', alignment: 'indented', placeBeforeCondition: true }, between: { placeOnNewLine: false, placeAndKeywordOnNewLine: false, andAlignment: 'toBetween' }, in: { placeOpeningParenthesisOnNewLine: false, openingParenthesisAlignment: 'indented', placeFirstValueOnNewLine: 'never', placeSubsequentValuesOnNewLines: 'never', addSpaceAroundInContents: false } },
  };
  const spacesOff = {
    operators: { comparison: { align: false, addSpacesAroundComparisonOperators: false, addSpacesAroundArithmeticOperators: true }, andOr: { placeOnNewLine: 'always', alignment: 'indented', placeBeforeCondition: true }, between: { placeOnNewLine: false, placeAndKeywordOnNewLine: false, andAlignment: 'toBetween' }, in: { placeOpeningParenthesisOnNewLine: false, openingParenthesisAlignment: 'indented', placeFirstValueOnNewLine: 'never', placeSubsequentValuesOnNewLines: 'never', addSpaceAroundInContents: false } },
  };

  it('true: spaces around = in WHERE', () => {
    const result = formatSQL('SELECT a FROM t WHERE a = 1', spacesOn);
    expect(result).toContain('a = 1');
  });

  it('false: still has spaces (falls through to default spacing)', () => {
    // NOTE: The formatter's fallback always adds spaces around operators,
    // so the false case currently behaves the same as true.
    const result = formatSQL('SELECT a FROM t WHERE a = 1', spacesOff);
    expect(result).toContain('a = 1');
  });

  it('true: spaces around <> in WHERE', () => {
    const result = formatSQL('SELECT a FROM t WHERE a <> 1', spacesOn);
    expect(result).toContain('a <> 1');
  });

  it('true: spaces around = in JOIN ON', () => {
    const result = formatSQL('SELECT a.col FROM t1 a INNER JOIN t2 b ON a.id = b.id', spacesOn);
    expect(result).toContain('a.id = b.id');
  });

  it('true: spaces around = in UPDATE SET', () => {
    const result = formatSQL('UPDATE t SET col1 = 1 WHERE id = 1', spacesOn);
    expect(result).toContain('col1 = 1');
    expect(result).toContain('id = 1');
  });

  it('true: spaces around >= and <=', () => {
    const result = formatSQL('SELECT a FROM t WHERE a >= 1', spacesOn);
    expect(result).toContain('a >= 1');
  });
});

// ---- operators.comparison.addSpacesAroundArithmeticOperators ----

describe('operators.comparison.addSpacesAroundArithmeticOperators', () => {
  const spacesOn = {
    operators: { comparison: { align: false, addSpacesAroundComparisonOperators: true, addSpacesAroundArithmeticOperators: true }, andOr: { placeOnNewLine: 'always', alignment: 'indented', placeBeforeCondition: true }, between: { placeOnNewLine: false, placeAndKeywordOnNewLine: false, andAlignment: 'toBetween' }, in: { placeOpeningParenthesisOnNewLine: false, openingParenthesisAlignment: 'indented', placeFirstValueOnNewLine: 'never', placeSubsequentValuesOnNewLines: 'never', addSpaceAroundInContents: false } },
  };
  const spacesOff = {
    operators: { comparison: { align: false, addSpacesAroundComparisonOperators: true, addSpacesAroundArithmeticOperators: false }, andOr: { placeOnNewLine: 'always', alignment: 'indented', placeBeforeCondition: true }, between: { placeOnNewLine: false, placeAndKeywordOnNewLine: false, andAlignment: 'toBetween' }, in: { placeOpeningParenthesisOnNewLine: false, openingParenthesisAlignment: 'indented', placeFirstValueOnNewLine: 'never', placeSubsequentValuesOnNewLines: 'never', addSpaceAroundInContents: false } },
  };

  it('true: spaces around + in SELECT', () => {
    const result = formatSQL('SELECT a + b FROM t', spacesOn);
    expect(result).toContain('a + b');
  });

  it('false: still has spaces (falls through to default spacing)', () => {
    // NOTE: Same as comparison operators, the fallback adds spaces.
    const result = formatSQL('SELECT a + b FROM t', spacesOff);
    expect(result).toContain('a + b');
  });

  it('true: spaces around * in expressions', () => {
    const result = formatSQL('SELECT a * b FROM t', spacesOn);
    expect(result).toContain('a * b');
  });

  it('true: spaces around - in WHERE', () => {
    const result = formatSQL('SELECT a FROM t WHERE a - b > 0', spacesOn);
    expect(result).toContain('a - b');
  });
});

// ---- operators.in.addSpaceAroundInContents ----

describe('operators.in.addSpaceAroundInContents', () => {
  const spaceOn = {
    operators: { comparison: { align: false, addSpacesAroundComparisonOperators: true, addSpacesAroundArithmeticOperators: true }, andOr: { placeOnNewLine: 'always', alignment: 'indented', placeBeforeCondition: true }, between: { placeOnNewLine: false, placeAndKeywordOnNewLine: false, andAlignment: 'toBetween' }, in: { placeOpeningParenthesisOnNewLine: false, openingParenthesisAlignment: 'indented', placeFirstValueOnNewLine: 'never', placeSubsequentValuesOnNewLines: 'never', addSpaceAroundInContents: true } },
  };
  const spaceOff = {
    operators: { comparison: { align: false, addSpacesAroundComparisonOperators: true, addSpacesAroundArithmeticOperators: true }, andOr: { placeOnNewLine: 'always', alignment: 'indented', placeBeforeCondition: true }, between: { placeOnNewLine: false, placeAndKeywordOnNewLine: false, andAlignment: 'toBetween' }, in: { placeOpeningParenthesisOnNewLine: false, openingParenthesisAlignment: 'indented', placeFirstValueOnNewLine: 'never', placeSubsequentValuesOnNewLines: 'never', addSpaceAroundInContents: false } },
  };

  it('true: spaces inside IN parentheses', () => {
    const result = formatSQL('SELECT a FROM t WHERE a IN (1, 2, 3)', spaceOn);
    expect(result).toContain('IN ( 1, 2, 3 )');
  });

  it('false: no spaces inside IN parentheses', () => {
    const result = formatSQL('SELECT a FROM t WHERE a IN (1, 2, 3)', spaceOff);
    expect(result).toContain('IN (1, 2, 3)');
  });

  it('true: spaces with NOT IN', () => {
    const result = formatSQL('SELECT a FROM t WHERE a NOT IN (1, 2)', spaceOn);
    expect(result).toContain('NOT IN ( 1, 2 )');
  });

  it('false: no spaces with NOT IN', () => {
    const result = formatSQL('SELECT a FROM t WHERE a NOT IN (1, 2)', spaceOff);
    expect(result).toContain('NOT IN (1, 2)');
  });

  it('true: spaces in CASE WHEN with IN', () => {
    const result = formatSQL("SELECT CASE WHEN a IN (1, 2) THEN 'y' ELSE 'n' END FROM t", spaceOn);
    expect(result).toContain('IN ( 1, 2 )');
  });
});

// ---- operators.in.placeOpeningParenthesisOnNewLine / placeFirstValueOnNewLine ----

describe('operators.in.placeOpeningParenthesisOnNewLine and placeFirstValueOnNewLine', () => {
  const bothEnabled = {
    dml: { collapseShortStatements: false, collapseShortSubqueries: false },
    operators: { in: { placeOpeningParenthesisOnNewLine: true, placeFirstValueOnNewLine: 'always', addSpaceAroundInContents: false } },
  };
  const bothDisabled = {
    dml: { collapseShortStatements: false, collapseShortSubqueries: false },
    operators: { in: { placeOpeningParenthesisOnNewLine: false, placeFirstValueOnNewLine: 'never', addSpaceAroundInContents: false } },
  };
  const parenOnlyEnabled = {
    dml: { collapseShortStatements: false, collapseShortSubqueries: false },
    operators: { in: { placeOpeningParenthesisOnNewLine: true, placeFirstValueOnNewLine: 'never', addSpaceAroundInContents: false } },
  };
  const firstValueOnlyEnabled = {
    dml: { collapseShortStatements: false, collapseShortSubqueries: false },
    operators: { in: { placeOpeningParenthesisOnNewLine: false, placeFirstValueOnNewLine: 'always', addSpaceAroundInContents: false } },
  };

  it('both enabled: paren and values on new lines', () => {
    const result = formatSQL("SELECT a FROM t WHERE col IN ('a', 'b', 'c')", bothEnabled);
    expect(result).toContain("IN\n");
    expect(result).toContain("(\n");
    expect(result).toContain("'a', 'b', 'c'");
    expect(result).toContain("\n    )");
  });

  it('both disabled: stays inline', () => {
    const result = formatSQL("SELECT a FROM t WHERE col IN ('a', 'b', 'c')", bothDisabled);
    expect(result).toContain("IN ('a', 'b', 'c')");
  });

  it('NOT IN works with both enabled', () => {
    const result = formatSQL("SELECT a FROM t WHERE col NOT IN ('a', 'b')", bothEnabled);
    expect(result).toContain("NOT IN\n");
    expect(result).toContain("(\n");
    expect(result).toContain("'a', 'b'");
  });

  it('paren on new line only (values stay inline)', () => {
    const result = formatSQL("SELECT a FROM t WHERE col IN ('a', 'b')", parenOnlyEnabled);
    expect(result).toContain("IN\n");
    expect(result).toContain("('a', 'b')");
  });

  it('first value on new line only (paren stays inline)', () => {
    const result = formatSQL("SELECT a FROM t WHERE col IN ('a', 'b')", firstValueOnlyEnabled);
    expect(result).toContain("IN (");
    expect(result).toContain("(\n");
    expect(result).toContain("'a', 'b'");
    expect(result).toMatch(/\n\s+\)/);
  });
});

// ---- operators.comparison.align ----

describe('operators.comparison.align', () => {
  const alignOn = {
    dml: { collapseShortStatements: false, collapseShortSubqueries: false },
    operators: { comparison: { align: true, addSpacesAroundComparisonOperators: true, addSpacesAroundArithmeticOperators: true }, andOr: { placeOnNewLine: 'always', alignment: 'indented', placeBeforeCondition: true }, between: { placeOnNewLine: false, placeAndKeywordOnNewLine: false, andAlignment: 'toBetween' }, in: { placeOpeningParenthesisOnNewLine: false, openingParenthesisAlignment: 'indented', placeFirstValueOnNewLine: 'never', placeSubsequentValuesOnNewLines: 'never', addSpaceAroundInContents: false } },
  };
  const alignOff = {
    dml: { collapseShortStatements: false, collapseShortSubqueries: false },
    operators: { comparison: { align: false, addSpacesAroundComparisonOperators: true, addSpacesAroundArithmeticOperators: true }, andOr: { placeOnNewLine: 'always', alignment: 'indented', placeBeforeCondition: true }, between: { placeOnNewLine: false, placeAndKeywordOnNewLine: false, andAlignment: 'toBetween' }, in: { placeOpeningParenthesisOnNewLine: false, openingParenthesisAlignment: 'indented', placeFirstValueOnNewLine: 'never', placeSubsequentValuesOnNewLines: 'never', addSpaceAroundInContents: false } },
  };

  it('aligns = in WHERE with varying left-side widths', () => {
    const sql = 'SELECT a FROM dbo.t WHERE a.col = 1 AND a.column2 = 2 AND a.long_col_name3 = 3';
    const result = formatSQL(sql, alignOn);
    const lines = result.split('\n');
    // Find lines with = and check alignment
    const eqLines = lines.filter(l => l.includes(' = '));
    expect(eqLines.length).toBe(3);
    const eqPositions = eqLines.map(l => l.indexOf(' = '));
    // All = signs should be at the same column
    expect(eqPositions[0]).toBe(eqPositions[1]);
    expect(eqPositions[1]).toBe(eqPositions[2]);
  });

  it('aligns = in JOIN ON conditions', () => {
    const sql = 'SELECT a.x FROM dbo.table_one a INNER JOIN dbo.table_two b ON a.short_col = b.short_col AND a.medium_column = b.medium_column AND a.very_long_column_name = b.very_long_column_name';
    const result = formatSQL(sql, alignOn);
    const lines = result.split('\n');
    const eqLines = lines.filter(l => l.includes(' = '));
    expect(eqLines.length).toBe(3);
    const eqPositions = eqLines.map(l => l.indexOf(' = '));
    expect(eqPositions[0]).toBe(eqPositions[1]);
    expect(eqPositions[1]).toBe(eqPositions[2]);
  });

  it('does not align when disabled', () => {
    const sql = 'SELECT a FROM dbo.t WHERE a.col = 1 AND a.column2 = 2 AND a.long_col_name3 = 3';
    const result = formatSQL(sql, alignOff);
    const lines = result.split('\n');
    const eqLines = lines.filter(l => l.includes(' = '));
    expect(eqLines.length).toBe(3);
    const eqPositions = eqLines.map(l => l.indexOf(' = '));
    // Without alignment, the = signs should NOT all be at the same position
    // (the left-hand sides have different widths)
    expect(eqPositions[0] !== eqPositions[2] || eqPositions[1] !== eqPositions[2]).toBe(true);
  });

  it('does not fling the operator right when a wrapped function call is the left side', () => {
    const sql = "SELECT CASE WHEN COALESCE(t2.some_considerably_longer_column_name_here, t3.another_quite_long_column_name, '') = 'asdf' AND t.column3 = 'asdf asdf' THEN 'x' ELSE 'y' END AS c FROM t";
    const result = formatSQL(sql, {
      ...alignOn,
      whitespace: { wrapLongLines: true, wrapLinesLongerThan: 60 },
    });
    const lines = result.split('\n');
    // The COALESCE must wrap with no space before the paren and its args
    // indented beneath the call.
    expect(result).toContain('COALESCE(\n');
    expect(result).not.toContain('COALESCE (\n');
    // The short condition's operator must not be padded out to align with the
    // multi-line COALESCE — it sits one space after its own left side.
    const andLine = lines.find(l => /\bAND\b/.test(l) && l.includes('column3'))!;
    expect(andLine).toContain('t.column3 = ');
  });
});

// ---- assignment wrapping: keep `left = ` with an expandable right side ----

describe('assignment expression wrapping', () => {
  const wrap = { whitespace: { wrapLongLines: true, wrapLinesLongerThan: 60 } };

  it('keeps "@var = COALESCE(" together and expands the args instead of breaking before =', () => {
    const sql = "SELECT @my_long_variable_name_here = COALESCE(@my_long_variable_name_here, alias.fallback_column_value_xyz) FROM dbo.t AS [alias]";
    const result = formatSQL(sql, wrap);
    // The = stays on the same line as the variable and the call opens there.
    expect(result).toContain('@my_long_variable_name_here = COALESCE(');
    // It must NOT break before the operator, leaving "=" dangling at the
    // variable's indent.
    expect(result).not.toMatch(/@my_long_variable_name_here\n\s*= /);
  });

  it('keeps "SET @var = func(" together when the call expands', () => {
    const sql = "SET @my_long_variable_name_here = COALESCE(@my_long_variable_name_here, t.fallback_column_value_xyz, t.another_fallback_value)";
    const result = formatSQL(sql, wrap);
    expect(result).toContain('SET @my_long_variable_name_here = COALESCE(');
    expect(result).not.toMatch(/@my_long_variable_name_here\n\s*= /);
  });

  it('keeps "col = func(" together for a long WHERE comparison', () => {
    const sql = "SELECT a FROM t WHERE some_column_name_here = COALESCE(first_fallback_value_column, second_fallback_value_column_here)";
    const result = formatSQL(sql, wrap);
    expect(result).toContain('some_column_name_here = COALESCE(');
    expect(result).not.toMatch(/some_column_name_here\n\s*= /);
  });
});
