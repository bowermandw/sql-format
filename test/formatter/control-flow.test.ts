import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

// ---- controlFlow.collapseShortStatements + collapseStatementsShorterThan ----

describe('controlFlow.collapseShortStatements', () => {
  const collapseOn = {
    controlFlow: { placeBeginKeywordOnNewLine: true, indentBeginEndKeywords: false, indentContentsOfStatements: true, collapseShortStatements: true, collapseStatementsShorterThan: 78 },
  };
  const collapseOff = {
    controlFlow: { placeBeginKeywordOnNewLine: true, indentBeginEndKeywords: false, indentContentsOfStatements: true, collapseShortStatements: false, collapseStatementsShorterThan: 78 },
  };

  it('collapses short IF/ELSE to one line', () => {
    const result = formatSQL("IF @x > 0 PRINT 'yes' ELSE PRINT 'no'", collapseOn);
    expect(result.trim().split('\n').length).toBe(1);
    expect(result).toContain('IF');
    expect(result).toContain('ELSE');
  });

  it('expands IF/ELSE when collapse disabled', () => {
    const result = formatSQL("IF @x > 0 PRINT 'yes' ELSE PRINT 'no'", collapseOff);
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('collapses short IF-only (no ELSE)', () => {
    const result = formatSQL("IF @x > 0 PRINT 'yes'", collapseOn);
    expect(result.trim().split('\n').length).toBe(1);
    expect(result.trim()).toContain("IF @x > 0 PRINT 'yes'");
  });

  it('expands long IF when exceeding threshold', () => {
    const result = formatSQL("IF @some_very_long_variable_name > 0 PRINT 'this is a very long print statement that goes beyond threshold'", {
      controlFlow: { placeBeginKeywordOnNewLine: true, indentBeginEndKeywords: false, indentContentsOfStatements: true, collapseShortStatements: true, collapseStatementsShorterThan: 40 },
    });
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('collapses short WHILE to one line', () => {
    const result = formatSQL('WHILE @i < 10 SET @i = @i + 1', collapseOn);
    expect(result.trim().split('\n').length).toBe(1);
  });

  it('expands WHILE when collapse disabled', () => {
    const result = formatSQL('WHILE @i < 10 SET @i = @i + 1', collapseOff);
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('does not collapse IF with BEGIN/END body (always multi-line)', () => {
    const result = formatSQL('IF @x > 0 BEGIN SELECT 1 END ELSE BEGIN SELECT 2 END', collapseOff);
    const lines = result.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(result).toContain('BEGIN');
    expect(result).toContain('END');
  });

  it('nested IF inside BEGIN/END: inner IF can collapse', () => {
    const result = formatSQL("BEGIN\nIF @x > 0 PRINT 'yes'\nEND", collapseOn);
    // The inner IF should be collapsed
    const lines = result.trim().split('\n');
    const ifLine = lines.find(l => l.includes('IF'));
    expect(ifLine).toBeDefined();
    expect(ifLine).toContain("PRINT 'yes'");
  });
});

// ---- THROW ----

describe('THROW statement', () => {
  it('formats THROW with error number, message, and state', () => {
    const result = formatSQL("THROW 51000, 'The record does not exist.', 1");
    expect(result.trim()).toBe("THROW 51000, 'The record does not exist.', 1");
  });

  it('formats bare THROW (re-throw in CATCH)', () => {
    const result = formatSQL('THROW');
    expect(result.trim()).toBe('THROW');
  });

  it('formats THROW with variables', () => {
    const result = formatSQL('THROW @errno, @msg, @state');
    expect(result.trim()).toBe('THROW @errno, @msg, @state');
  });

  it('formats THROW inside BEGIN/CATCH block', () => {
    const result = formatSQL('BEGIN CATCH\nTHROW;\nEND CATCH');
    expect(result).toContain('THROW');
  });

  it('applies keyword casing to THROW', () => {
    const result = formatSQL('throw 50000, \'Error\', 1', {
      casing: { reservedKeywords: 'uppercase' },
    });
    expect(result).toContain('THROW');
  });

  it('inserts semicolon when insertSemicolons is enabled', () => {
    const result = formatSQL("THROW 51000, 'Error', 1", {
      whitespace: { insertSemicolons: 'insert' },
    });
    expect(result.trim()).toBe("THROW 51000, 'Error', 1;");
  });
});

// ---- RAISERROR ----

describe('RAISERROR statement', () => {
  it('formats basic RAISERROR', () => {
    const result = formatSQL("RAISERROR ('Error message', 16, 1)");
    expect(result.trim()).toBe("RAISERROR ('Error message', 16, 1)");
  });

  it('formats RAISERROR with variables', () => {
    const result = formatSQL('RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState)');
    expect(result.trim()).toBe('RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState)');
  });

  it('formats RAISERROR with WITH NOWAIT', () => {
    const result = formatSQL("RAISERROR ('Error', 16, 1) WITH NOWAIT");
    expect(result.trim()).toBe("RAISERROR ('Error', 16, 1) WITH NOWAIT");
  });

  it('formats RAISERROR with WITH LOG', () => {
    const result = formatSQL("RAISERROR ('Error', 20, 1) WITH LOG");
    expect(result.trim()).toBe("RAISERROR ('Error', 20, 1) WITH LOG");
  });

  it('formats RAISERROR with multiple WITH options', () => {
    const result = formatSQL("RAISERROR ('Error', 20, 1) WITH LOG, SETERROR");
    expect(result.trim()).toBe("RAISERROR ('Error', 20, 1) WITH LOG, SETERROR");
  });

  it('formats RAISERROR with substitution parameters', () => {
    const result = formatSQL("RAISERROR (N'This is message %s %d.', 10, 1, N'number', 5)");
    expect(result.trim()).toBe("RAISERROR (N'This is message %s %d.', 10, 1, N'number', 5)");
  });

  it('formats RAISERROR with msg_id', () => {
    const result = formatSQL('RAISERROR (50005, 10, 1, N\'abcde\')');
    expect(result.trim()).toBe("RAISERROR (50005, 10, 1, N'abcde')");
  });

  it('applies keyword casing to RAISERROR', () => {
    const result = formatSQL("raiserror ('Error', 16, 1)", {
      casing: { reservedKeywords: 'uppercase' },
    });
    expect(result).toContain('RAISERROR');
  });

  it('inserts semicolon when insertSemicolons is enabled', () => {
    const result = formatSQL("RAISERROR ('Error', 16, 1) WITH NOWAIT", {
      whitespace: { insertSemicolons: 'insert' },
    });
    expect(result.trim()).toBe("RAISERROR ('Error', 16, 1) WITH NOWAIT;");
  });
});

// ---- TRY...CATCH ----

describe('TRY...CATCH statement', () => {
  it('formats basic TRY...CATCH', () => {
    const result = formatSQL('BEGIN TRY SELECT 1 / 0 END TRY BEGIN CATCH SELECT ERROR_MESSAGE() END CATCH');
    const lines = result.trim().split('\n');
    expect(lines[0]).toBe('BEGIN TRY');
    expect(lines[1]).toContain('SELECT 1 / 0');
    expect(lines[2]).toBe('END TRY');
    expect(lines[3]).toBe('BEGIN CATCH');
    expect(lines[4]).toContain('SELECT ERROR_MESSAGE()');
    expect(lines[5]).toBe('END CATCH');
  });

  it('indents statements inside TRY and CATCH blocks', () => {
    const result = formatSQL('BEGIN TRY\nSELECT 1\nEND TRY\nBEGIN CATCH\nSELECT 2\nEND CATCH');
    const lines = result.trim().split('\n');
    // Statements should be indented relative to BEGIN TRY / BEGIN CATCH
    expect(lines[1]).toMatch(/^\s{4}SELECT/);
    expect(lines[4]).toMatch(/^\s{4}SELECT/);
  });

  it('formats TRY...CATCH with multiple statements', () => {
    const sql = `BEGIN TRY
INSERT dbo.t1 (id) VALUES (1)
INSERT dbo.t1 (id) VALUES (2)
END TRY
BEGIN CATCH
PRINT 'Error'
THROW
END CATCH`;
    const result = formatSQL(sql);
    expect(result).toContain('BEGIN TRY');
    expect(result).toContain('END TRY');
    expect(result).toContain('BEGIN CATCH');
    expect(result).toContain('END CATCH');
    expect(result).toContain('THROW');
  });

  it('formats nested TRY...CATCH', () => {
    const sql = `BEGIN TRY
BEGIN TRY
SELECT 1 / 0
END TRY
BEGIN CATCH
SELECT 'inner'
END CATCH
END TRY
BEGIN CATCH
SELECT 'outer'
END CATCH`;
    const result = formatSQL(sql);
    // Should have both inner and outer BEGIN TRY / END TRY / BEGIN CATCH / END CATCH
    const matches = result.match(/BEGIN TRY/g);
    expect(matches).toHaveLength(2);
    const catchMatches = result.match(/END CATCH/g);
    expect(catchMatches).toHaveLength(2);
  });

  it('applies keyword casing to TRY and CATCH', () => {
    const result = formatSQL('begin try select 1 end try begin catch select 2 end catch', {
      casing: { reservedKeywords: 'uppercase' },
    });
    expect(result).toContain('BEGIN TRY');
    expect(result).toContain('END TRY');
    expect(result).toContain('BEGIN CATCH');
    expect(result).toContain('END CATCH');
  });

  it('applies lowercase casing to TRY and CATCH', () => {
    const result = formatSQL('BEGIN TRY SELECT 1 END TRY BEGIN CATCH SELECT 2 END CATCH', {
      casing: { reservedKeywords: 'lowercase' },
    });
    expect(result).toContain('begin try');
    expect(result).toContain('end try');
    expect(result).toContain('begin catch');
    expect(result).toContain('end catch');
  });

  it('formats TRY...CATCH with RAISERROR in CATCH block', () => {
    const sql = `BEGIN TRY
SELECT 1 / 0
END TRY
BEGIN CATCH
RAISERROR ('Error occurred', 16, 1)
END CATCH`;
    const result = formatSQL(sql);
    expect(result).toContain('BEGIN TRY');
    expect(result).toContain('RAISERROR');
    expect(result).toContain('END CATCH');
  });

  it('formats empty CATCH block', () => {
    const result = formatSQL('BEGIN TRY SELECT 1 END TRY BEGIN CATCH END CATCH');
    expect(result).toContain('BEGIN TRY');
    expect(result).toContain('END TRY');
    expect(result).toContain('BEGIN CATCH');
    expect(result).toContain('END CATCH');
  });

  it('preserves semicolons in TRY...CATCH', () => {
    const result = formatSQL('BEGIN TRY SELECT 1; END TRY BEGIN CATCH SELECT 2; END CATCH', {
      whitespace: { insertSemicolons: 'insert' },
    });
    expect(result).toContain('SELECT 1;');
    expect(result).toContain('SELECT 2;');
  });
});

// ---- Comments before END ----

describe('comments before END keyword', () => {
  it('preserves comments before END in BEGIN/END block', () => {
    const sql = 'BEGIN\nSELECT 1\n-- comment before end\nEND';
    const result = formatSQL(sql);
    expect(result).toContain('-- comment before end');
    expect(result).toContain('END');
  });

  it('preserves blank line before comments before END', () => {
    const sql = 'BEGIN\nSELECT 1\n\n-- comment 1\n-- comment 2\nEND';
    const result = formatSQL(sql);
    expect(result).toContain('-- comment 1');
    expect(result).toContain('-- comment 2');
    // Blank line should be preserved before the comments
    const lines = result.split('\n');
    const selectIdx = lines.findIndex(l => l.includes('SELECT'));
    const commentIdx = lines.findIndex(l => l.includes('-- comment 1'));
    expect(lines[selectIdx + 1]).toBe('');
    expect(commentIdx).toBe(selectIdx + 2);
  });
});

// ---- EXISTS subquery formatting ----

describe('EXISTS subquery formatting', () => {
  it('collapses a short IF EXISTS subquery onto one line', () => {
    const sql = "IF EXISTS ( SELECT 1 FROM dbo.some_table WHERE table_id = @variable ) BEGIN PRINT 'found' END";
    const result = formatSQL(sql);
    expect(result).toContain('IF EXISTS (SELECT 1 FROM dbo.some_table WHERE table_id = @variable)');
  });

  it('expands a long IF EXISTS subquery indented inside the parentheses', () => {
    const sql = "IF EXISTS ( SELECT col1, col2, col3, col4 FROM dbo.some_table WHERE table_id = @variable AND status = 'active' AND created_date > @startdate ) BEGIN PRINT 'found' END";
    const result = formatSQL(sql);
    const lines = result.split('\n');
    // Opening paren stays on the IF line, SELECT starts on its own indented line
    expect(lines[0]).toBe('IF EXISTS (');
    expect(lines[1]).toBe('    SELECT col1,');
    // Inner clauses are indented one level deeper than the IF
    expect(result).toContain('\n    FROM\n');
    expect(result).toContain('\n    WHERE\n');
    // Closing paren sits on its own line at the IF's indent
    expect(result).toContain('\n)\nBEGIN');
  });

  it('expands a long WHERE NOT EXISTS subquery at the correct indent', () => {
    const sql = "SELECT a FROM t1 WHERE NOT EXISTS ( SELECT col1, col2, col3, col4 FROM dbo.some_table WHERE table_id = @variable AND status = 'active' AND created_date > @startdate );";
    const result = formatSQL(sql);
    expect(result).toContain('    NOT EXISTS (');
    // Inner SELECT is indented two levels (WHERE clause + subquery)
    expect(result).toContain('\n        SELECT col1,');
    // Closing paren aligns with the NOT EXISTS clause indent
    expect(result).toContain('\n    );');
  });
});

// ---- Transaction statements ----

describe('transaction statements', () => {
  it('formats BEGIN TRAN without opening a BEGIN...END block', () => {
    const result = formatSQL('begin tran\nupdate t set a = 1\ncommit tran');
    expect(result.trimEnd()).toBe('BEGIN TRAN\nUPDATE t SET a = 1\nCOMMIT TRAN');
  });

  it('formats BEGIN TRANSACTION / ROLLBACK TRANSACTION', () => {
    const result = formatSQL('begin transaction\ndelete from t\nrollback transaction');
    expect(result.trimEnd()).toBe('BEGIN TRANSACTION\nDELETE FROM t\nROLLBACK TRANSACTION');
  });

  it('keeps a named transaction on one line', () => {
    expect(formatSQL('begin tran MyTran').trimEnd()).toBe('BEGIN TRAN MyTran');
    expect(formatSQL('commit transaction MyTran').trimEnd()).toBe('COMMIT TRANSACTION MyTran');
    expect(formatSQL('rollback tran MyTran').trimEnd()).toBe('ROLLBACK TRAN MyTran');
  });

  it('supports a transaction name held in a variable', () => {
    expect(formatSQL('begin tran @name').trimEnd()).toBe('BEGIN TRAN @name');
  });

  it('formats bare COMMIT and ROLLBACK', () => {
    expect(formatSQL('commit').trimEnd()).toBe('COMMIT');
    expect(formatSQL('rollback').trimEnd()).toBe('ROLLBACK');
  });

  it('does not swallow the following statement after a bare ROLLBACK', () => {
    const result = formatSQL('rollback\nselect 1');
    expect(result.trimEnd()).toBe('ROLLBACK\nSELECT 1');
  });

  it('does not swallow THROW after ROLLBACK TRAN', () => {
    const result = formatSQL('rollback tran\nthrow');
    expect(result.trimEnd()).toBe('ROLLBACK TRAN\nTHROW');
  });

  it('formats SAVE TRAN with a savepoint name', () => {
    expect(formatSQL('save tran sp1').trimEnd()).toBe('SAVE TRAN sp1');
  });

  it('formats BEGIN DISTRIBUTED TRANSACTION', () => {
    expect(formatSQL('begin distributed transaction').trimEnd()).toBe('BEGIN DISTRIBUTED TRANSACTION');
  });

  it('formats COMMIT WORK and ROLLBACK WORK', () => {
    expect(formatSQL('commit work').trimEnd()).toBe('COMMIT WORK');
    expect(formatSQL('rollback work').trimEnd()).toBe('ROLLBACK WORK');
  });

  it('formats WITH MARK on BEGIN TRANSACTION', () => {
    expect(formatSQL("begin transaction with mark 'my mark'").trimEnd()).toBe("BEGIN TRANSACTION WITH MARK 'my mark'");
  });

  it('formats WITH (DELAYED_DURABILITY = ON) on COMMIT', () => {
    expect(formatSQL('commit transaction with (delayed_durability = on)').trimEnd())
      .toBe('COMMIT TRANSACTION WITH (DELAYED_DURABILITY = ON)');
  });

  it('applies lowercase keyword casing to transaction keywords', () => {
    const result = formatSQL('BEGIN TRAN T1', { casing: { reservedKeywords: 'lowercase' } });
    expect(result.trimEnd()).toBe('begin tran T1');
  });

  it('indents transaction statements inside a BEGIN...END block', () => {
    const result = formatSQL('if @x = 1\nbegin\nbegin tran\ncommit tran\nend');
    expect(result).toContain('    BEGIN TRAN');
    expect(result).toContain('    COMMIT TRAN');
  });

  it('does not take COMMIT as a table alias', () => {
    const result = formatSQL('begin tran\nselect a from t\ncommit tran');
    expect(result.trimEnd()).toBe('BEGIN TRAN\nSELECT a FROM t\nCOMMIT TRAN');
  });

  it('does not take ROLLBACK as a table alias', () => {
    const result = formatSQL('select a from t\nrollback');
    expect(result.trimEnd()).toBe('SELECT a FROM t\nROLLBACK');
  });

  it('adds semicolons to transaction statements when configured', () => {
    const result = formatSQL('begin tran\ncommit tran', { whitespace: { insertSemicolons: 'insert' } });
    expect(result.trimEnd()).toBe('BEGIN TRAN;\nCOMMIT TRAN;');
  });
});
