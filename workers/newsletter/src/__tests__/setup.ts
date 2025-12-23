import { env } from 'cloudflare:test';

export function getTestEnv() {
  return {
    DB: env.DB,
    RESEND_API_KEY: 'test-api-key',
    TURNSTILE_SECRET_KEY: 'test-turnstile-key',
    ADMIN_API_KEY: 'test-admin-key',
    ALLOWED_ORIGIN: 'http://localhost:4321',
    SENDER_EMAIL: 'test@example.com',
    SENDER_NAME: 'Test Newsletter',
    SITE_URL: 'http://localhost:4321',
  };
}

export async function setupTestDb() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS subscribers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'pending',
      confirm_token TEXT,
      unsubscribe_token TEXT,
      subscribed_at INTEGER,
      unsubscribed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      scheduled_at INTEGER,
      schedule_type TEXT,
      schedule_config TEXT,
      last_sent_at INTEGER,
      sent_at INTEGER,
      recipient_count INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_logs (
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
    )`)
  ]);
}

export async function cleanupTestDb() {
  // Delete in order respecting foreign keys (child first)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM delivery_logs'),
    env.DB.prepare('DELETE FROM campaigns'),
    env.DB.prepare('DELETE FROM subscribers')
  ]);
}
