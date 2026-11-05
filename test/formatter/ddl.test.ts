import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';
import { tokenize, attachComments } from '../../src/tokenizer';
import { parse } from '../../src/parser';

// ---- ddl.alignDataTypesAndConstraints ----

describe('ddl.alignDataTypesAndConstraints', () => {
  describe('CREATE TABLE', () => {
    it('aligns column data types when true', () => {
      const result = formatSQL('CREATE TABLE dbo.t (id INT, longcolumn VARCHAR(50))', {
        ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: true, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: false, collapseStatementsShorterThan: 78 },
      });
      expect(result).toContain('id         INT');
      expect(result).toContain('longcolumn VARCHAR(50)');
    });

    it('does not align column data types when false', () => {
      const result = formatSQL('CREATE TABLE dbo.t (id INT, longcolumn VARCHAR(50))', {
        ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: false, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: false, collapseStatementsShorterThan: 78 },
      });
      expect(result).toContain('id INT');
      expect(result).toContain('longcolumn VARCHAR(50)');
    });

    it('aligns multiple columns with varying name lengths', () => {
      const result = formatSQL('CREATE TABLE dbo.t (a INT, bb VARCHAR(50), ccc DATETIME)', {
        ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: true, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: false, collapseStatementsShorterThan: 78 },
      });
      // All data types should start at same column (aligned to longest name 'ccc')
      const lines = result.split('\n').filter(l => l.includes('INT') || l.includes('VARCHAR') || l.includes('DATETIME'));
      const typePositions = lines.map(l => {
        const match = l.match(/(INT|VARCHAR|DATETIME)/);
        return match ? l.indexOf(match[0]) : -1;
      });
      expect(new Set(typePositions).size).toBe(1);
    });
  });

  describe('CREATE PROCEDURE', () => {
    it('aligns proc param data types when true', () => {
      const result = formatSQL('CREATE PROCEDURE dbo.myProc (@a INT, @longname VARCHAR(50) = NULL) AS BEGIN SELECT 1 END', {
        ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: true, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
      });
      expect(result).toContain('@a        INT');
      expect(result).toContain('@longname VARCHAR(50)');
    });

    it('does not align proc params when false', () => {
      const result = formatSQL('CREATE PROCEDURE dbo.myProc (@a INT, @longname VARCHAR(50)) AS BEGIN SELECT 1 END', {
        ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: false, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
      });
      expect(result).toContain('@a INT');
      expect(result).toContain('@longname VARCHAR(50)');
    });
  });
});

// ---- CREATE TABLE with bracketed data types ----

describe('CREATE TABLE with bracketed data types', () => {
  // Default config has casing.builtInDataTypes = 'uppercase', so the datatype
  // name is recased even when bracketed (brackets and precision preserved).
  it('handles bracketed data types with precision', () => {
    const sql = 'CREATE TABLE #t ([column1] [varchar](50) NOT NULL, [column2] [varchar](50) NULL)';
    const result = formatSQL(sql);
    expect(result).toContain('[column1] [VARCHAR](50) NOT NULL');
    expect(result).toContain('[column2] [VARCHAR](50) NULL');
  });

  it('handles bracketed data types with scale', () => {
    const sql = 'CREATE TABLE #t ([col1] [decimal](10, 2) NOT NULL)';
    const result = formatSQL(sql);
    expect(result).toContain('[col1] [DECIMAL](10, 2) NOT NULL');
  });

  it('handles bracketed data types with MAX', () => {
    const sql = 'CREATE TABLE #t ([col1] [nvarchar](MAX) NULL)';
    const result = formatSQL(sql);
    expect(result).toContain('[col1] [NVARCHAR](MAX) NULL');
  });

  it('applies builtInDataTypes casing to bracketed data types', () => {
    const sql = 'CREATE TABLE #t ([a] [int] NOT NULL, [b] [varchar](50) NULL)';
    const upper = formatSQL(sql, { casing: { builtInDataTypes: 'uppercase' } });
    expect(upper).toContain('[a] [INT] NOT NULL');
    expect(upper).toContain('[b] [VARCHAR](50) NULL');

    const lower = formatSQL(sql, { casing: { builtInDataTypes: 'lowercase' } });
    expect(lower).toContain('[a] [int] NOT NULL');
    expect(lower).toContain('[b] [varchar](50) NULL');
  });

  it('strips brackets and cases data types with encloseDataTypes withoutBrackets', () => {
    const sql = 'CREATE TABLE #t ([a] [int], [b] [varchar](50))';
    const result = formatSQL(sql, {
      casing: { builtInDataTypes: 'uppercase' },
      dataTypes: { encloseDataTypes: 'withoutBrackets' },
    });
    expect(result).toContain('[a] INT');
    expect(result).toContain('[b] VARCHAR(50)');
  });

  it('preserves the case of user-defined (non-builtin) bracketed types', () => {
    const sql = 'CREATE TABLE #t ([a] [MyType] NOT NULL)';
    const result = formatSQL(sql, { casing: { builtInDataTypes: 'uppercase' } });
    expect(result).toContain('[a] [MyType] NOT NULL');
  });
});

// ---- ddl.collapseShortStatements for CREATE TABLE ----

describe('ddl.collapseShortStatements for CREATE TABLE', () => {
  const ddlConfig = {
    ddl: { collapseShortStatements: true, collapseStatementsShorterThan: 1000 },
  };

  it('collapses short CREATE TABLE to one line', () => {
    const result = formatSQL('CREATE TABLE dbo.t (id INT, name VARCHAR(50))', ddlConfig);
    expect(result.trim()).toBe('CREATE TABLE dbo.t (id INT, name VARCHAR(50))');
  });

  it('stays expanded when exceeding threshold', () => {
    const result = formatSQL('CREATE TABLE dbo.t (id INT, name VARCHAR(50))', {
      ddl: { collapseShortStatements: true, collapseStatementsShorterThan: 20 },
    });
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('stays expanded when collapse is disabled', () => {
    const result = formatSQL('CREATE TABLE dbo.t (id INT, name VARCHAR(50))', {
      ddl: { collapseShortStatements: false, collapseStatementsShorterThan: 1000 },
    });
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('collapses CREATE TABLE with constraints', () => {
    const result = formatSQL('CREATE TABLE dbo.t (id INT NOT NULL, name VARCHAR(50))', ddlConfig);
    expect(result.trim()).toBe('CREATE TABLE dbo.t (id INT NOT NULL, name VARCHAR(50))');
  });
});

// ---- ddl.placeFirstProcedureParameterOnNewLine ----

describe('ddl.placeFirstProcedureParameterOnNewLine', () => {
  it('always: parameters on new lines after proc name', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.p (@a INT, @b VARCHAR(20)) AS BEGIN SELECT 1 END', {
      ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: false, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
    });
    const lines = result.split('\n');
    const procLine = lines.find(l => l.includes('CREATE PROCEDURE'));
    // Proc name line should not contain parameter names
    expect(procLine).not.toContain('@a');
    expect(procLine).not.toContain('@b');
    // Parameters should be on separate indented lines
    expect(result).toContain('@a INT');
    expect(result).toContain('@b VARCHAR(20)');
  });

  it('never: parameters on same line as proc name', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.p (@a INT, @b VARCHAR(20)) AS BEGIN SELECT 1 END', {
      ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: false, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'never', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
    });
    const lines = result.split('\n');
    const procLine = lines.find(l => l.includes('CREATE PROCEDURE'));
    // Parameters should be on same line as proc name
    expect(procLine).toContain('@a INT');
    expect(procLine).toContain('@b VARCHAR(20)');
  });

  it('always with single parameter: still on new line', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.p (@a INT) AS BEGIN SELECT 1 END', {
      ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: false, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
    });
    const lines = result.split('\n');
    const procLine = lines.find(l => l.includes('CREATE PROCEDURE'));
    expect(procLine).not.toContain('@a');
  });

  it('ifSeveralItems: single param on same line', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.p (@a INT) AS BEGIN SELECT 1 END', {
      ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: false, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'ifSeveralItems', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
    });
    const lines = result.split('\n');
    const procLine = lines.find(l => l.includes('CREATE PROCEDURE'));
    // Single param should be on same line
    expect(procLine).toContain('@a INT');
  });

  it('ifSeveralItems: multiple params on new lines', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.p (@a INT, @b VARCHAR(20)) AS BEGIN SELECT 1 END', {
      ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: false, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'ifSeveralItems', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
    });
    const lines = result.split('\n');
    const procLine = lines.find(l => l.includes('CREATE PROCEDURE'));
    expect(procLine).not.toContain('@a');
  });
});

// ---- ALTER TABLE ----

describe('ALTER TABLE', () => {
  it('DROP CONSTRAINT', () => {
    const result = formatSQL('alter table dbo.Orders drop constraint FK_Orders_Customers');
    expect(result).toContain('ALTER TABLE dbo.Orders DROP CONSTRAINT FK_Orders_Customers');
  });

  it('ADD CONSTRAINT FOREIGN KEY with REFERENCES', () => {
    const result = formatSQL('alter table dbo.Orders add constraint FK_Orders_Customers foreign key (CustomerID) references dbo.Customers (CustomerID)');
    expect(result).toContain('ALTER TABLE dbo.Orders ADD CONSTRAINT FK_Orders_Customers FOREIGN KEY(CustomerID) REFERENCES dbo.Customers(CustomerID)');
  });

  it('ADD CONSTRAINT PRIMARY KEY', () => {
    const result = formatSQL('alter table dbo.Orders add constraint PK_Orders primary key (OrderID)');
    expect(result).toContain('ALTER TABLE dbo.Orders ADD CONSTRAINT PK_Orders PRIMARY KEY(OrderID)');
  });

  it('ADD CONSTRAINT UNIQUE', () => {
    const result = formatSQL('alter table dbo.t add constraint UQ_t_col unique (col)');
    expect(result).toContain('ALTER TABLE dbo.t ADD CONSTRAINT UQ_t_col UNIQUE(col)');
  });

  it('ADD CONSTRAINT CHECK', () => {
    const result = formatSQL('alter table dbo.t add constraint CK_t_val check (val > 0)');
    expect(result).toContain('ALTER TABLE dbo.t ADD CONSTRAINT CK_t_val CHECK(val > 0)');
  });

  it('ADD CONSTRAINT DEFAULT', () => {
    const result = formatSQL('alter table dbo.t add constraint DF_t_col default 0 for col');
    expect(result).toContain('ALTER TABLE dbo.t ADD CONSTRAINT DF_t_col DEFAULT 0 FOR col');
  });

  it('ADD column', () => {
    const result = formatSQL('alter table dbo.t add NewCol INT not null');
    expect(result).toContain('ALTER TABLE dbo.t ADD NewCol INT NOT NULL');
  });

  it('DROP COLUMN', () => {
    const result = formatSQL('alter table dbo.t drop column OldCol');
    expect(result).toContain('ALTER TABLE dbo.t DROP COLUMN OldCol');
  });

  it('ALTER COLUMN', () => {
    const result = formatSQL('alter table dbo.t alter column col VARCHAR(100) not null');
    expect(result).toContain('ALTER TABLE dbo.t ALTER COLUMN col VARCHAR(100) NOT NULL');
  });

  it('ENABLE TRIGGER', () => {
    const result = formatSQL('alter table dbo.t enable trigger TR_t');
    expect(result).toContain('ALTER TABLE dbo.t ENABLE TRIGGER TR_t');
  });

  it('DISABLE TRIGGER ALL', () => {
    const result = formatSQL('alter table dbo.t disable trigger all');
    expect(result).toContain('ALTER TABLE dbo.t DISABLE TRIGGER ALL');
  });

  it('WITH CHECK CHECK CONSTRAINT', () => {
    const result = formatSQL('alter table dbo.t with check check constraint FK_t_ref');
    expect(result).toContain('ALTER TABLE dbo.t WITH CHECK CHECK CONSTRAINT FK_t_ref');
  });

  it('NOCHECK CONSTRAINT ALL', () => {
    const result = formatSQL('alter table dbo.t nocheck constraint all');
    expect(result).toContain('ALTER TABLE dbo.t NOCHECK CONSTRAINT ALL');
  });

  it('parses as alterTable node type', () => {
    const tokens = attachComments(tokenize('ALTER TABLE dbo.t DROP COLUMN col'));
    const ast = parse(tokens);
    expect(ast.batches[0].statements[0].type).toBe('alterTable');
  });

  it('inserts semicolon when configured', () => {
    const result = formatSQL('alter table dbo.t drop column col', {
      whitespace: { insertSemicolons: 'insert' },
    });
    expect(result.trim()).toMatch(/;$/);
  });

  it('handles schema-qualified table names with brackets', () => {
    const result = formatSQL('alter table [dbo].[Orders] drop constraint [FK_Orders]');
    expect(result).toContain('ALTER TABLE [dbo].[Orders] DROP CONSTRAINT [FK_Orders]');
  });
});

// ---- COLLATE support ----

describe('COLLATE in column definitions', () => {
  it('CREATE TABLE with COLLATE on a column', () => {
    const result = formatSQL('CREATE TABLE dbo.t (col VARCHAR(50) COLLATE Latin1_General_CI_AS)');
    expect(result).toContain('COLLATE Latin1_General_CI_AS');
  });

  it('COLLATE with NOT NULL and DEFAULT preserves ordering', () => {
    const result = formatSQL('CREATE TABLE dbo.t (col VARCHAR(50) COLLATE Latin1_General_CI_AS NOT NULL DEFAULT \'abc\')');
    expect(result).toContain('COLLATE Latin1_General_CI_AS');
    expect(result).toContain('NOT NULL');
    expect(result).toContain('DEFAULT');
  });

  it('DECLARE table variable with COLLATE column', () => {
    const result = formatSQL('DECLARE @t TABLE (col VARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL)');
    expect(result).toContain('COLLATE SQL_Latin1_General_CP1_CI_AS');
    expect(result).toContain('NOT NULL');
  });

  it('applies keyword casing to COLLATE but not collation name', () => {
    const result = formatSQL('CREATE TABLE dbo.t (col VARCHAR(50) collate Latin1_General_CI_AS)', {
      casing: { reservedKeywords: 'uppercase' },
    });
    expect(result).toContain('COLLATE Latin1_General_CI_AS');
  });

  it('does not bracket collation name when encloseIdentifiers is withBrackets', () => {
    const result = formatSQL('CREATE TABLE dbo.t (col VARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL)', {
      identifiers: { encloseIdentifiers: 'withBrackets' },
    });
    expect(result).toContain('COLLATE SQL_Latin1_General_CP1_CI_AS');
    expect(result).not.toContain('[SQL_Latin1_General_CP1_CI_AS]');
  });
});

describe('named inline column constraints', () => {
  it('CONSTRAINT name + DEFAULT preserves name and is not split into a new column', () => {
    const result = formatSQL("CREATE TABLE dbo.t (col CHAR(1) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [df_name] DEFAULT ('Y'))");
    expect(result).toContain("CONSTRAINT [df_name] DEFAULT ('Y')");
    expect(result).not.toContain('MISSING_DATATYPE');
  });

  it('CONSTRAINT name + PRIMARY KEY', () => {
    const result = formatSQL('CREATE TABLE dbo.t (id INT NOT NULL CONSTRAINT [pk_t] PRIMARY KEY)');
    expect(result).toContain('CONSTRAINT [pk_t] PRIMARY KEY');
    expect(result).not.toContain('MISSING_DATATYPE');
  });

  it('CONSTRAINT name + CHECK', () => {
    const result = formatSQL('CREATE TABLE dbo.t (qty INT CONSTRAINT [ck_qty] CHECK (qty > 0))');
    expect(result).toContain('CONSTRAINT [ck_qty] CHECK (qty > 0)');
    expect(result).not.toContain('MISSING_DATATYPE');
  });
});

// ---- Comments in column definitions ----

describe('comments in CREATE TABLE / DECLARE TABLE column definitions', () => {
  it('preserves line comments before columns in CREATE TABLE', () => {
    const result = formatSQL('CREATE TABLE dbo.t (\n  -- primary key\n  id INT NOT NULL,\n  name VARCHAR(50)\n)');
    expect(result).toContain('-- primary key');
    expect(result).toContain('id INT NOT NULL');
  });

  it('preserves block comments before columns in CREATE TABLE', () => {
    const result = formatSQL('CREATE TABLE dbo.t (\n  /* the name */ name VARCHAR(50)\n)');
    expect(result).toContain('/* the name */');
    expect(result).toContain('name VARCHAR(50)');
  });

  it('preserves line comments before columns in DECLARE TABLE', () => {
    const result = formatSQL('DECLARE @t TABLE (\n  -- comment\n  id INT NOT NULL,\n  name VARCHAR(50)\n)');
    expect(result).toContain('-- comment');
    expect(result).toContain('id INT NOT NULL');
  });

  it('preserves block comments before columns in DECLARE TABLE', () => {
    const result = formatSQL('DECLARE @t TABLE (\n  /* block */ name VARCHAR(50)\n)');
    expect(result).toContain('/* block */');
    expect(result).toContain('name VARCHAR(50)');
  });
});

// ---- hyphenated names in name positions (parser re-joins lexer-split hyphens) ----

describe('hyphenated identifiers in name positions', () => {
  it('preserves a hyphenated procedure parameter name', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.Test\n  @A1_Param_-_Name_Total VARCHAR (30) = NULL\nAS\nBEGIN\n  SELECT 1\nEND');
    expect(result).toContain('@A1_Param_-_Name_Total VARCHAR(30) = NULL');
  });

  it('preserves a multi-hyphen column name', () => {
    const result = formatSQL('CREATE TABLE dbo.T (My-Col-Name INT, Normal INT)');
    expect(result).toContain('My-Col-Name INT');
  });

  it('still treats hyphens in expressions as subtraction', () => {
    const result = formatSQL('SELECT a-b, @x-@y FROM t WHERE c-1 > 0');
    expect(result).toContain('a - b');
    expect(result).toContain('@x - @y');
    expect(result).toContain('c - 1');
  });

  it('preserves a parameter name with a glued parenthesised segment', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.Test\n  @variable_(words_-_xx) VARCHAR (30) = NULL\nAS\nBEGIN\n  SELECT 1\nEND');
    expect(result).toContain('@variable_(words_-_xx) VARCHAR(30) = NULL');
  });

  it('does not absorb a real datatype precision into the parameter name', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.P (@x VARCHAR(30), @y INT) AS BEGIN SELECT 1 END');
    expect(result).toContain('@x VARCHAR(30)');
    expect(result).toContain('@y INT');
  });

  it('preserves a parameter name split across a number/word boundary', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.Test\n  @AS-2_OH VARCHAR (30) = NULL\nAS BEGIN SELECT 1 END');
    expect(result).toContain('@AS-2_OH VARCHAR(30) = NULL');
  });

  it('preserves a parameter name containing a slash', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.Test\n  @XX/YY_ABC_DEF VARCHAR (30) = NULL\nAS BEGIN SELECT 1 END');
    expect(result).toContain('@XX/YY_ABC_DEF VARCHAR(30) = NULL');
  });

  it('preserves a parameter name containing an ampersand', () => {
    const result = formatSQL('CREATE PROCEDURE dbo.Test\n  @XX_A&B_Word VARCHAR (30) = NULL\nAS BEGIN SELECT 1 END');
    expect(result).toContain('@XX_A&B_Word VARCHAR(30) = NULL');
  });
});

// ---- Table-level constraints: qualified references & inline indexes ----

describe('table constraint qualified names', () => {
  it('keeps schema-qualified REFERENCES target unspaced', () => {
    const result = formatSQL('CREATE TABLE dbo.t (id INT, CONSTRAINT fkname FOREIGN KEY (id) REFERENCES schema1.table1 (id))');
    expect(result).toContain('CONSTRAINT fkname FOREIGN KEY (id) REFERENCES schema1.table1 (id)');
    expect(result).not.toContain(' . ');
  });

  it('keeps three-part REFERENCES target unspaced', () => {
    const result = formatSQL('CREATE TABLE dbo.t (b INT, CONSTRAINT fk_t FOREIGN KEY (b) REFERENCES other.dbo.tbl (id) ON DELETE CASCADE)');
    expect(result).toContain('REFERENCES other.dbo.tbl (id) ON DELETE CASCADE');
  });

  it('keeps bracketed qualified REFERENCES target unspaced', () => {
    const result = formatSQL('CREATE TABLE dbo.t (id INT, FOREIGN KEY (id) REFERENCES [dbo].[Customers] (id))');
    expect(result).toContain('REFERENCES [dbo].[Customers] (id)');
  });

  it('does not glue a string literal ending in a period to the next keyword', () => {
    const result = formatSQL("CREATE TABLE dbo.t (msg VARCHAR(10), CONSTRAINT ck_msg CHECK (msg <> 'a.' AND msg <> 'b'))");
    expect(result).toContain("'a.' AND");
  });
});

describe('inline table indexes', () => {
  it('keeps INDEX name CLUSTERED (col) as a single constraint', () => {
    const result = formatSQL('CREATE TABLE dbo.t (id INT, INDEX ixname CLUSTERED (id))');
    expect(result).toContain('INDEX ixname CLUSTERED (id)');
    expect(result).not.toContain('INDEX ixname,');
  });

  it('keeps INDEX name NONCLUSTERED with a filter predicate together', () => {
    const result = formatSQL('CREATE TABLE dbo.t (b INT, INDEX ix_b NONCLUSTERED (b) WHERE b > 0)');
    expect(result).toContain('INDEX ix_b NONCLUSTERED (b) WHERE b > 0');
  });

  it('keeps an inline INDEX in a table variable declaration', () => {
    const result = formatSQL('DECLARE @v TABLE (id INT, INDEX ix (id))');
    expect(result).toContain('INDEX ix (id)');
    expect(result).not.toContain('INDEX ix,');
  });
});

// ---- DROP TABLE with multiple tables ----

describe('DROP TABLE with a list of tables', () => {
  it('keeps a comma-separated list on one line', () => {
    const result = formatSQL('DROP TABLE #tt1, #tt2;');
    expect(result.trim()).toBe('DROP TABLE #tt1, #tt2;');
  });

  it('brackets every table in the list', () => {
    const result = formatSQL('DROP TABLE #tt1, #tt2;', {
      identifiers: { encloseIdentifiers: 'withBrackets' },
    });
    expect(result.trim()).toBe('DROP TABLE [#tt1], [#tt2];');
  });

  it('brackets qualified names throughout the list', () => {
    const result = formatSQL('DROP TABLE dbo.t1, dbo.t2, [x].[y];', {
      identifiers: { encloseIdentifiers: 'withBrackets' },
    });
    expect(result.trim()).toBe('DROP TABLE [dbo].[t1], [dbo].[t2], [x].[y];');
  });

  it('handles a list after IF EXISTS', () => {
    const result = formatSQL('DROP TABLE IF EXISTS #a, #b;', {
      identifiers: { encloseIdentifiers: 'withBrackets' },
    });
    expect(result.trim()).toBe('DROP TABLE IF EXISTS [#a], [#b];');
  });

  it('strips brackets across the list when encloseIdentifiers is withoutBrackets', () => {
    const result = formatSQL('DROP TABLE [dbo].[t1], [dbo].[t2];', {
      identifiers: { encloseIdentifiers: 'withoutBrackets' },
    });
    expect(result.trim()).toBe('DROP TABLE dbo.t1, dbo.t2;');
  });

  it('does not leak list items onto their own lines', () => {
    const result = formatSQL('DROP TABLE #tt1, #tt2;');
    expect(result.trim().split('\n')).toHaveLength(1);
  });

  it('still formats a single table', () => {
    const result = formatSQL('DROP TABLE #tt1;', {
      identifiers: { encloseIdentifiers: 'withBrackets' },
    });
    expect(result.trim()).toBe('DROP TABLE [#tt1];');
  });

  it('keeps TRUNCATE TABLE working', () => {
    const result = formatSQL('TRUNCATE TABLE dbo.t1;', {
      identifiers: { encloseIdentifiers: 'withBrackets' },
    });
    expect(result.trim()).toBe('TRUNCATE TABLE [dbo].[t1];');
  });
});

// ---- CREATE VIEW / FUNCTION / TRIGGER ----

function parseFirst(sql: string): any {
  return parse(attachComments(tokenize(sql))).batches[0].statements[0];
}

describe('CREATE VIEW', () => {
  it('parses into a createView node instead of raw tokens', () => {
    const stmt = parseFirst('CREATE OR ALTER VIEW [dbo].[v] AS SELECT a FROM t');
    expect(stmt.type).toBe('createView');
    expect(stmt.body.type).toBe('select');
  });

  it('formats the SELECT body like a standalone statement', () => {
    const result = formatSQL('CREATE OR ALTER VIEW [dbo].[view_name] AS SELECT a.col1, a.col2, b.col3 FROM dbo.TableA a INNER JOIN dbo.TableB b ON a.id = b.id WHERE a.x = 1');
    expect(result).toBe([
      'CREATE OR ALTER VIEW [dbo].[view_name]',
      'AS',
      'SELECT a.col1,',
      '    a.col2,',
      '    b.col3',
      'FROM',
      '    dbo.TableA a',
      '    INNER JOIN dbo.TableB b',
      '        ON a.id = b.id',
      'WHERE',
      '    a.x = 1',
      '',
    ].join('\n'));
  });

  it('keeps column list, view attributes and WITH CHECK OPTION', () => {
    const result = formatSQL('create view dbo.v (c1, c2) with schemabinding, view_metadata as select a, b from dbo.t with check option');
    expect(result).toBe([
      'CREATE VIEW dbo.v (c1, c2)',
      'WITH SCHEMABINDING, VIEW_METADATA',
      'AS',
      'SELECT a, b FROM dbo.t',
      'WITH CHECK OPTION',
      '',
    ].join('\n'));
  });

  it('places the inserted semicolon after WITH CHECK OPTION', () => {
    const result = formatSQL('CREATE VIEW dbo.v AS SELECT a FROM dbo.t WITH CHECK OPTION', {
      whitespace: { insertSemicolons: 'insert' },
    });
    expect(result).toContain('WITH CHECK OPTION;');
    expect(result).not.toContain('dbo.t;');
  });

  it('supports a CTE body', () => {
    const stmt = parseFirst('CREATE VIEW dbo.v AS WITH c AS (SELECT id FROM t) SELECT id FROM c');
    expect(stmt.type).toBe('createView');
    expect(stmt.body.type).toBe('cte');
  });

  it('keeps a comment after AS', () => {
    const result = formatSQL('CREATE VIEW dbo.v AS -- note\nSELECT a FROM t');
    expect(result).toContain('AS -- note\nSELECT a FROM t');
  });

  it('terminates a preceding statement at ALTER VIEW', () => {
    const batch = parse(attachComments(tokenize('PRINT 1\nALTER VIEW dbo.v AS SELECT a FROM t'))).batches[0];
    expect(batch.statements.map((s: any) => s.type)).toEqual(['print', 'createView']);
  });
});

describe('CREATE FUNCTION', () => {
  it('formats a scalar function', () => {
    const result = formatSQL('CREATE OR ALTER FUNCTION dbo.f (@a INT, @b VARCHAR(20) = NULL) RETURNS INT WITH SCHEMABINDING AS BEGIN RETURN @a END');
    expect(result).toBe([
      'CREATE OR ALTER FUNCTION dbo.f',
      '(',
      '    @a INT,',
      '    @b VARCHAR(20) = NULL',
      ')',
      'RETURNS INT',
      'WITH SCHEMABINDING',
      'AS',
      'BEGIN',
      '    RETURN @a',
      'END',
      '',
    ].join('\n'));
  });

  it('formats an inline table-valued function with RETURN (SELECT ...)', () => {
    const stmt = parseFirst('CREATE FUNCTION dbo.f (@id INT) RETURNS TABLE AS RETURN (SELECT a FROM t WHERE id = @id)');
    expect(stmt.type).toBe('createFunction');
    expect(stmt.body.type).toBe('return');
    const result = formatSQL('CREATE FUNCTION dbo.f (@id INT) RETURNS TABLE AS RETURN (SELECT a FROM t WHERE id = @id)');
    expect(result).toContain('RETURNS TABLE\nAS\nRETURN (SELECT a FROM t WHERE id = @id)');
  });

  it('formats an inline TVF with an unparenthesised RETURN SELECT and no parameters', () => {
    const result = formatSQL('create function dbo.f() returns table as return select a from t');
    expect(result).toBe('CREATE FUNCTION dbo.f()\nRETURNS TABLE\nAS\nRETURN\nSELECT a FROM t\n');
  });

  it('formats a multi-statement TVF with its return table definition', () => {
    const result = formatSQL('CREATE FUNCTION dbo.f (@id INT) RETURNS @t TABLE (id INT NOT NULL, name VARCHAR(50)) AS BEGIN RETURN END');
    expect(result).toContain([
      'RETURNS @t TABLE',
      '(',
      '    id INT NOT NULL,',
      '    name VARCHAR(50)',
      ')',
      'AS',
      'BEGIN',
    ].join('\n'));
  });

  it('accepts a function without AS', () => {
    const stmt = parseFirst('CREATE FUNCTION dbo.f() RETURNS TABLE RETURN SELECT 1 AS x');
    expect(stmt.type).toBe('createFunction');
    expect(stmt.asToken).toBeUndefined();
  });
});

describe('CREATE TRIGGER', () => {
  it('formats a DML trigger with one clause per line', () => {
    const result = formatSQL('create or alter trigger dbo.trg on dbo.T after insert, update not for replication as begin set nocount on end');
    expect(result).toBe([
      'CREATE OR ALTER TRIGGER dbo.trg',
      'ON dbo.T',
      'AFTER INSERT, UPDATE',
      'NOT FOR REPLICATION',
      'AS',
      'BEGIN',
      '    SET NOCOUNT ON',
      'END',
      '',
    ].join('\n'));
  });

  it('formats INSTEAD OF triggers', () => {
    const result = formatSQL('CREATE TRIGGER dbo.trg ON dbo.v INSTEAD OF DELETE AS BEGIN PRINT 1 END');
    expect(result).toContain('ON dbo.v\nINSTEAD OF DELETE\nAS\n');
  });

  it('formats a DDL trigger with EXECUTE AS (not mistaken for the body AS)', () => {
    const result = formatSQL("CREATE TRIGGER trg ON DATABASE WITH EXECUTE AS 'dbo' FOR CREATE_TABLE, ALTER_TABLE AS BEGIN PRINT 'x' END");
    expect(result).toContain("ON DATABASE\nWITH EXECUTE AS 'dbo'\nFOR CREATE_TABLE, ALTER_TABLE\nAS\nBEGIN");
  });

  it('formats ON ALL SERVER', () => {
    const result = formatSQL('CREATE TRIGGER trg ON ALL SERVER FOR LOGON AS BEGIN PRINT 1 END');
    expect(result).toContain('ON ALL SERVER\nFOR LOGON\nAS\n');
  });
});
