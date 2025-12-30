-- migrations/010_restore_campaign_constraints.sql
-- Restore missing CHECK and FK constraints for campaigns table
-- Migration 008 lost:
-- 1. schedule_type CHECK (schedule_type IN ('none', 'daily', 'weekly', 'monthly'))
-- 2. contact_list_id REFERENCES contact_lists(id) ON DELETE SET NULL

-- Disable foreign key checks temporarily
PRAGMA foreign_keys = OFF;

-- Step 1: Create new table with ALL constraints in correct column order
CREATE TABLE campaigns_new (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at INTEGER,
  schedule_type TEXT CHECK (schedule_type IN ('none', 'daily', 'weekly', 'monthly')),
  schedule_config TEXT,
  last_sent_at INTEGER,
  sent_at INTEGER,
  recipient_count INTEGER,
  contact_list_id TEXT REFERENCES contact_lists(id) ON DELETE SET NULL,
  template_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  slug TEXT UNIQUE,
  is_published INTEGER DEFAULT 0,
  published_at INTEGER,
  excerpt TEXT,
  ab_test_enabled INTEGER DEFAULT 0,
  ab_subject_b TEXT,
  ab_from_name_b TEXT,
  ab_wait_hours INTEGER DEFAULT 4,
  ab_test_sent_at TEXT,
  ab_winner TEXT
);

-- Step 2: Copy data with explicit column list
INSERT INTO campaigns_new (
  id,
  subject,
  content,
  status,
  scheduled_at,
  schedule_type,
  schedule_config,
  last_sent_at,
  sent_at,
  recipient_count,
  contact_list_id,
  template_id,
  created_at,
  slug,
  is_published,
  published_at,
  excerpt,
  ab_test_enabled,
  ab_subject_b,
  ab_from_name_b,
  ab_wait_hours,
  ab_test_sent_at,
  ab_winner
)
SELECT
  id,
  subject,
  content,
  status,
  scheduled_at,
  schedule_type,
  schedule_config,
  last_sent_at,
  sent_at,
  recipient_count,
  contact_list_id,
  template_id,
  created_at,
  slug,
  is_published,
  published_at,
  excerpt,
  ab_test_enabled,
  ab_subject_b,
  ab_from_name_b,
  ab_wait_hours,
  ab_test_sent_at,
  ab_winner
FROM campaigns;

-- Step 3: Drop old table
DROP TABLE campaigns;

-- Step 4: Rename new table
ALTER TABLE campaigns_new RENAME TO campaigns;

-- Step 5: Recreate indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_slug ON campaigns(slug);
CREATE INDEX IF NOT EXISTS idx_campaigns_published ON campaigns(is_published, published_at);

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;
