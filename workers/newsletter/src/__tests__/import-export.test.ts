import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestEnv, setupTestDb, cleanupTestDb } from './setup';
import { handleImport, handleExport } from '../routes/import-export';

const env = getTestEnv();

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

  describe('handleImport', () => {
    beforeEach(async () => {
      // Clear subscribers table
      await env.DB.prepare('DELETE FROM subscribers').run();
    });

    it('should import subscribers from CSV', async () => {
      const csv = 'email,first_name,last_name\ntest@example.com,John,Doe';
      const formData = new FormData();
      formData.append('file', new Blob([csv], { type: 'text/csv' }), 'test.csv');

      const request = new Request('http://localhost/api/subscribers/import', {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleImport(request, env);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.data.imported).toBe(1);
      expect(result.data.skipped).toBe(0);

      // Verify in database
      const subscriber = await env.DB.prepare(
        'SELECT * FROM subscribers WHERE email = ?'
      ).bind('test@example.com').first();
      expect(subscriber).not.toBeNull();
      expect(subscriber?.name).toBe('John Doe');
      expect(subscriber?.status).toBe('active');
    });

    it('should skip duplicate emails', async () => {
      // Insert existing subscriber
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, name, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('existing-id', 'existing@example.com', 'Existing', 'active', Date.now()).run();

      const csv = 'email\nexisting@example.com\nnew@example.com';
      const formData = new FormData();
      formData.append('file', new Blob([csv], { type: 'text/csv' }), 'test.csv');

      const request = new Request('http://localhost/api/subscribers/import', {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleImport(request, env);
      const result = await response.json();

      expect(result.data.imported).toBe(1);
      expect(result.data.skipped).toBe(1);
    });

    it('should report invalid email format in errors', async () => {
      const csv = 'email\ninvalid-email\nvalid@example.com';
      const formData = new FormData();
      formData.append('file', new Blob([csv], { type: 'text/csv' }), 'test.csv');

      const request = new Request('http://localhost/api/subscribers/import', {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleImport(request, env);
      const result = await response.json();

      expect(result.data.imported).toBe(1);
      expect(result.data.errors.length).toBe(1);
      expect(result.data.errors[0].email).toBe('invalid-email');
      expect(result.data.errors[0].reason).toContain('Invalid email');
    });

    it('should add to contact list when specified', async () => {
      // Create a contact list
      await env.DB.prepare(
        `INSERT INTO contact_lists (id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      ).bind('list-1', 'Test List', Date.now(), Date.now()).run();

      const csv = 'email\ntest@example.com';
      const formData = new FormData();
      formData.append('file', new Blob([csv], { type: 'text/csv' }), 'test.csv');
      formData.append('contact_list_id', 'list-1');

      const request = new Request('http://localhost/api/subscribers/import', {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleImport(request, env);
      const result = await response.json();

      expect(result.data.imported).toBe(1);

      // Verify contact list membership
      const membership = await env.DB.prepare(
        'SELECT * FROM contact_list_members WHERE contact_list_id = ?'
      ).bind('list-1').first();
      expect(membership).not.toBeNull();
    });

    it('should return 401 without authorization', async () => {
      const csv = 'email\ntest@example.com';
      const formData = new FormData();
      formData.append('file', new Blob([csv], { type: 'text/csv' }), 'test.csv');

      const request = new Request('http://localhost/api/subscribers/import', {
        method: 'POST',
        body: formData,
      });

      const response = await handleImport(request, env);
      expect(response.status).toBe(401);
    });

    it('should return 400 when no file provided', async () => {
      const formData = new FormData();

      const request = new Request('http://localhost/api/subscribers/import', {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleImport(request, env);
      const result = await response.json();

      expect(response.status).toBe(400);
      expect(result.error).toContain('No file');
    });
  });

  describe('handleExport', () => {
    beforeEach(async () => {
      await env.DB.prepare('DELETE FROM subscribers').run();
      await env.DB.prepare('DELETE FROM contact_list_members').run();
      await env.DB.prepare('DELETE FROM contact_lists').run();

      // Insert test subscribers
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, name, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('sub-1', 'active@example.com', 'John Doe', 'active', now).run();

      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, name, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind('sub-2', 'unsub@example.com', 'Jane Smith', 'unsubscribed', now).run();
    });

    it('should export all subscribers as CSV', async () => {
      const request = new Request('http://localhost/api/subscribers/export', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleExport(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/csv');
      expect(response.headers.get('Content-Disposition')).toContain('attachment');

      const csv = await response.text();
      expect(csv).toContain('email,first_name,last_name,status,created_at');
      expect(csv).toContain('active@example.com');
      expect(csv).toContain('unsub@example.com');
    });

    it('should filter by status=active', async () => {
      const request = new Request('http://localhost/api/subscribers/export?status=active', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleExport(request, env);
      const csv = await response.text();

      expect(csv).toContain('active@example.com');
      expect(csv).not.toContain('unsub@example.com');
    });

    it('should filter by contact list', async () => {
      // Create list and add one subscriber
      await env.DB.prepare(
        `INSERT INTO contact_lists (id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      ).bind('list-1', 'Test List', Date.now(), Date.now()).run();

      await env.DB.prepare(
        `INSERT INTO contact_list_members (id, contact_list_id, subscriber_id, added_at)
         VALUES (?, ?, ?, ?)`
      ).bind('mem-1', 'list-1', 'sub-1', Date.now()).run();

      const request = new Request('http://localhost/api/subscribers/export?contact_list_id=list-1', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleExport(request, env);
      const csv = await response.text();

      expect(csv).toContain('active@example.com');
      expect(csv).not.toContain('unsub@example.com');
    });

    it('should split name into first_name and last_name', async () => {
      const request = new Request('http://localhost/api/subscribers/export', {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.ADMIN_API_KEY}` },
      });

      const response = await handleExport(request, env);
      const csv = await response.text();
      const lines = csv.split('\n');

      // Find the line with John Doe
      const johnLine = lines.find(l => l.includes('active@example.com'));
      expect(johnLine).toContain('John');
      expect(johnLine).toContain('Doe');
    });

    it('should return 401 without authorization', async () => {
      const request = new Request('http://localhost/api/subscribers/export', {
        method: 'GET',
      });

      const response = await handleExport(request, env);
      expect(response.status).toBe(401);
    });
  });
});
