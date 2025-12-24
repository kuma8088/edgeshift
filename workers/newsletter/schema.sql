-- Newsletter subscribers table
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  confirm_token TEXT,
  unsubscribe_token TEXT,
  subscribed_at INTEGER,
  unsubscribed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirm_token ON subscribers(confirm_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token ON subscribers(unsubscribe_token);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  -- Schedule fields (Phase 2)
  scheduled_at INTEGER,
  schedule_type TEXT CHECK (schedule_type IN ('none', 'daily', 'weekly', 'monthly')),
  schedule_config TEXT,
  last_sent_at INTEGER,
  -- Delivery results
  sent_at INTEGER,
  recipient_count INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Delivery logs table (Phase 2)
CREATE TABLE IF NOT EXISTS delivery_logs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  resend_id TEXT,
  sent_at INTEGER,
  delivered_at INTEGER,
  opened_at INTEGER,
  clicked_at INTEGER,
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_campaign ON delivery_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_subscriber ON delivery_logs(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_resend_id ON delivery_logs(resend_id);

-- Sequences table (for step emails)
CREATE TABLE IF NOT EXISTS sequences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  default_send_time TEXT NOT NULL DEFAULT '10:00',
  created_at INTEGER DEFAULT (unixepoch())
);

-- Sequence steps table
CREATE TABLE IF NOT EXISTS sequence_steps (
  id TEXT PRIMARY KEY,
  sequence_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL,
  delay_time TEXT,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id);

-- Subscriber sequences (progress tracking)
CREATE TABLE IF NOT EXISTS subscriber_sequences (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  sequence_id TEXT NOT NULL,
  current_step INTEGER DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE,
  UNIQUE(subscriber_id, sequence_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriber_sequences_subscriber ON subscriber_sequences(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_subscriber_sequences_sequence ON subscriber_sequences(sequence_id);
