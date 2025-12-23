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
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'pending',
      confirm_token TEXT,
      unsubscribe_token TEXT,
      subscribed_at INTEGER,
      unsubscribed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS campaigns (
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
    );

    CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT,
      subscriber_id TEXT,
      status TEXT,
      sent_at INTEGER,
      opened_at INTEGER,
      clicked_at INTEGER
    );
  `);
}

export async function cleanupTestDb() {
  await env.DB.exec('DELETE FROM delivery_logs');
  await env.DB.exec('DELETE FROM campaigns');
  await env.DB.exec('DELETE FROM subscribers');
}
