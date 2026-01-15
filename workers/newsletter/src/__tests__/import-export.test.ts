import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';

describe('CSV Import/Export', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('parseCSV', () => {
    it('should parse CSV with email header', async () => {
      const { parseCSV } = await import('../routes/import-export');
      const csv = 'email,first_name,last_name\ntest@example.com,John,Doe';
      const result = parseCSV(csv);
      expect(result).toEqual([
        { email: 'test@example.com', first_name: 'John', last_name: 'Doe' },
      ]);
    });

    it('should parse CSV with Japanese header (Eメール)', async () => {
      const { parseCSV } = await import('../routes/import-export');
      const csv = 'Eメール\ntest@example.com';
      const result = parseCSV(csv);
      expect(result).toEqual([{ email: 'test@example.com' }]);
    });

    it('should handle quoted values with commas', async () => {
      const { parseCSV } = await import('../routes/import-export');
      const csv = 'email,name\ntest@example.com,"Doe, John"';
      const result = parseCSV(csv);
      expect(result).toEqual([
        { email: 'test@example.com', name: 'Doe, John' },
      ]);
    });

    it('should skip empty lines', async () => {
      const { parseCSV } = await import('../routes/import-export');
      const csv = 'email\ntest1@example.com\n\ntest2@example.com';
      const result = parseCSV(csv);
      expect(result.length).toBe(2);
    });

    it('should handle Windows line endings (CRLF)', async () => {
      const { parseCSV } = await import('../routes/import-export');
      const csv = 'email,name\r\ntest@example.com,John\r\n';
      const result = parseCSV(csv);
      expect(result).toEqual([
        { email: 'test@example.com', name: 'John' },
      ]);
    });

    it('should skip rows without valid email', async () => {
      const { parseCSV } = await import('../routes/import-export');
      const csv = 'email,name\n,John\ntest@example.com,Jane';
      const result = parseCSV(csv);
      expect(result.length).toBe(1);
      expect(result[0].email).toBe('test@example.com');
    });

    it('should handle escaped quotes', async () => {
      const { parseCSV } = await import('../routes/import-export');
      const csv = 'email,name\ntest@example.com,"John ""The Dev"" Doe"';
      const result = parseCSV(csv);
      expect(result[0].name).toBe('John "The Dev" Doe');
    });
  });

  describe('detectEmailColumn', () => {
    it('should detect "email" header', async () => {
      const { detectEmailColumn } = await import('../routes/import-export');
      expect(detectEmailColumn(['email', 'name'])).toBe('email');
    });

    it('should detect "Email" header (case insensitive)', async () => {
      const { detectEmailColumn } = await import('../routes/import-export');
      expect(detectEmailColumn(['Email', 'Name'])).toBe('Email');
    });

    it('should detect "Eメール" header', async () => {
      const { detectEmailColumn } = await import('../routes/import-export');
      expect(detectEmailColumn(['Eメール'])).toBe('Eメール');
    });

    it('should detect "e-mail" header', async () => {
      const { detectEmailColumn } = await import('../routes/import-export');
      expect(detectEmailColumn(['e-mail', 'name'])).toBe('e-mail');
    });

    it('should detect "メールアドレス" header', async () => {
      const { detectEmailColumn } = await import('../routes/import-export');
      expect(detectEmailColumn(['メールアドレス', '名前'])).toBe('メールアドレス');
    });

    it('should return null if no email column found', async () => {
      const { detectEmailColumn } = await import('../routes/import-export');
      expect(detectEmailColumn(['name', 'phone'])).toBe(null);
    });
  });

  describe('joinName', () => {
    it('should join first_name and last_name', async () => {
      const { joinName } = await import('../routes/import-export');
      expect(joinName('John', 'Doe')).toBe('John Doe');
    });

    it('should handle first_name only', async () => {
      const { joinName } = await import('../routes/import-export');
      expect(joinName('John', undefined)).toBe('John');
    });

    it('should handle last_name only', async () => {
      const { joinName } = await import('../routes/import-export');
      expect(joinName(undefined, 'Doe')).toBe('Doe');
    });

    it('should return null if both are empty', async () => {
      const { joinName } = await import('../routes/import-export');
      expect(joinName(undefined, undefined)).toBe(null);
      expect(joinName('', '')).toBe(null);
    });

    it('should trim whitespace', async () => {
      const { joinName } = await import('../routes/import-export');
      expect(joinName('  John  ', '  Doe  ')).toBe('John Doe');
    });
  });
});
