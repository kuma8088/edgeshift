-- Migration: Email Templates Feature
-- Date: 2025-12-29
-- Description: Add brand_settings table and template_id columns

-- Create brand_settings table (singleton pattern with id='default')
CREATE TABLE IF NOT EXISTS brand_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7c3aed',
  secondary_color TEXT DEFAULT '#1e1e1e',
  footer_text TEXT DEFAULT 'EdgeShift Newsletter',
  default_template_id TEXT DEFAULT 'simple',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Add template_id to campaigns table (for existing databases)
-- Note: SQLite doesn't support IF NOT EXISTS for columns,
-- but this will fail gracefully if column already exists
ALTER TABLE campaigns ADD COLUMN template_id TEXT DEFAULT NULL;

-- Add template_id to sequence_steps table (for existing databases)
ALTER TABLE sequence_steps ADD COLUMN template_id TEXT DEFAULT NULL;
