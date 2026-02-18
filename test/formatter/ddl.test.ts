import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- ddl.alignDataTypesAndConstraints ----

describe('ddl.alignDataTypesAndConstraints', () => {
  describe('CREATE TABLE', () => {
    it('aligns column data types when true', () => {
      const result = formatSQL('CREATE TABLE dbo.t (id INT, longcolumn VARCHAR(50))', {
        ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: true, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
      });
      expect(result).toContain('id         INT');
      expect(result).toContain('longcolumn VARCHAR(50)');
    });

    it('does not align column data types when false', () => {
      const result = formatSQL('CREATE TABLE dbo.t (id INT, longcolumn VARCHAR(50))', {
        ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: false, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
      });
      expect(result).toContain('id INT');
      expect(result).toContain('longcolumn VARCHAR(50)');
    });

    it('aligns multiple columns with varying name lengths', () => {
      const result = formatSQL('CREATE TABLE dbo.t (a INT, bb VARCHAR(50), ccc DATETIME)', {
        ddl: { parenthesisStyle: 'expandedToStatement', indentParenthesesContents: true, alignDataTypesAndConstraints: true, placeConstraintsOnNewLines: true, placeConstraintColumnsOnNewLines: 'always', indentClauses: true, placeFirstProcedureParameterOnNewLine: 'always', collapseShortStatements: true, collapseStatementsShorterThan: 78 },
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
