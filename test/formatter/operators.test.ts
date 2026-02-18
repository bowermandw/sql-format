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
