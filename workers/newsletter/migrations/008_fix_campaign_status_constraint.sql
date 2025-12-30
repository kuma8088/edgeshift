-- migrations/008_fix_campaign_status_constraint.sql
-- Fix campaigns status CHECK constraint to include 'scheduled' and 'failed'

-- SQLite doesn't support ALTER TABLE to modify CHECK constraints
-- We need to recreate the table

-- Disable foreign key checks temporarily
PRAGMA foreign_keys = OFF;

-- Step 1: Create new table with correct constraint
CREATE TABLE campaigns_new (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  sent_at INTEGER,
  recipient_count INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  scheduled_at INTEGER,
  schedule_type TEXT,
  schedule_config TEXT,
  last_sent_at INTEGER,
  slug TEXT,
  excerpt TEXT,
  is_published INTEGER DEFAULT 0,
  template_id TEXT DEFAULT NULL,
  contact_list_id TEXT DEFAULT NULL,
  published_at INTEGER DEFAULT NULL,
  ab_test_enabled INTEGER DEFAULT 0,
  ab_subject_b TEXT,
  ab_from_name_b TEXT,
  ab_wait_hours INTEGER DEFAULT 4,
  ab_test_sent_at TEXT,
  ab_winner TEXT
);

-- Step 2: Copy data from old table
INSERT INTO campaigns_new SELECT * FROM campaigns;

-- Step 3: Drop old table
DROP TABLE campaigns;

-- Step 4: Rename new table
ALTER TABLE campaigns_new RENAME TO campaigns;

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;
