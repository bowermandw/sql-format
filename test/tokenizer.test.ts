import { describe, it, expect } from 'vitest';
import { tokenize, attachComments } from '../src/tokenizer';
import { TokenType } from '../src/tokens';

describe('tokenizer', () => {
  it('tokenizes simple SELECT statement', () => {
    const tokens = tokenize('SELECT 1');
    const types = tokens.map(t => t.type);
    expect(types).toContain(TokenType.Word);
    expect(types).toContain(TokenType.NumberLiteral);
    expect(types[types.length - 1]).toBe(TokenType.EOF);
  });

  it('tokenizes string literals', () => {
    const tokens = tokenize("'hello world'");
    expect(tokens[0].type).toBe(TokenType.StringLiteral);
    expect(tokens[0].value).toBe("'hello world'");
  });

  it('handles escaped quotes in strings', () => {
    const tokens = tokenize("'it''s'");
    expect(tokens[0].type).toBe(TokenType.StringLiteral);
    expect(tokens[0].value).toBe("'it''s'");
  });

  it('tokenizes N-prefixed unicode strings', () => {
    const tokens = tokenize("N'unicode'");
    expect(tokens[0].type).toBe(TokenType.StringLiteral);
    expect(tokens[0].value).toBe("N'unicode'");
  });

  it('tokenizes bracketed identifiers', () => {
    const tokens = tokenize('[my column]');
    expect(tokens[0].type).toBe(TokenType.QuotedIdentifier);
    expect(tokens[0].value).toBe('[my column]');
  });

  it('tokenizes double-quoted identifiers', () => {
    const tokens = tokenize('"my column"');
    expect(tokens[0].type).toBe(TokenType.QuotedIdentifier);
    expect(tokens[0].value).toBe('"my column"');
  });

  it('tokenizes number literals', () => {
    const tokens = tokenize('123 45.67 0xFF');
    const nums = tokens.filter(t => t.type === TokenType.NumberLiteral);
    expect(nums).toHaveLength(3);
    expect(nums[0].value).toBe('123');
    expect(nums[1].value).toBe('45.67');
    expect(nums[2].value).toBe('0xFF');
  });

  it('tokenizes operators', () => {
    const tokens = tokenize('a <= b <> c != d');
    const ops = tokens.filter(t => t.type === TokenType.Operator);
    expect(ops.map(o => o.value)).toEqual(['<=', '<>', '!=']);
  });

  it('tokenizes multi-char assignment operators', () => {
    const tokens = tokenize('+= -=');
    const ops = tokens.filter(t => t.type === TokenType.Operator);
    expect(ops.map(o => o.value)).toEqual(['+=', '-=']);
  });

  it('tokenizes equals sign', () => {
    const tokens = tokenize('a = b');
    const eq = tokens.find(t => t.type === TokenType.Equals);
    expect(eq).toBeDefined();
    expect(eq!.value).toBe('=');
  });

  it('tokenizes symbols', () => {
    const tokens = tokenize('(a, b);');
    const types = tokens.filter(t => t.type !== TokenType.Whitespace && t.type !== TokenType.Word && t.type !== TokenType.EOF);
    expect(types.map(t => t.type)).toEqual([
      TokenType.LeftParen, TokenType.Comma, TokenType.RightParen, TokenType.Semicolon
    ]);
  });

  it('tokenizes dot operator', () => {
    const tokens = tokenize('dbo.table1');
    expect(tokens[1].type).toBe(TokenType.Dot);
  });

  it('tokenizes line comments', () => {
    const tokens = tokenize('-- this is a comment\nSELECT');
    expect(tokens[0].type).toBe(TokenType.LineComment);
    expect(tokens[0].value).toBe('-- this is a comment');
  });

  it('tokenizes block comments', () => {
    const tokens = tokenize('/* block comment */ SELECT');
    expect(tokens[0].type).toBe(TokenType.BlockComment);
    expect(tokens[0].value).toBe('/* block comment */');
  });

  it('handles nested block comments', () => {
    const tokens = tokenize('/* outer /* inner */ outer */');
    expect(tokens[0].type).toBe(TokenType.BlockComment);
    expect(tokens[0].value).toBe('/* outer /* inner */ outer */');
  });

  it('tokenizes @variables', () => {
    const tokens = tokenize('@my_var @@rowcount');
    const words = tokens.filter(t => t.type === TokenType.Word);
    expect(words[0].value).toBe('@my_var');
    expect(words[1].value).toBe('@@rowcount');
  });

  it('tokenizes GO as batch separator', () => {
    const tokens = tokenize('SELECT 1\nGO\n');
    const batchSep = tokens.find(t => t.type === TokenType.BatchSeparator);
    expect(batchSep).toBeDefined();
    expect(batchSep!.value.toUpperCase()).toBe('GO');
  });

  it('does not treat GO in middle of line as batch separator', () => {
    const tokens = tokenize('SELECT GO FROM');
    const batchSep = tokens.find(t => t.type === TokenType.BatchSeparator);
    expect(batchSep).toBeUndefined();
  });

  it('tracks line and column numbers', () => {
    const tokens = tokenize('SELECT\n  1');
    expect(tokens[0].line).toBe(1);
    expect(tokens[0].col).toBe(1);
    const num = tokens.find(t => t.type === TokenType.NumberLiteral);
    expect(num!.line).toBe(2);
    expect(num!.col).toBe(3);
  });

  it('tokenizes temp tables with #', () => {
    const tokens = tokenize('#temp ##global_temp');
    const words = tokens.filter(t => t.type === TokenType.Word);
    expect(words[0].value).toBe('#temp');
    expect(words[1].value).toBe('##global_temp');
  });
});

describe('attachComments', () => {
  it('strips whitespace and attaches leading comments', () => {
    const raw = tokenize('-- comment\nSELECT 1');
    const clean = attachComments(raw);
    // The first non-comment token should be SELECT with leading comment
    const select = clean.find(t => t.value.toUpperCase() === 'SELECT');
    expect(select).toBeDefined();
    expect(select!.leadingComments).toHaveLength(1);
    expect(select!.leadingComments![0].value).toBe('-- comment');
  });

  it('attaches trailing comment to previous token', () => {
    const raw = tokenize('SELECT 1 -- inline comment');
    const clean = attachComments(raw);
    const one = clean.find(t => t.value === '1');
    expect(one).toBeDefined();
    expect(one!.trailingComment).toBeDefined();
    expect(one!.trailingComment!.value).toBe('-- inline comment');
  });

  it('removes all whitespace tokens', () => {
    const raw = tokenize('SELECT   1');
    const clean = attachComments(raw);
    const ws = clean.find(t => t.type === TokenType.Whitespace);
    expect(ws).toBeUndefined();
  });
});
