/**
 * CSV Import/Export Utilities
 *
 * This module provides functions for importing subscribers from CSV files
 * and exporting subscriber data to CSV format.
 */

import type { Env, ImportResult, Subscriber, ExportOptions } from '../types';
import { splitName } from '../lib/resend-marketing';
import { isAuthorizedAsync } from '../lib/auth';

// ============================================================================
// CSV Parsing Utilities
// ============================================================================

/**
 * Detect the email column from headers.
 * Supports: email, Email, E-mail, e-mail, Eメール, メールアドレス
 */
export function detectEmailColumn(headers: string[]): string | null {
  const emailPatterns = [
    /^e-?mail$/i,
    /^eメール$/i,
    /^メールアドレス$/i,
  ];

  for (const header of headers) {
    for (const pattern of emailPatterns) {
      if (pattern.test(header.trim())) {
        return header;
      }
    }
  }
  return null;
}

/**
 * Join first_name and last_name into a full name.
 */
export function joinName(
  firstName: string | undefined,
  lastName: string | undefined
): string | null {
  const first = firstName?.trim() || '';
  const last = lastName?.trim() || '';

  if (!first && !last) {
    return null;
  }

  return [first, last].filter(Boolean).join(' ');
}

/**
 * Parse a single CSV line, handling quoted values.
 * Supports:
 * - Quoted values with commas inside
 * - Escaped quotes (double quotes)
 * - Mixed quoted and unquoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote (double quotes)
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Parse CSV string into array of objects.
 * Handles:
 * - Various line endings (LF, CRLF)
 * - Quoted values
 * - Japanese headers (Eメール, メールアドレス)
 * - Empty lines (skipped)
 * - Rows without email (skipped)
 */
export function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const emailColumn = detectEmailColumn(headers);

  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j].trim();
      const value = values[j]?.trim() || '';

      // Normalize email column name to 'email'
      if (emailColumn && header === emailColumn) {
        row['email'] = value;
      } else {
        // Normalize other column names (lowercase, replace spaces/hyphens with underscores)
        const normalizedHeader = header.toLowerCase().replace(/[- ]/g, '_');
        row[normalizedHeader] = value;
      }
    }

    // Only include rows with non-empty email
    if (row['email']) {
      results.push(row);
    }
  }

  return results;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate UUID v4.
 */
function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Import Handler
// ============================================================================

/**
 * Handle POST /api/subscribers/import
 *
 * Accepts a CSV file with subscriber data and imports them into the database.
 * - Validates email format
 * - Skips duplicates
 * - Optionally adds to a contact list
 */
export async function handleImport(
  request: Request,
  env: Env
): Promise<Response> {
  // Check authorization (supports API key, CF Access, and session)
  if (!(await isAuthorizedAsync(request, env))) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const contactListId = formData.get('contact_list_id') as string | null;

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const csvText = await file.text();
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'CSV file is empty or has no valid data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for email column
    const firstRow = rows[0];
    if (!('email' in firstRow)) {
      return new Response(
        JSON.stringify({ success: false, error: 'No email column found in CSV' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get existing emails for duplicate check
    const existingEmails = new Set<string>();
    const existingResult = await env.DB.prepare(
      'SELECT email FROM subscribers'
    ).all<{ email: string }>();
    for (const row of existingResult.results || []) {
      existingEmails.add(row.email.toLowerCase());
    }

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    const now = Date.now();
    const subscribersToInsert: Array<{
      id: string;
      email: string;
      name: string | null;
      status: string;
      created_at: number;
      subscribed_at: number;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email = row.email?.toLowerCase().trim();
      const rowNumber = i + 2; // +2 because row 1 is header, and we're 0-indexed

      if (!email) {
        result.errors.push({ row: rowNumber, email: '', reason: 'Email is required' });
        continue;
      }

      if (!isValidEmail(email)) {
        result.errors.push({ row: rowNumber, email, reason: 'Invalid email format' });
        continue;
      }

      if (existingEmails.has(email)) {
        result.skipped++;
        continue;
      }

      // Build name from first_name/last_name or name field
      let name: string | null = null;
      if (row.first_name || row.last_name) {
        name = joinName(row.first_name, row.last_name);
      } else if (row.name) {
        name = row.name.trim() || null;
      }

      subscribersToInsert.push({
        id: generateId(),
        email,
        name,
        status: 'active',
        created_at: now,
        subscribed_at: now,
      });

      existingEmails.add(email); // Prevent duplicates within same import
    }

    // Batch insert subscribers
    for (const subscriber of subscribersToInsert) {
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, name, status, created_at, subscribed_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        subscriber.id,
        subscriber.email,
        subscriber.name,
        subscriber.status,
        subscriber.created_at,
        subscriber.subscribed_at
      ).run();

      result.imported++;

      // Add to contact list if specified
      if (contactListId) {
        await env.DB.prepare(
          `INSERT INTO contact_list_members (id, contact_list_id, subscriber_id, added_at)
           VALUES (?, ?, ?, ?)`
        ).bind(generateId(), contactListId, subscriber.id, now).run();
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Import failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================================
// CSV Export Utilities
// ============================================================================

/**
 * Escape a value for CSV output.
 * Handles commas, quotes, and newlines.
 */
function escapeCSVValue(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  // If value contains comma, quote, or newline, wrap in quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

// ============================================================================
// Export Handler
// ============================================================================

/**
 * Handle GET /api/subscribers/export
 *
 * Exports subscribers to CSV format.
 * Supports filtering by:
 * - status: 'active' | 'unsubscribed' | 'all'
 * - contact_list_id: Filter to members of a specific list
 */
export async function handleExport(
  request: Request,
  env: Env
): Promise<Response> {
  // Check authorization (supports API key, CF Access, and session)
  if (!(await isAuthorizedAsync(request, env))) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(request.url);
    const contactListId = url.searchParams.get('contact_list_id');
    const status = url.searchParams.get('status') as 'active' | 'unsubscribed' | 'all' | null;

    let query: string;
    const params: (string | number)[] = [];

    if (contactListId) {
      query = `
        SELECT s.* FROM subscribers s
        INNER JOIN contact_list_members clm ON s.id = clm.subscriber_id
        WHERE clm.contact_list_id = ?
      `;
      params.push(contactListId);

      if (status && status !== 'all') {
        query += ' AND s.status = ?';
        params.push(status);
      }
    } else {
      query = 'SELECT * FROM subscribers';

      if (status && status !== 'all') {
        query += ' WHERE status = ?';
        params.push(status);
      }
    }

    query += ' ORDER BY created_at DESC';

    // Execute query with all bindings
    const stmt = env.DB.prepare(query);
    const boundStmt = params.length > 0 ? stmt.bind(...params) : stmt;
    const result = await boundStmt.all<Subscriber>();
    const subscribers = result.results || [];

    // Build CSV
    const headers = ['email', 'first_name', 'last_name', 'status', 'created_at'];
    const lines: string[] = [headers.join(',')];

    for (const sub of subscribers) {
      const { firstName, lastName } = splitName(sub.name);
      const createdAt = sub.created_at
        ? new Date(sub.created_at).toISOString()
        : '';

      const row = [
        escapeCSVValue(sub.email),
        escapeCSVValue(firstName),
        escapeCSVValue(lastName),
        escapeCSVValue(sub.status),
        escapeCSVValue(createdAt),
      ];
      lines.push(row.join(','));
    }

    const csv = lines.join('\n');
    const filename = `subscribers_${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Export failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
