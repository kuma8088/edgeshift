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
  ADMIN_EMAIL?: string; // Optional: for milestone achievement notifications
  RATE_LIMIT_KV?: KVNamespace; // Optional: only required when rate limiting is enabled
}

export interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: 'pending' | 'active' | 'unsubscribed';
  confirm_token: string | null;
  unsubscribe_token: string | null;
  signup_page_slug: string | null;
  subscribed_at: number | null;
  unsubscribed_at: number | null;
  created_at: number;
  // Referral program fields
  referral_code: string | null;
  referred_by: string | null;
  referral_count: number;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sent' | 'failed';
export type ScheduleType = 'none' | 'daily' | 'weekly' | 'monthly';
export type DeliveryStatus = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
export type AbVariant = 'A' | 'B';
export type AbTestStatus = 'pending' | 'testing' | 'determined';

// A/B Testing types
export interface AbVariantStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
  score: number;
}

export interface AbTestStats {
  variant_a: AbVariantStats;
  variant_b: AbVariantStats;
  winner: AbVariant | null;
  status: AbTestStatus;
}

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
  contact_list_id: string | null;
  template_id: string | null;
  slug: string;
  excerpt: string;
  is_published: number;  // 0 or 1
  created_at: number;
  // A/B Testing fields
  ab_test_enabled: number;  // 0 or 1
  ab_subject_b: string | null;
  ab_from_name_b: string | null;
  ab_wait_hours: number | null;
  ab_test_sent_at: string | null;
  ab_winner: 'A' | 'B' | null;
}

export interface DeliveryLog {
  id: string;
  campaign_id: string | null;
  sequence_id: string | null;
  sequence_step_id: string | null;
  subscriber_id: string;
  email: string;
  email_subject: string | null;  // Preserved at send time for historical reference
  status: DeliveryStatus;
  resend_id: string | null;
  sent_at: number | null;
  delivered_at: number | null;
  opened_at: number | null;
  clicked_at: number | null;
  error_message: string | null;
  created_at: number;
  // A/B Testing field
  ab_variant: 'A' | 'B' | null;
}

export interface ClickEvent {
  id: string;
  delivery_log_id: string;
  subscriber_id: string;
  clicked_url: string;
  clicked_at: number;
  created_at: number;
}

export interface SubscribeRequest {
  email: string;
  name?: string;
  turnstileToken: string;
  sequenceId?: string;
  signupPageSlug?: string;
  ref?: string;  // Referral code
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
  contact_list_id?: string;
  template_id?: string;
  slug?: string;
  excerpt?: string;
  is_published?: boolean;
}

export interface UpdateCampaignRequest {
  subject?: string;
  content?: string;
  status?: CampaignStatus;
  contact_list_id?: string;
  template_id?: string;
  slug?: string;
  excerpt?: string;
  is_published?: boolean;
}

export interface Sequence {
  id: string;
  name: string;
  description: string | null;
  default_send_time: string; // "HH:MM" format, JST
  is_active: number;
  created_at: number;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_days: number;
  delay_time?: string; // "HH:MM" format, JST (optional override)
  delay_minutes?: number | null; // NULL = use delay_days/delay_time, 0 = immediate, >0 = delay in minutes
  subject: string;
  content: string;
  template_id: string | null;
  is_enabled: number;  // Soft delete: 0 = disabled, 1 = enabled
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

export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface ContactListMember {
  id: string;
  contact_list_id: string;
  subscriber_id: string;
  added_at: number;
}

export interface AddMembersRequest {
  subscriber_ids: string[];
}

export interface CreateContactListRequest {
  name: string;
  description?: string;
}

export interface UpdateContactListRequest {
  name?: string;
  description?: string;
}

export interface AddMembersRequest {
  subscriber_ids: string[];
}

export interface CreateSequenceRequest {
  name: string;
  description?: string;
  default_send_time: string; // Required, "HH:MM" format
  steps: {
    delay_days: number;
    delay_time?: string; // Optional, "HH:MM" format
    delay_minutes?: number | null; // NULL = use delay_days/delay_time, 0 = immediate, >0 = delay in minutes
    subject: string;
    content: string;
    template_id?: string;
  }[];
}

export interface UpdateSequenceRequest {
  name?: string;
  description?: string;
  default_send_time?: string;
  is_active?: number;
  steps?: {
    delay_days: number;
    delay_time?: string;
    delay_minutes?: number | null; // NULL = use delay_days/delay_time, 0 = immediate, >0 = delay in minutes
    subject: string;
    content: string;
    template_id?: string;
  }[];
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
  | 'email.delivery_delayed'
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained'
  | 'email.failed';

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
      message: string;
    };
    // Additional optional fields
    broadcast_id?: string;
    template_id?: string;
    tags?: Record<string, string>;
  };
}

// Signup Page (Batch 4A + 4B)
export type PageType = 'landing' | 'embed';
export type EmbedTheme = 'light' | 'dark';
export type EmbedSize = 'compact' | 'full';

export interface SignupPage {
  id: string;
  slug: string;
  sequence_id: string | null;
  contact_list_id: string | null;
  title: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;

  // Page type (Batch 4B)
  page_type: PageType;

  // Form customization (shared)
  button_text: string;
  form_fields: string;
  email_label: string;
  email_placeholder: string;
  name_label: string;
  name_placeholder: string;
  success_message: string;

  // Landing page only
  pending_title: string;
  pending_message: string;
  confirmed_title: string;
  confirmed_message: string;

  // Embed page only
  embed_theme: EmbedTheme;
  embed_size: EmbedSize;

  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateSignupPageRequest {
  slug: string;
  sequence_id?: string;
  contact_list_id?: string;
  title: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  page_type?: PageType;
  button_text?: string;
  form_fields?: string;
  email_label?: string;
  email_placeholder?: string;
  name_label?: string;
  name_placeholder?: string;
  success_message?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
  embed_theme?: EmbedTheme;
  embed_size?: EmbedSize;
}

export interface UpdateSignupPageRequest {
  slug?: string;
  sequence_id?: string;
  contact_list_id?: string;
  title?: string;
  content?: string;
  meta_title?: string;
  meta_description?: string;
  page_type?: PageType;
  button_text?: string;
  form_fields?: string;
  email_label?: string;
  email_placeholder?: string;
  name_label?: string;
  name_placeholder?: string;
  success_message?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
  embed_theme?: EmbedTheme;
  embed_size?: EmbedSize;
}

// Archive API types
export interface ArchiveArticle {
  id: string;
  slug: string;
  subject: string;
  excerpt: string;
  published_at: number;
  is_subscriber_only: boolean; // Future use
}

export interface ArchiveListResponse {
  articles: ArchiveArticle[];
  pagination: {
    page: number;
    total_pages: number;
    total_count: number;
  };
}

export interface ArchiveDetailResponse {
  id: string;
  slug: string;
  subject: string;
  content: string;
  published_at: number;
}

// Referral Program types
export type RewardType = 'badge' | 'discount' | 'content' | 'custom';

export interface ReferralMilestone {
  id: string;
  threshold: number;
  name: string;
  description: string | null;
  reward_type: RewardType | null;
  reward_value: string | null;
  created_at: number;
}

export interface ReferralAchievement {
  id: string;
  subscriber_id: string;
  milestone_id: string;
  achieved_at: number;
  notified_at: number | null;
}

export interface CreateMilestoneRequest {
  threshold: number;
  name: string;
  description?: string;
  reward_type?: RewardType;
  reward_value?: string;
}

export interface UpdateMilestoneRequest {
  threshold?: number;
  name?: string;
  description?: string;
  reward_type?: RewardType;
  reward_value?: string;
}

export interface ReferralDashboardResponse {
  referral_code: string;
  referral_link: string;
  referral_count: number;
  achievements: {
    id: string;
    milestone_name: string;
    threshold: number;
    achieved_at: number;
    reward_type: string | null;
    reward_value: string | null;
  }[];
  next_milestone?: {
    name: string;
    threshold: number;
    remaining: number;
  };
}

export interface ReferralStatsResponse {
  total_referrals: number;
  active_referrers: number;
  top_referrers: {
    id: string;
    email: string;
    referral_count: number;
  }[];
}

// Email Templates (Brand Settings)
export interface BrandSettings {
  id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string;
  default_template_id: string;
  created_at: number;
  updated_at: number;
}

export interface UpdateBrandSettingsRequest {
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
  footer_text?: string;
  default_template_id?: string;
}

export type TemplateId = 'simple' | 'newsletter' | 'announcement' | 'welcome' | 'product-update';

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
}

export interface PreviewRequest {
  template_id: string;
  content: string;
  subject: string;
  brand_settings?: Partial<BrandSettings>;
}

export interface TestSendRequest {
  template_id: string;
  content: string;
  subject: string;
  to: string;
}
