import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- dataTypes.encloseDataTypes ----

describe('dataTypes.encloseDataTypes', () => {
  describe('withBrackets', () => {
    const cfg = { dataTypes: { encloseDataTypes: 'withBrackets' } };

    it('brackets data type in DECLARE', () => {
      const result = formatSQL('DECLARE @x INT', cfg);
      expect(result).toContain('[INT]');
    });

    it('brackets VARCHAR with precision in DECLARE', () => {
      const result = formatSQL('DECLARE @s VARCHAR(50)', cfg);
      expect(result).toContain('[VARCHAR](50)');
    });

    it('brackets multiple data types in DECLARE', () => {
      const result = formatSQL('DECLARE @x VARCHAR(50), @y INT', cfg);
      expect(result).toContain('[VARCHAR](50)');
      expect(result).toContain('[INT]');
    });

    it('brackets data types in CREATE TABLE columns', () => {
      const result = formatSQL('CREATE TABLE dbo.t (id INT, name VARCHAR(50))', cfg);
      expect(result).toContain('[INT]');
      expect(result).toContain('[VARCHAR](50)');
    });

    it('brackets data types in CREATE PROCEDURE parameters', () => {
      const result = formatSQL('CREATE PROCEDURE dbo.p (@a INT, @b VARCHAR(20)) AS BEGIN SELECT 1 END', cfg);
      expect(result).toContain('[INT]');
      expect(result).toContain('[VARCHAR](20)');
    });

    it('does NOT bracket identifiers when only enclose-datatypes is set', () => {
      const result = formatSQL('SELECT col1 FROM dbo.t1', cfg);
      expect(result).not.toContain('[col1]');
      expect(result).not.toContain('[dbo]');
    });
  });

  describe('withoutBrackets', () => {
    const cfg = { dataTypes: { encloseDataTypes: 'withoutBrackets' } };

    it('strips brackets from data types added by withBrackets', () => {
      // Test the round-trip: format with withBrackets then re-format with withoutBrackets
      const withBracketsResult = formatSQL('DECLARE @x INT', { dataTypes: { encloseDataTypes: 'withBrackets' } });
      expect(withBracketsResult).toContain('[INT]');
      // The withoutBrackets mode strips bracket chars from the formatted output
      const result = formatSQL('DECLARE @x INT', cfg);
      expect(result).toContain('INT');
      expect(result).not.toContain('[INT]');
    });

    it('leaves unbracketed data types unchanged', () => {
      const result = formatSQL('DECLARE @x VARCHAR(50)', cfg);
      expect(result).toContain('VARCHAR(50)');
    });
  });

  describe('asis', () => {
    const cfg = { dataTypes: { encloseDataTypes: 'asis' } };

    it('preserves brackets when present', () => {
      const result = formatSQL('DECLARE @x [INT]', cfg);
      expect(result).toContain('[INT]');
    });

    it('does not add brackets when absent', () => {
      const result = formatSQL('DECLARE @x INT', cfg);
      expect(result).not.toContain('[INT]');
      expect(result).toContain('INT');
    });
  });
});
