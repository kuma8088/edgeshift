-- Migration: Add time specification columns to sequences and sequence_steps
-- Created: 2025-12-24

-- Add default_send_time to sequences table
ALTER TABLE sequences ADD COLUMN default_send_time TEXT NOT NULL DEFAULT '10:00';

-- Add delay_time to sequence_steps table
ALTER TABLE sequence_steps ADD COLUMN delay_time TEXT;
