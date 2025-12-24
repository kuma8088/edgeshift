-- Migration 004: Soft delete for steps + email subject preservation
-- Steps are never physically deleted, only disabled (is_enabled = 0)
-- This preserves all historical data and FK relationships

-- Add is_enabled to sequence_steps for soft delete
ALTER TABLE sequence_steps ADD COLUMN is_enabled INTEGER DEFAULT 1;

-- Add email_subject to delivery_logs for historical reference
ALTER TABLE delivery_logs ADD COLUMN email_subject TEXT;
