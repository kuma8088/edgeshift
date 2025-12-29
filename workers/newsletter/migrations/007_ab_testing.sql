-- migrations/007_ab_testing.sql
-- A/B Testing support for campaigns

-- Add A/B test columns to campaigns
ALTER TABLE campaigns ADD COLUMN ab_test_enabled INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN ab_subject_b TEXT;
ALTER TABLE campaigns ADD COLUMN ab_from_name_b TEXT;
ALTER TABLE campaigns ADD COLUMN ab_wait_hours INTEGER DEFAULT 4;
ALTER TABLE campaigns ADD COLUMN ab_test_sent_at TEXT;
ALTER TABLE campaigns ADD COLUMN ab_winner TEXT;

-- Add variant tracking to delivery_logs
ALTER TABLE delivery_logs ADD COLUMN ab_variant TEXT;
