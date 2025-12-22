export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  ADMIN_API_KEY: string;
  ALLOWED_ORIGIN: string;
  SENDER_EMAIL: string;
  SENDER_NAME: string;
  SITE_URL: string;
}

export interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: 'pending' | 'active' | 'unsubscribed';
  confirm_token: string | null;
  unsubscribe_token: string | null;
  subscribed_at: number | null;
  unsubscribed_at: number | null;
  created_at: number;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sent' | 'failed';
export type ScheduleType = 'none' | 'daily' | 'weekly' | 'monthly';

export interface ScheduleConfig {
  hour?: number;
  minute?: number;
  dayOfWeek?: number;  // 0-6 (Sunday-Saturday)
  dayOfMonth?: number; // 1-31
}

export interface Campaign {
  id: string;
  subject: string;
  content: string;
  status: CampaignStatus;
  scheduled_at: number | null;
  schedule_type: ScheduleType | null;
  schedule_config: string | null;  // JSON string of ScheduleConfig
  last_sent_at: number | null;
  sent_at: number | null;
  recipient_count: number | null;
  created_at: number;
}

export interface SubscribeRequest {
  email: string;
  name?: string;
  turnstileToken: string;
}

export interface BroadcastRequest {
  subject: string;
  content: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
