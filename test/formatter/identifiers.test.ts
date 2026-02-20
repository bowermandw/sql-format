import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- identifiers.encloseIdentifiers ----

describe('identifiers.encloseIdentifiers', () => {
  const withBrackets = {
    identifiers: { encloseIdentifiers: 'withBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: true },
  };
  const withoutBrackets = {
    identifiers: { encloseIdentifiers: 'withoutBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: true },
  };
  const asis = {
    identifiers: { encloseIdentifiers: 'asis', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: true },
  };

  describe('withBrackets', () => {
    it('adds brackets to column identifiers in SELECT', () => {
      const result = formatSQL('SELECT column1, column2 FROM dbo.table1', withBrackets);
      expect(result).toContain('[column1]');
      expect(result).toContain('[column2]');
    });

    it('adds brackets to table identifiers in FROM', () => {
      const result = formatSQL('SELECT a FROM dbo.table1', withBrackets);
      expect(result).toContain('[dbo].[table1]');
    });

    it('adds brackets to JOIN table identifiers', () => {
      const result = formatSQL('SELECT a.col FROM t1 a INNER JOIN t2 b ON a.id = b.id', withBrackets);
      expect(result).toContain('[t1]');
      expect(result).toContain('[t2]');
    });

    it('does NOT bracket SQL keywords', () => {
      const result = formatSQL('SELECT column1 FROM dbo.table1', withBrackets);
      expect(result).not.toContain('[SELECT]');
      expect(result).not.toContain('[FROM]');
    });

    it('does NOT bracket data types', () => {
      const result = formatSQL('DECLARE @x INT', withBrackets);
      expect(result).not.toContain('[INT]');
    });

    it('brackets aliases in SELECT', () => {
      const result = formatSQL('SELECT a AS col_alias FROM t', withBrackets);
      expect(result).toContain('[col_alias]');
    });

    it('brackets INSERT target table', () => {
      const result = formatSQL('INSERT INTO dbo.t1 (col1) VALUES (1)', withBrackets);
      expect(result).toContain('[dbo].[t1]');
      expect(result).toContain('[col1]');
    });

    it('brackets UPDATE target table and columns', () => {
      const result = formatSQL('UPDATE dbo.t1 SET col1 = 1 WHERE id = 1', withBrackets);
      expect(result).toContain('[dbo].[t1]');
      expect(result).toContain('[col1]');
      expect(result).toContain('[id]');
    });

    it('brackets DELETE target table', () => {
      const result = formatSQL('DELETE FROM dbo.t1 WHERE id = 1', withBrackets);
      expect(result).toContain('[dbo].[t1]');
      expect(result).toContain('[id]');
    });

    it('brackets CREATE TABLE name and column names', () => {
      const result = formatSQL('CREATE TABLE dbo.t (id INT, name VARCHAR(50))', withBrackets);
      expect(result).toContain('[dbo].[t]');
      expect(result).toContain('[id]');
      expect(result).toContain('[name]');
    });

    it('brackets CREATE TABLE constraint name and column references', () => {
      const result = formatSQL('CREATE TABLE dbo.t (id INT NOT NULL, CONSTRAINT pk_t PRIMARY KEY (id))', withBrackets);
      expect(result).toContain('[pk_t]');
      expect(result).toContain('PRIMARY KEY ([id])');
    });
  });

  describe('withoutBrackets', () => {
    it('strips brackets from column identifiers', () => {
      const result = formatSQL('SELECT [column1], [column2] FROM [dbo].[table1]', withoutBrackets);
      expect(result).not.toContain('[');
      expect(result).toContain('column1');
      expect(result).toContain('column2');
      expect(result).toContain('dbo.table1');
    });

    it('strips brackets from aliased identifiers', () => {
      const result = formatSQL('SELECT [a] AS [col_alias] FROM [t]', withoutBrackets);
      expect(result).not.toContain('[a]');
      expect(result).not.toContain('[col_alias]');
    });

    it('strips brackets from INSERT columns', () => {
      const result = formatSQL('INSERT INTO [dbo].[t1] ([col1]) VALUES (1)', withoutBrackets);
      expect(result).not.toContain('[dbo]');
      expect(result).not.toContain('[t1]');
      expect(result).not.toContain('[col1]');
    });
  });

  describe('asis', () => {
    it('preserves brackets when present', () => {
      const result = formatSQL('SELECT [column1], column2 FROM [dbo].table1', asis);
      expect(result).toContain('[column1]');
      expect(result).toContain('column2');
      expect(result).toContain('[dbo]');
    });

    it('does not add brackets to unbracketed identifiers', () => {
      const result = formatSQL('SELECT column1 FROM dbo.table1', asis);
      expect(result).not.toMatch(/\[column1\]/);
      expect(result).toContain('column1');
    });
  });
});

// ---- identifiers.alwaysBracketReservedWordIdentifiers ----

describe('identifiers.alwaysBracketReservedWordIdentifiers', () => {
  it('keeps brackets on reserved words when stripping brackets with alwaysBracketReservedWordIdentifiers=true', () => {
    const result = formatSQL('SELECT [user] FROM [t]', {
      identifiers: { encloseIdentifiers: 'withoutBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: true },
    });
    // 'user' is a reserved word so it should keep brackets
    expect(result).toContain('[user]');
    // 't' is not reserved so brackets removed
    expect(result).not.toContain('[t]');
  });

  it('strips brackets from reserved words when alwaysBracketReservedWordIdentifiers=false', () => {
    const result = formatSQL('SELECT [user] FROM [t]', {
      identifiers: { encloseIdentifiers: 'withoutBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: false },
    });
    expect(result).not.toContain('[');
  });
});

// ---- EXEC/EXECUTE identifier enclosure ----

describe('EXEC identifier enclosure', () => {
  const withBrackets = {
    identifiers: { encloseIdentifiers: 'withBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: true },
  };
  const withoutBrackets = {
    identifiers: { encloseIdentifiers: 'withoutBrackets', encloseIdentifiersScope: 'userDefined', alwaysBracketReservedWordIdentifiers: true },
  };

  it('adds brackets to EXEC proc name with withBrackets', () => {
    const result = formatSQL('EXEC dbo.myProc', withBrackets);
    expect(result.trim()).toBe('EXEC [dbo].[myProc]');
  });

  it('adds brackets to EXECUTE proc name with withBrackets', () => {
    const result = formatSQL('EXECUTE dbo.stored_proc_name', withBrackets);
    expect(result.trim()).toBe('EXECUTE [dbo].[stored_proc_name]');
  });

  it('strips brackets from EXEC proc name with withoutBrackets', () => {
    const result = formatSQL('EXECUTE [dbo].[stored_proc_name]', withoutBrackets);
    expect(result.trim()).toBe('EXECUTE dbo.stored_proc_name');
  });

  it('preserves params while bracketing proc name', () => {
    const result = formatSQL("EXEC dbo.myProc @p1 = 'val1', @p2 = 42", withBrackets);
    expect(result).toContain('[dbo].[myProc]');
    expect(result).toContain("@p1 = 'val1'");
  });
});
