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
