export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  ADMIN_API_KEY: string;
  ALLOWED_ORIGIN: string;
  SENDER_EMAIL: string;
  SENDER_NAME: string;
  SITE_URL: string;
  RESEND_WEBHOOK_SECRET: string;
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
export type DeliveryStatus = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';

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

export interface DeliveryLog {
  id: string;
  campaign_id: string;
  subscriber_id: string;
  email: string;
  status: DeliveryStatus;
  resend_id: string | null;
  sent_at: number | null;
  delivered_at: number | null;
  opened_at: number | null;
  clicked_at: number | null;
  error_message: string | null;
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

export interface CreateCampaignRequest {
  subject: string;
  content: string;
  scheduled_at?: number;
  schedule_type?: ScheduleType;
  schedule_config?: ScheduleConfig;
}

export interface UpdateCampaignRequest {
  subject?: string;
  content?: string;
  status?: CampaignStatus;
  scheduled_at?: number;
  schedule_type?: ScheduleType;
  schedule_config?: ScheduleConfig;
}

export interface Sequence {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  created_at: number;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_days: number;
  subject: string;
  content: string;
  created_at: number;
}

export interface SubscriberSequence {
  id: string;
  subscriber_id: string;
  sequence_id: string;
  current_step: number;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
}

export interface CreateSequenceRequest {
  name: string;
  description?: string;
  steps: {
    delay_days: number;
    subject: string;
    content: string;
  }[];
}

export interface UpdateSequenceRequest {
  name?: string;
  description?: string;
  is_active?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Resend Webhook Event Types
export type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained';

export interface ResendWebhookEvent {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // Optional fields based on event type
    click?: {
      link: string;
      timestamp: string;
    };
    bounce?: {
      type: 'hard' | 'soft';
      message: string;
    };
  };
}
