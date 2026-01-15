/**
 * CSV Import/Export Utilities
 *
 * This module provides functions for importing subscribers from CSV files
 * and exporting subscriber data to CSV format.
 */

import type { Env, ImportResult, ImportError, Subscriber, ExportOptions } from '../types';
import { splitName } from '../lib/resend-marketing';

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
// Import Functions (to be implemented in Task 3)
// ============================================================================

// Placeholder for future implementation
// export async function importSubscribers(...)
// export async function exportSubscribers(...)
