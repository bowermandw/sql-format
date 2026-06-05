import { describe, it, expect } from 'vitest';
import { formatSql, mergeConfig, DEFAULT_CONFIG } from '../src/api';
import { formatSQL } from './helpers';

describe('formatSql', () => {
  it('formats a simple statement with default config', () => {
    expect(formatSql('select a, b from t')).toBe(formatSQL('select a, b from t'));
  });

  it('matches the full pipeline output for a JOIN', () => {
    const sql = 'SELECT a.col1, b.col2 FROM dbo.t1 a INNER JOIN dbo.t2 b ON a.id = b.id';
    expect(formatSql(sql)).toBe(formatSQL(sql));
  });

  it('applies partial config overrides', () => {
    const sql = 'select a from t';
    const lower = formatSql(sql, { casing: { reservedKeywords: 'lowercase' } as any });
    const upper = formatSql(sql, { casing: { reservedKeywords: 'uppercase' } as any });
    expect(lower).toContain('select');
    expect(upper).toContain('SELECT');
  });

  it('accepts a full config and is idempotent with merge', () => {
    const sql = 'select a from t';
    expect(formatSql(sql, DEFAULT_CONFIG)).toBe(formatSql(sql));
  });
});

describe('mergeConfig', () => {
  it('returns defaults when given nothing', () => {
    expect(mergeConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('deep-merges overrides without dropping sibling defaults', () => {
    const merged = mergeConfig({ casing: { reservedKeywords: 'lowercase' } as any });
    expect(merged.casing.reservedKeywords).toBe('lowercase');
    // sibling default preserved
    expect(merged.casing.builtInFunctions).toBe(DEFAULT_CONFIG.casing.builtInFunctions);
    // unrelated section preserved
    expect(merged.whitespace.numberOfSpacesInTab).toBe(DEFAULT_CONFIG.whitespace.numberOfSpacesInTab);
  });

  it('normalizes the legacy flat placeCommasBeforeItems field', () => {
    const merged = mergeConfig({ lists: { placeCommasBeforeItems: true } as any });
    expect(merged.lists.commas.placeCommasBeforeItems).toBe(true);
  });
});
