-- Migration: Referral Program
-- Date: 2025-12-29
-- Description: Add referral program support

-- Add referral columns to subscribers table
ALTER TABLE subscribers ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE subscribers ADD COLUMN referred_by TEXT REFERENCES subscribers(id);
ALTER TABLE subscribers ADD COLUMN referral_count INTEGER DEFAULT 0;

-- Create index for referral code lookup
CREATE INDEX IF NOT EXISTS idx_subscribers_referral_code ON subscribers(referral_code);

-- Create referral milestones table
CREATE TABLE IF NOT EXISTS referral_milestones (
  id TEXT PRIMARY KEY,
  threshold INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  reward_type TEXT CHECK (reward_type IN ('badge', 'discount', 'content', 'custom')),
  reward_value TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Create referral achievements table
CREATE TABLE IF NOT EXISTS referral_achievements (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  achieved_at INTEGER NOT NULL,
  notified_at INTEGER,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  FOREIGN KEY (milestone_id) REFERENCES referral_milestones(id) ON DELETE CASCADE,
  UNIQUE(subscriber_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_achievements_subscriber ON referral_achievements(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_achievements_pending ON referral_achievements(notified_at);

-- Insert default milestones
INSERT OR IGNORE INTO referral_milestones (id, threshold, name, description, reward_type, reward_value)
VALUES
  ('milestone_bronze', 3, 'Bronze Referrer', '3人の友達を紹介', 'badge', 'bronze'),
  ('milestone_silver', 10, 'Silver Advocate', '10人の友達を紹介', 'badge', 'silver'),
  ('milestone_gold', 25, 'Gold Ambassador', '25人の友達を紹介', 'badge', 'gold'),
  ('milestone_platinum', 50, 'Platinum Champion', '50人の友達を紹介', 'badge', 'platinum');
