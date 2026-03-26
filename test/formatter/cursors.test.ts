import { describe, it, expect } from 'vitest';
import { formatSQL } from '../helpers';

describe('cursor statements', () => {
  // --- DECLARE CURSOR ---

  describe('DECLARE CURSOR', () => {
    it('formats basic DECLARE CURSOR with simple SELECT', () => {
      const result = formatSQL('DECLARE my_cursor CURSOR FOR SELECT id FROM dbo.items');
      expect(result).toContain('DECLARE my_cursor CURSOR');
      expect(result).toContain('FOR');
      expect(result).toContain('SELECT');
    });

    it('formats T-SQL extended syntax with LOCAL FAST_FORWARD', () => {
      const result = formatSQL('DECLARE my_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT id FROM t');
      expect(result).toContain('DECLARE my_cursor CURSOR LOCAL FAST_FORWARD');
      expect(result).toContain('FOR');
    });

    it('formats T-SQL extended syntax with all options', () => {
      const result = formatSQL('DECLARE my_cursor CURSOR LOCAL FORWARD_ONLY STATIC READ_ONLY TYPE_WARNING FOR SELECT id FROM t');
      expect(result).toContain('CURSOR LOCAL FORWARD_ONLY STATIC READ_ONLY TYPE_WARNING');
    });

    it('formats SCROLL KEYSET OPTIMISTIC options', () => {
      const result = formatSQL('DECLARE c CURSOR GLOBAL SCROLL KEYSET OPTIMISTIC FOR SELECT 1');
      expect(result).toContain('CURSOR GLOBAL SCROLL KEYSET OPTIMISTIC');
    });

    it('formats DYNAMIC SCROLL_LOCKS options', () => {
      const result = formatSQL('DECLARE c CURSOR LOCAL SCROLL DYNAMIC SCROLL_LOCKS FOR SELECT 1');
      expect(result).toContain('CURSOR LOCAL SCROLL DYNAMIC SCROLL_LOCKS');
    });

    it('formats ISO syntax with INSENSITIVE SCROLL', () => {
      const result = formatSQL('DECLARE my_cursor INSENSITIVE SCROLL CURSOR FOR SELECT name FROM products');
      expect(result).toContain('DECLARE my_cursor INSENSITIVE SCROLL CURSOR');
    });

    it('formats FOR READ_ONLY clause', () => {
      const result = formatSQL('DECLARE c CURSOR FOR SELECT id FROM t FOR READ_ONLY');
      expect(result).toContain('FOR READ_ONLY');
    });

    it('formats FOR UPDATE clause', () => {
      const result = formatSQL('DECLARE c CURSOR FOR SELECT id, name FROM t FOR UPDATE');
      expect(result).toContain('FOR UPDATE');
    });

    it('formats FOR UPDATE OF columns', () => {
      const result = formatSQL('DECLARE c CURSOR FOR SELECT id, name, status FROM t FOR UPDATE OF name, status');
      expect(result).toContain('FOR UPDATE OF name, status');
    });

    it('indents the SELECT under FOR', () => {
      const result = formatSQL(
        'DECLARE my_cursor CURSOR FOR SELECT col1, col2, col3, col4, col5 FROM dbo.very_long_table_name WHERE active = 1'
      );
      const lines = result.split('\n');
      const selectLine = lines.find(l => l.trimStart().startsWith('SELECT'));
      expect(selectLine).toBeTruthy();
      // SELECT should be indented relative to DECLARE
      expect(selectLine!.startsWith('    ')).toBe(true);
    });

    it('preserves cursor name casing', () => {
      const result = formatSQL('DECLARE MyCursor CURSOR FOR SELECT 1');
      expect(result).toContain('DECLARE MyCursor CURSOR');
    });
  });

  // --- OPEN ---

  describe('OPEN', () => {
    it('formats OPEN cursor', () => {
      const result = formatSQL('OPEN my_cursor');
      expect(result.trim()).toBe('OPEN my_cursor');
    });

    it('formats OPEN GLOBAL cursor', () => {
      const result = formatSQL('OPEN GLOBAL my_cursor');
      expect(result.trim()).toBe('OPEN GLOBAL my_cursor');
    });

    it('formats OPEN with cursor variable', () => {
      const result = formatSQL('OPEN @my_cursor_var');
      expect(result.trim()).toBe('OPEN @my_cursor_var');
    });
  });

  // --- CLOSE ---

  describe('CLOSE', () => {
    it('formats CLOSE cursor', () => {
      const result = formatSQL('CLOSE my_cursor');
      expect(result.trim()).toBe('CLOSE my_cursor');
    });

    it('formats CLOSE GLOBAL cursor', () => {
      const result = formatSQL('CLOSE GLOBAL my_cursor');
      expect(result.trim()).toBe('CLOSE GLOBAL my_cursor');
    });

    it('formats CLOSE with cursor variable', () => {
      const result = formatSQL('CLOSE @cur_var');
      expect(result.trim()).toBe('CLOSE @cur_var');
    });
  });

  // --- DEALLOCATE ---

  describe('DEALLOCATE', () => {
    it('formats DEALLOCATE cursor', () => {
      const result = formatSQL('DEALLOCATE my_cursor');
      expect(result.trim()).toBe('DEALLOCATE my_cursor');
    });

    it('formats DEALLOCATE GLOBAL cursor', () => {
      const result = formatSQL('DEALLOCATE GLOBAL my_cursor');
      expect(result.trim()).toBe('DEALLOCATE GLOBAL my_cursor');
    });

    it('formats DEALLOCATE with cursor variable', () => {
      const result = formatSQL('DEALLOCATE @cur_var');
      expect(result.trim()).toBe('DEALLOCATE @cur_var');
    });
  });

  // --- FETCH ---

  describe('FETCH', () => {
    it('formats FETCH NEXT FROM cursor', () => {
      const result = formatSQL('FETCH NEXT FROM my_cursor INTO @id');
      expect(result.trim()).toBe('FETCH NEXT FROM my_cursor INTO @id');
    });

    it('formats FETCH PRIOR FROM cursor', () => {
      const result = formatSQL('FETCH PRIOR FROM my_cursor INTO @id');
      expect(result.trim()).toBe('FETCH PRIOR FROM my_cursor INTO @id');
    });

    it('formats FETCH FIRST FROM cursor', () => {
      const result = formatSQL('FETCH FIRST FROM my_cursor INTO @id');
      expect(result.trim()).toBe('FETCH FIRST FROM my_cursor INTO @id');
    });

    it('formats FETCH LAST FROM cursor', () => {
      const result = formatSQL('FETCH LAST FROM my_cursor INTO @id');
      expect(result.trim()).toBe('FETCH LAST FROM my_cursor INTO @id');
    });

    it('formats FETCH ABSOLUTE n FROM cursor', () => {
      const result = formatSQL('FETCH ABSOLUTE 5 FROM my_cursor INTO @id');
      expect(result.trim()).toBe('FETCH ABSOLUTE 5 FROM my_cursor INTO @id');
    });

    it('formats FETCH RELATIVE n FROM cursor', () => {
      const result = formatSQL('FETCH RELATIVE -3 FROM my_cursor INTO @id');
      expect(result.trim()).toBe('FETCH RELATIVE -3 FROM my_cursor INTO @id');
    });

    it('formats FETCH with multiple INTO variables', () => {
      const result = formatSQL('FETCH NEXT FROM my_cursor INTO @id, @name, @status');
      expect(result.trim()).toBe('FETCH NEXT FROM my_cursor INTO @id, @name, @status');
    });

    it('formats FETCH without orientation (bare FETCH cursor)', () => {
      const result = formatSQL('FETCH my_cursor INTO @x');
      expect(result.trim()).toBe('FETCH my_cursor INTO @x');
    });

    it('formats FETCH FROM cursor (explicit FROM, no orientation)', () => {
      const result = formatSQL('FETCH FROM my_cursor INTO @x');
      expect(result.trim()).toBe('FETCH FROM my_cursor INTO @x');
    });

    it('formats FETCH with GLOBAL cursor', () => {
      const result = formatSQL('FETCH NEXT FROM GLOBAL shared_cursor INTO @val');
      expect(result.trim()).toBe('FETCH NEXT FROM GLOBAL shared_cursor INTO @val');
    });

    it('formats FETCH with cursor variable', () => {
      const result = formatSQL('FETCH NEXT FROM @my_cursor_var INTO @x, @y');
      expect(result.trim()).toBe('FETCH NEXT FROM @my_cursor_var INTO @x, @y');
    });

    it('formats FETCH without INTO clause', () => {
      const result = formatSQL('FETCH NEXT FROM my_cursor');
      expect(result.trim()).toBe('FETCH NEXT FROM my_cursor');
    });

    it('formats FETCH ABSOLUTE with variable', () => {
      const result = formatSQL('FETCH ABSOLUTE @pos FROM my_cursor INTO @val');
      expect(result.trim()).toBe('FETCH ABSOLUTE @pos FROM my_cursor INTO @val');
    });
  });

  // --- Full cursor lifecycle ---

  describe('cursor lifecycle', () => {
    it('formats a complete cursor workflow', () => {
      const sql = `
DECLARE @EmpID INT, @Name NVARCHAR(100);
DECLARE emp_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT EmployeeID, Name FROM dbo.Employees WHERE Active = 1;
OPEN emp_cursor;
FETCH NEXT FROM emp_cursor INTO @EmpID, @Name;
WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT @Name;
    FETCH NEXT FROM emp_cursor INTO @EmpID, @Name;
END;
CLOSE emp_cursor;
DEALLOCATE emp_cursor;`;
      const result = formatSQL(sql);
      expect(result).toContain('DECLARE emp_cursor CURSOR LOCAL FAST_FORWARD');
      expect(result).toContain('OPEN emp_cursor');
      expect(result).toContain('FETCH NEXT FROM emp_cursor INTO @EmpID, @Name');
      expect(result).toContain('CLOSE emp_cursor');
      expect(result).toContain('DEALLOCATE emp_cursor');
      expect(result).toContain('WHILE @@FETCH_STATUS = 0');
    });
  });

  // --- SET @var = CURSOR ---

  describe('SET @var = CURSOR', () => {
    it('formats SET @var = CURSOR ... FOR SELECT', () => {
      const result = formatSQL('SET @CursorVar = CURSOR SCROLL DYNAMIC FOR SELECT LastName FROM vEmployee');
      expect(result).toContain('SET @CursorVar = CURSOR SCROLL DYNAMIC');
      expect(result).toContain('FOR');
      expect(result).toContain('SELECT');
    });

    it('formats SET @var = CURSOR LOCAL FAST_FORWARD FOR SELECT', () => {
      const result = formatSQL('SET @c = CURSOR LOCAL FAST_FORWARD FOR SELECT id FROM t');
      expect(result).toContain('SET @c = CURSOR LOCAL FAST_FORWARD');
    });

    it('formats SET @var = CURSOR FOR SELECT ... FOR READ ONLY (two words)', () => {
      const result = formatSQL('SET @c = CURSOR FOR SELECT id FROM t FOR READ ONLY');
      expect(result).toContain('FOR READ_ONLY');
    });

    it('formats SET @var = CURSOR FOR SELECT ... FOR UPDATE OF columns', () => {
      const result = formatSQL('SET @c = CURSOR FOR SELECT id, name FROM t FOR UPDATE OF name');
      expect(result).toContain('FOR UPDATE OF name');
    });

    it('indents the SELECT under FOR', () => {
      const result = formatSQL('SET @c = CURSOR SCROLL DYNAMIC FOR SELECT col1, col2 FROM dbo.my_table WHERE active = 1');
      const lines = result.split('\n');
      const selectLine = lines.find(l => l.trimStart().startsWith('SELECT'));
      expect(selectLine).toBeTruthy();
      expect(selectLine!.startsWith('    ')).toBe(true);
    });

    it('formats a full cursor variable lifecycle', () => {
      const sql = `
DECLARE @MyCursor CURSOR;
SET @MyCursor = CURSOR LOCAL SCROLL FOR SELECT id, name FROM dbo.items;
OPEN @MyCursor;
FETCH NEXT FROM @MyCursor INTO @id, @name;
CLOSE @MyCursor;
DEALLOCATE @MyCursor;`;
      const result = formatSQL(sql);
      expect(result).toContain('SET @MyCursor = CURSOR LOCAL SCROLL');
      expect(result).toContain('OPEN @MyCursor');
      expect(result).toContain('FETCH NEXT FROM @MyCursor INTO @id, @name');
      expect(result).toContain('CLOSE @MyCursor');
      expect(result).toContain('DEALLOCATE @MyCursor');
    });

    it('applies keyword casing to SET cursor', () => {
      const result = formatSQL('set @c = cursor scroll dynamic for select 1', {
        casing: { reservedKeywords: 'uppercase', builtInDataTypes: 'uppercase' },
      });
      expect(result).toContain('SET @c = CURSOR SCROLL DYNAMIC');
    });
  });

  // --- Keyword casing ---

  describe('keyword casing', () => {
    it('applies uppercase casing to cursor keywords', () => {
      const result = formatSQL('declare my_cursor cursor for select 1', {
        casing: { reservedKeywords: 'uppercase' },
      });
      expect(result).toContain('DECLARE my_cursor CURSOR');
      expect(result).toContain('FOR');
    });

    it('applies lowercase casing to cursor keywords', () => {
      const result = formatSQL('DECLARE my_cursor CURSOR FOR SELECT 1', {
        casing: { reservedKeywords: 'lowercase', builtInDataTypes: 'lowercase' },
      });
      // CURSOR is categorized as a datatype in casing.ts, so both configs must be lowercase
      expect(result).toContain('declare my_cursor cursor');
      expect(result).toContain('for');
    });

    it('applies casing to OPEN/CLOSE/DEALLOCATE/FETCH', () => {
      const result = formatSQL(
        'open my_cursor; fetch next from my_cursor into @x; close my_cursor; deallocate my_cursor',
        { casing: { reservedKeywords: 'uppercase' } }
      );
      expect(result).toContain('OPEN my_cursor');
      expect(result).toContain('FETCH NEXT FROM my_cursor INTO @x');
      expect(result).toContain('CLOSE my_cursor');
      expect(result).toContain('DEALLOCATE my_cursor');
    });
  });

  // --- Semicolons ---

  describe('semicolons', () => {
    it('inserts semicolons on cursor statements when configured', () => {
      const result = formatSQL(
        'OPEN my_cursor\nFETCH NEXT FROM my_cursor INTO @x\nCLOSE my_cursor\nDEALLOCATE my_cursor',
        { whitespace: { insertSemicolons: 'insert' } }
      );
      expect(result).toContain('OPEN my_cursor;');
      expect(result).toContain('INTO @x;');
      expect(result).toContain('CLOSE my_cursor;');
      expect(result).toContain('DEALLOCATE my_cursor;');
    });
  });
});
