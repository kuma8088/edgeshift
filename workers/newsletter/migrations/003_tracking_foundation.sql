-- Migration 003: Tracking Foundation
-- Adds click_events table and extends delivery_logs for sequence support

-- Step 1: Create new delivery_logs table with sequence support
CREATE TABLE delivery_logs_new (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  sequence_id TEXT,
  sequence_step_id TEXT,
  subscriber_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  resend_id TEXT,
  sent_at INTEGER,
  delivered_at INTEGER,
  opened_at INTEGER,
  clicked_at INTEGER,
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (sequence_id) REFERENCES sequences(id),
  FOREIGN KEY (sequence_step_id) REFERENCES sequence_steps(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

-- Step 2: Copy existing data
INSERT INTO delivery_logs_new (
  id, campaign_id, subscriber_id, email, status, resend_id,
  sent_at, delivered_at, opened_at, clicked_at, error_message, created_at
)
SELECT
  id, campaign_id, subscriber_id, email, status, resend_id,
  sent_at, delivered_at, opened_at, clicked_at, error_message, created_at
FROM delivery_logs;

-- Step 3: Drop old table
DROP TABLE delivery_logs;

-- Step 4: Rename new table
ALTER TABLE delivery_logs_new RENAME TO delivery_logs;

-- Step 5: Create indexes for delivery_logs
CREATE INDEX idx_delivery_logs_campaign ON delivery_logs(campaign_id);
CREATE INDEX idx_delivery_logs_subscriber ON delivery_logs(subscriber_id);
CREATE INDEX idx_delivery_logs_resend_id ON delivery_logs(resend_id);
CREATE INDEX idx_delivery_logs_sequence ON delivery_logs(sequence_id);
CREATE INDEX idx_delivery_logs_sequence_step ON delivery_logs(sequence_step_id);

-- Step 6: Create click_events table
CREATE TABLE click_events (
  id TEXT PRIMARY KEY,
  delivery_log_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  clicked_url TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (delivery_log_id) REFERENCES delivery_logs(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

-- Step 7: Create indexes for click_events
CREATE INDEX idx_click_events_delivery_log ON click_events(delivery_log_id);
CREATE INDEX idx_click_events_subscriber ON click_events(subscriber_id);
CREATE INDEX idx_click_events_clicked_at ON click_events(clicked_at);
