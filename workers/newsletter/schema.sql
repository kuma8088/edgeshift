-- Newsletter subscribers table
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  confirm_token TEXT,
  unsubscribe_token TEXT,
  signup_page_slug TEXT,
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
  contact_list_id TEXT REFERENCES contact_lists(id) ON DELETE SET NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Delivery logs table (Phase 2 + Phase 3B tracking foundation)
-- campaign_id is nullable for sequence emails
-- sequence_id/sequence_step_id are set for sequence emails
CREATE TABLE IF NOT EXISTS delivery_logs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  sequence_id TEXT,
  sequence_step_id TEXT,
  subscriber_id TEXT NOT NULL,
  email TEXT NOT NULL,
  email_subject TEXT,  -- Preserved at send time for historical reference
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
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

CREATE INDEX IF NOT EXISTS idx_delivery_logs_campaign ON delivery_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_subscriber ON delivery_logs(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_status ON delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_resend_id ON delivery_logs(resend_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_sequence ON delivery_logs(sequence_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_sequence_step ON delivery_logs(sequence_step_id);

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
  is_enabled INTEGER DEFAULT 1,  -- Soft delete: 0 = disabled, 1 = enabled
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

-- Click events table (全クリック記録)
CREATE TABLE IF NOT EXISTS click_events (
  id TEXT PRIMARY KEY,
  delivery_log_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  clicked_url TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (delivery_log_id) REFERENCES delivery_logs(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX IF NOT EXISTS idx_click_events_delivery_log ON click_events(delivery_log_id);
CREATE INDEX IF NOT EXISTS idx_click_events_subscriber ON click_events(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at ON click_events(clicked_at);

-- Contact Lists table (Batch 4C)
CREATE TABLE IF NOT EXISTS contact_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Contact List Members table (many-to-many join)
CREATE TABLE IF NOT EXISTS contact_list_members (
  id TEXT PRIMARY KEY,
  contact_list_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  added_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(contact_list_id, subscriber_id),
  FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clm_list ON contact_list_members(contact_list_id);
CREATE INDEX IF NOT EXISTS idx_clm_subscriber ON contact_list_members(subscriber_id);

-- Signup Page Generation (Batch 4A)
CREATE TABLE IF NOT EXISTS signup_pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  sequence_id TEXT,
  contact_list_id TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),

  FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_pages_slug ON signup_pages(slug);
CREATE INDEX IF NOT EXISTS idx_signup_pages_sequence ON signup_pages(sequence_id);
