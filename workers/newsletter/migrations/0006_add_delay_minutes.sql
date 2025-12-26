-- Migration: Add delay_minutes column to sequence_steps
-- This enables step 1 to be sent immediately (0 minutes) or with minute-level precision
-- NULL = use existing delay_days/delay_time logic
-- 0 = immediate send
-- >0 = delay in minutes from started_at (step 1) or previous step's sent_at (step 2+)

ALTER TABLE sequence_steps ADD COLUMN delay_minutes INTEGER DEFAULT NULL;
