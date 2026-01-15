import { env } from 'cloudflare:test';

export function getTestEnv() {
  // Create a proper whsec_ format secret (whsec_ + base64 encoded key)
  const rawKey = 'test_secret_key_12345_bytes!';
  const webhookSecret = 'whsec_' + btoa(rawKey);

  return {
    DB: env.DB,
    RESEND_API_KEY: 'test-api-key',
    TURNSTILE_SECRET_KEY: 'test-turnstile-key',
    ADMIN_API_KEY: 'test-admin-key',
    ALLOWED_ORIGIN: 'http://localhost:4321',
    SENDER_EMAIL: 'test@example.com',
    SENDER_NAME: 'Test Newsletter',
    SITE_URL: 'http://localhost:4321',
    RESEND_WEBHOOK_SECRET: webhookSecret,
    // RATE_LIMIT_KV is NOT included by default
    // Tests that need rate limiting must provide it explicitly
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
      signup_page_slug TEXT,
      subscribed_at INTEGER,
      unsubscribed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      referral_count INTEGER DEFAULT 0,
      resend_contact_id TEXT
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
      contact_list_id TEXT,
      template_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      slug TEXT UNIQUE,
      is_published INTEGER DEFAULT 0,
      published_at INTEGER,
      excerpt TEXT,
      ab_test_enabled INTEGER DEFAULT 0,
      ab_subject_b TEXT,
      ab_from_name_b TEXT,
      ab_wait_hours INTEGER DEFAULT 4,
      ab_test_sent_at TEXT,
      ab_winner TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      campaign_id TEXT,
      sequence_id TEXT,
      sequence_step_id TEXT,
      subscriber_id TEXT NOT NULL,
      email TEXT NOT NULL,
      email_subject TEXT,
      status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
      resend_id TEXT,
      sent_at INTEGER,
      delivered_at INTEGER,
      opened_at INTEGER,
      clicked_at INTEGER,
      error_message TEXT,
      ab_variant TEXT CHECK (ab_variant IN ('A', 'B')),
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      default_send_time TEXT NOT NULL DEFAULT '10:00',
      created_at INTEGER DEFAULT (unixepoch())
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sequence_steps (
      id TEXT PRIMARY KEY,
      sequence_id TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      delay_days INTEGER NOT NULL,
      delay_time TEXT,
      delay_minutes INTEGER DEFAULT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      template_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS subscriber_sequences (
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
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS click_events (
      id TEXT PRIMARY KEY,
      delivery_log_id TEXT NOT NULL,
      subscriber_id TEXT NOT NULL,
      clicked_url TEXT NOT NULL,
      clicked_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (delivery_log_id) REFERENCES delivery_logs(id),
      FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS signup_pages (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      meta_title TEXT,
      meta_description TEXT,
      sequence_id TEXT,
      contact_list_id TEXT,
      page_type TEXT DEFAULT 'landing',
      button_text TEXT DEFAULT '登録する',
      form_fields TEXT DEFAULT 'email,name',
      email_label TEXT DEFAULT 'メールアドレス',
      email_placeholder TEXT DEFAULT 'example@email.com',
      name_label TEXT DEFAULT 'お名前',
      name_placeholder TEXT DEFAULT '山田 太郎',
      success_message TEXT DEFAULT '確認メールを送信しました',
      pending_title TEXT DEFAULT '確認メールを送信しました',
      pending_message TEXT DEFAULT 'メール内のリンクをクリックして登録を完了してください。',
      confirmed_title TEXT DEFAULT '登録が完了しました',
      confirmed_message TEXT DEFAULT 'ニュースレターへのご登録ありがとうございます。',
      embed_theme TEXT DEFAULT 'light',
      embed_size TEXT DEFAULT 'full',
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (sequence_id) REFERENCES sequences(id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS contact_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS contact_list_members (
      id TEXT PRIMARY KEY,
      contact_list_id TEXT NOT NULL,
      subscriber_id TEXT NOT NULL,
      added_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (contact_list_id) REFERENCES contact_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
      UNIQUE(contact_list_id, subscriber_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_milestones (
      id TEXT PRIMARY KEY,
      threshold INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      reward_type TEXT CHECK (reward_type IN ('badge', 'discount', 'content', 'custom')),
      reward_value TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_achievements (
      id TEXT PRIMARY KEY,
      subscriber_id TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      achieved_at INTEGER NOT NULL,
      notified_at INTEGER,
      FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
      FOREIGN KEY (milestone_id) REFERENCES referral_milestones(id) ON DELETE CASCADE,
      UNIQUE(subscriber_id, milestone_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS brand_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      logo_url TEXT,
      primary_color TEXT DEFAULT '#7c3aed',
      secondary_color TEXT DEFAULT '#1e1e1e',
      footer_text TEXT DEFAULT 'EdgeShift Newsletter',
      default_template_id TEXT DEFAULT 'simple',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ab_test_remaining (
      campaign_id TEXT PRIMARY KEY,
      subscriber_ids TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`)
  ]);
}

export async function cleanupTestDb() {
  // Delete in order respecting foreign keys (child first)
  // Use WHERE 1=1 to make it valid even if table is empty
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM click_events WHERE 1=1'),
      env.DB.prepare('DELETE FROM delivery_logs WHERE 1=1'),
      env.DB.prepare('DELETE FROM subscriber_sequences WHERE 1=1'),
      env.DB.prepare('DELETE FROM sequence_steps WHERE 1=1'),
      env.DB.prepare('DELETE FROM sequences WHERE 1=1'),
      env.DB.prepare('DELETE FROM ab_test_remaining WHERE 1=1'),
      env.DB.prepare('DELETE FROM campaigns WHERE 1=1'),
      env.DB.prepare('DELETE FROM contact_list_members WHERE 1=1'),
      env.DB.prepare('DELETE FROM referral_achievements WHERE 1=1'),
      env.DB.prepare('DELETE FROM subscribers WHERE 1=1'),
      env.DB.prepare('DELETE FROM signup_pages WHERE 1=1'),
      env.DB.prepare('DELETE FROM contact_lists WHERE 1=1'),
      env.DB.prepare('DELETE FROM referral_milestones WHERE 1=1'),
      env.DB.prepare('DELETE FROM brand_settings WHERE 1=1')
    ]);
  } catch (error) {
    // Ignore errors during cleanup - tables might not exist yet
    console.log('Cleanup error (non-critical):', error);
  }
}
