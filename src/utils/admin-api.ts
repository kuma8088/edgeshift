const API_BASE = import.meta.env.PUBLIC_NEWSLETTER_API_URL || 'https://edgeshift.tech/api';
const API_KEY_STORAGE_KEY = 'edgeshift_admin_api_key';

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function clearApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  return getApiKey() !== null;
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function apiRequest<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const { method = 'GET', body } = options;

  // Build headers - only include Authorization if API key is present
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiKey = getApiKey();
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      credentials: 'include', // Include session cookies for session-based auth
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 204 No Content (common for DELETE endpoints)
    if (response.status === 204) {
      return { success: true, data: undefined as unknown as T };
    }

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        clearApiKey();
        return { success: false, error: 'Authentication failed. Please login again.' };
      }
      return { success: false, error: data.error || `Request failed: ${response.status}` };
    }

    // Normalize response format: some endpoints (e.g., AI) return raw data
    // while others return { success: true, data }
    if (typeof data === 'object' && data !== null) {
      // Already in standard format
      if ('success' in data) {
        return data;
      }
      // Check for error field in 200 response (some endpoints return { error: ... } with 200)
      if ('error' in data && typeof data.error === 'string') {
        return { success: false, error: data.error };
      }
    }
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}

// Dashboard
export async function getDashboardStats() {
  return apiRequest<{
    subscribers: { total: number; active: number; pending: number; unsubscribed: number };
    campaigns: { total: number; draft: number; scheduled: number; sent: number };
    delivery: { total: number; delivered: number; opened: number; clicked: number; openRate: number; clickRate: number };
    sequences: { total: number; active: number; totalEnrolled: number; completed: number };
  }>('/dashboard/stats');
}

// Campaigns
export async function listCampaigns(params?: { status?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const queryString = query.toString();
  return apiRequest(`/campaigns${queryString ? `?${queryString}` : ''}`);
}

export async function getCampaign(id: string) {
  return apiRequest(`/campaigns/${id}`);
}

export interface CreateCampaignData {
  subject: string;
  content: string;
  scheduled_at?: number;
  contact_list_id?: string;
  template_id?: string;
  slug?: string;
  is_published?: boolean;
  excerpt?: string;
  reply_to?: string;
}

export async function createCampaign(data: CreateCampaignData) {
  return apiRequest('/campaigns', { method: 'POST', body: data });
}

export async function updateCampaign(id: string, data: { subject?: string; content?: string; status?: string; contact_list_id?: string; template_id?: string; slug?: string; is_published?: boolean; excerpt?: string; reply_to?: string }) {
  return apiRequest(`/campaigns/${id}`, { method: 'PUT', body: data });
}

export async function deleteCampaign(id: string) {
  return apiRequest(`/campaigns/${id}`, { method: 'DELETE' });
}

export async function copyCampaign(id: string) {
  return apiRequest(`/campaigns/${id}/copy`, { method: 'POST' });
}

export async function sendCampaign(id: string) {
  return apiRequest(`/campaigns/${id}/send`, { method: 'POST' });
}

export async function getCampaignStats(id: string) {
  return apiRequest(`/campaigns/${id}/stats`);
}

// Sequences
export interface SequenceStep {
  delay_days: number;
  delay_time?: string;
  delay_minutes?: number | null;
  subject: string;
  content: string;
  template_id?: string;
}

export interface Sequence {
  id: string;
  name: string;
  description?: string;
  is_active: number;
  default_send_time?: string;
  steps: SequenceStep[];
  created_at: number;
  updated_at?: number;
}

interface CreateSequenceData {
  name: string;
  description?: string;
  default_send_time: string;
  steps: SequenceStep[];
}

export async function listSequences() {
  return apiRequest<{ sequences: Sequence[] }>('/sequences');
}

export async function getSequences() {
  return listSequences();
}

export async function getSequence(id: string) {
  return apiRequest(`/sequences/${id}`);
}

export async function createSequence(data: CreateSequenceData) {
  return apiRequest('/sequences', { method: 'POST', body: data });
}

export async function updateSequence(id: string, data: {
  name?: string;
  description?: string;
  is_active?: number;
  default_send_time?: string;
  steps?: SequenceStep[];
}) {
  return apiRequest(`/sequences/${id}`, { method: 'PUT', body: data });
}

export async function deleteSequence(id: string) {
  return apiRequest(`/sequences/${id}`, { method: 'DELETE' });
}

// Subscribers
export interface Subscriber {
  id: string;
  email: string;
  name?: string;
  status: string;
  subscribed_at?: number;
  unsubscribed_at?: number;
  created_at: number;
}

export async function listSubscribers(params?: { status?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const queryString = query.toString();
  return apiRequest(`/newsletter/subscribers${queryString ? `?${queryString}` : ''}`);
}

export async function getSubscriber(id: string) {
  return apiRequest<{ subscriber: Subscriber }>(`/subscribers/${id}`);
}

export async function updateSubscriber(id: string, data: { name?: string; status?: string }) {
  return apiRequest<{ subscriber: Subscriber }>(`/subscribers/${id}`, { method: 'PUT', body: data });
}

// Tracking
export async function getCampaignTracking(id: string) {
  return apiRequest(`/campaigns/${id}/tracking`);
}

export async function getCampaignClicks(id: string) {
  return apiRequest(`/campaigns/${id}/clicks`);
}

export async function getSequenceStats(id: string) {
  return apiRequest(`/sequences/${id}/stats`);
}

export async function getSequenceSubscribers(id: string) {
  return apiRequest(`/sequences/${id}/subscribers`);
}

export async function getSubscriberEngagement(id: string) {
  return apiRequest(`/subscribers/${id}/engagement`);
}

// Analytics
export async function getAnalyticsOverview() {
  return apiRequest('/analytics/overview');
}

// Signup Pages API
export type PageType = 'landing' | 'embed';

export interface SignupPage {
  id: string;
  slug: string;
  sequence_id: string | null;
  contact_list_id: string | null;
  title: string;
  content: string;
  button_text: string;
  form_fields: string;
  theme: string;
  page_type: PageType;
  pending_title: string;
  pending_message: string;
  confirmed_title: string;
  confirmed_message: string;
  embed_theme: 'light' | 'dark';
  embed_size: 'compact' | 'full';
  email_label: string;
  email_placeholder: string;
  name_label: string;
  name_placeholder: string;
  success_message: string;
  meta_title: string;
  meta_description: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateSignupPageData {
  slug: string;
  sequence_id?: string;
  contact_list_id?: string;
  title: string;
  content: string;
  page_type?: PageType;
  button_text?: string;
  form_fields?: string;
  theme?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
  embed_theme?: 'light' | 'dark';
  embed_size?: 'compact' | 'full';
  email_label?: string;
  email_placeholder?: string;
  name_label?: string;
  name_placeholder?: string;
  success_message?: string;
  meta_title?: string;
  meta_description?: string;
}

export interface UpdateSignupPageData {
  slug?: string;
  sequence_id?: string;
  contact_list_id?: string;
  title?: string;
  content?: string;
  page_type?: PageType;
  button_text?: string;
  form_fields?: string;
  theme?: string;
  pending_title?: string;
  pending_message?: string;
  confirmed_title?: string;
  confirmed_message?: string;
  embed_theme?: 'light' | 'dark';
  embed_size?: 'compact' | 'full';
  email_label?: string;
  email_placeholder?: string;
  name_label?: string;
  name_placeholder?: string;
  success_message?: string;
  meta_title?: string;
  meta_description?: string;
}

export async function getSignupPages() {
  return apiRequest<{ pages: SignupPage[] }>('/signup-pages');
}

export async function getSignupPage(id: string) {
  return apiRequest<{ page: SignupPage }>(`/signup-pages/${id}`);
}

export async function getSignupPageBySlug(slug: string) {
  return apiRequest<{ page: SignupPage }>(`/signup-pages/by-slug/${slug}`);
}

export async function createSignupPage(pageData: CreateSignupPageData) {
  return apiRequest<SignupPage>('/signup-pages', { method: 'POST', body: pageData });
}

export async function updateSignupPage(id: string, pageData: UpdateSignupPageData) {
  return apiRequest<{ page: SignupPage }>(`/signup-pages/${id}`, { method: 'PUT', body: pageData });
}

export async function deleteSignupPage(id: string) {
  return apiRequest<{ message: string }>(`/signup-pages/${id}`, { method: 'DELETE' });
}

// Contact Lists API (Batch 4C)
export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateContactListData {
  name: string;
  description?: string;
}

export async function getContactLists() {
  return apiRequest<{ lists: ContactList[] }>('/contact-lists');
}

export async function getContactList(id: string) {
  return apiRequest<{ list: ContactList }>(`/contact-lists/${id}`);
}

export async function createContactList(data: CreateContactListData) {
  return apiRequest<{ data: ContactList }>('/contact-lists', { method: 'POST', body: data });
}

export async function updateContactList(id: string, data: { name?: string; description?: string }) {
  return apiRequest<{ list: ContactList }>(`/contact-lists/${id}`, { method: 'PUT', body: data });
}

export async function deleteContactList(id: string) {
  return apiRequest<{ message: string }>(`/contact-lists/${id}`, { method: 'DELETE' });
}

// Member Management
export async function getListMembers(listId: string) {
  return apiRequest(`/contact-lists/${listId}/members`);
}

export async function addMembersToList(listId: string, subscriberIds: string[]) {
  return apiRequest(`/contact-lists/${listId}/members`, {
    method: 'POST',
    body: { subscriber_ids: subscriberIds },
  });
}

export async function removeMemberFromList(listId: string, subscriberId: string) {
  return apiRequest(`/contact-lists/${listId}/members/${subscriberId}`, { method: 'DELETE' });
}

export async function getSubscriberLists(subscriberId: string) {
  return apiRequest<{ lists: ContactList[] }>(`/subscribers/${subscriberId}/lists`);
}

export async function addSubscriberToList(subscriberId: string, listId: string) {
  return apiRequest(`/subscribers/${subscriberId}/lists`, {
    method: 'POST',
    body: { list_id: listId },
  });
}

export async function removeSubscriberFromList(subscriberId: string, listId: string) {
  return apiRequest(`/subscribers/${subscriberId}/lists/${listId}`, { method: 'DELETE' });
}

// Referral Program API
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

export interface CreateMilestoneData {
  threshold: number;
  name: string;
  description?: string;
  reward_type?: RewardType;
  reward_value?: string;
}

export interface UpdateMilestoneData {
  threshold?: number;
  name?: string;
  description?: string;
  reward_type?: RewardType;
  reward_value?: string;
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

export async function getMilestones() {
  return apiRequest<ReferralMilestone[]>('/admin/milestones');
}

export async function createMilestone(data: CreateMilestoneData) {
  return apiRequest<ReferralMilestone>('/admin/milestones', { method: 'POST', body: data });
}

export async function updateMilestone(id: string, data: UpdateMilestoneData) {
  return apiRequest<ReferralMilestone>(`/admin/milestones/${id}`, { method: 'PUT', body: data });
}

export async function deleteMilestone(id: string) {
  return apiRequest(`/admin/milestones/${id}`, { method: 'DELETE' });
}

export async function getReferralStats() {
  return apiRequest<ReferralStatsResponse>('/admin/referral-stats');
}

// Brand Settings API (Email Templates feature)
export interface BrandSettings {
  id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string;
  email_signature: string;
  default_template_id: string;
  created_at: number;
  updated_at: number;
}

export interface UpdateBrandSettingsData {
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
  footer_text?: string;
  email_signature?: string;
  default_template_id?: string;
}

export async function getBrandSettings() {
  return apiRequest<BrandSettings>('/brand-settings');
}

export async function updateBrandSettings(data: UpdateBrandSettingsData) {
  return apiRequest<BrandSettings>('/brand-settings', { method: 'PUT', body: data });
}

// Templates API (Email Templates feature)
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
}

export async function getTemplates() {
  return apiRequest<TemplateInfo[]>('/templates');
}

export interface PreviewTemplateData {
  template_id: string;
  content: string;
  subject?: string;
  brand_settings?: Partial<BrandSettings>;
}

export async function previewTemplate(data: PreviewTemplateData) {
  return apiRequest<{ html: string }>('/templates/preview', { method: 'POST', body: data });
}

export interface TestSendTemplateData {
  template_id: string;
  content: string;
  subject?: string;
  to: string;
}

export async function testSendTemplate(data: TestSendTemplateData) {
  return apiRequest<{ message_id: string }>('/templates/test-send', { method: 'POST', body: data });
}

/**
 * Send test email with template
 * Note: Uses same endpoint as testSendTemplate but with camelCase interface
 * Backend requires template_id, so templateId is effectively required
 * @see testSendTemplate for snake_case interface
 */
export interface SendTestEmailData {
  to: string;
  subject: string;
  content: string;
  templateId: string; // Required by backend
}

export async function sendTestEmail(data: SendTestEmailData) {
  return apiRequest<{ message_id: string }>('/templates/test-send', {
    method: 'POST',
    body: {
      to: data.to,
      subject: data.subject,
      content: data.content,
      template_id: data.templateId,
    },
  });
}

// Premium Payment APIs
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  plan_type: 'monthly' | 'yearly' | 'lifetime';
  stripe_price_id: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreatePlanData {
  name: string;
  description?: string;
  price_cents: number;
  plan_type: 'monthly' | 'yearly' | 'lifetime';
  stripe_price_id?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  product_type: 'pdf' | 'course' | 'other';
  stripe_price_id: string | null;
  download_url: string | null;
  external_url: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateProductData {
  name: string;
  description?: string;
  price_cents: number;
  product_type: 'pdf' | 'course' | 'other';
  stripe_price_id?: string;
  download_url?: string;
  external_url?: string;
}

// Plans
export async function listPlans() {
  return apiRequest<Plan[]>('/premium/plans');
}

export async function createPlan(data: CreatePlanData) {
  return apiRequest<Plan>('/premium/plans', { method: 'POST', body: data });
}

export async function updatePlan(id: string, data: Partial<CreatePlanData> & { is_active?: number }) {
  return apiRequest<{ success: boolean }>(`/premium/plans/${id}`, { method: 'PUT', body: data });
}

export async function deletePlan(id: string) {
  return apiRequest<{ success: boolean }>(`/premium/plans/${id}`, { method: 'DELETE' });
}

// Products
export async function listProducts() {
  return apiRequest<Product[]>('/premium/products');
}

export async function createProduct(data: CreateProductData) {
  return apiRequest<Product>('/premium/products', { method: 'POST', body: data });
}

export async function updateProduct(id: string, data: Partial<CreateProductData> & { is_active?: number }) {
  return apiRequest<{ success: boolean }>(`/premium/products/${id}`, { method: 'PUT', body: data });
}

export async function deleteProduct(id: string) {
  return apiRequest<{ success: boolean }>(`/premium/products/${id}`, { method: 'DELETE' });
}

// Subscriber Billing APIs
export interface SubscriptionWithSubscriber {
  id: string;
  subscriber_id: string;
  subscriber_email: string;
  subscriber_name: string | null;
  plan_id: string;
  plan_name: string;
  plan_type: string;
  stripe_subscription_id: string | null;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'lifetime';
  current_period_start: number | null;
  current_period_end: number | null;
  created_at: number;
}

export interface PaymentHistoryItem {
  id: string;
  subscriber_id: string;
  subscription_id: string | null;
  product_id: string | null;
  amount_cents: number;
  currency: string;
  payment_type: 'subscription' | 'one_time' | 'refund';
  status: string;
  created_at: number;
}

export interface PurchaseWithProduct {
  id: string;
  subscriber_id: string;
  product_id: string;
  product_name: string;
  product_type: string;
  status: 'pending' | 'completed' | 'refunded';
  access_token: string | null;
  created_at: number;
}

export interface SubscriberBillingInfo {
  subscriptions: SubscriptionWithSubscriber[];
  payments: PaymentHistoryItem[];
  purchases: PurchaseWithProduct[];
}

export async function listSubscriptions(params?: { status?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const queryString = query.toString();
  return apiRequest<SubscriptionWithSubscriber[]>(`/premium/subscriptions${queryString ? `?${queryString}` : ''}`);
}

export async function getSubscriberBilling(subscriberId: string) {
  return apiRequest<SubscriberBillingInfo>(`/premium/subscriptions/${subscriberId}`);
}

export async function refundSubscription(subscriptionId: string, reason?: string) {
  return apiRequest<{ success: boolean; refund_id: string }>(`/premium/subscriptions/${subscriptionId}/refund`, {
    method: 'POST',
    body: { reason },
  });
}

export async function refundPurchase(purchaseId: string, reason?: string) {
  return apiRequest<{ success: boolean; refund_id: string }>(`/premium/purchases/${purchaseId}/refund`, {
    method: 'POST',
    body: { reason },
  });
}

// AI Content Generation (Phase 11)
export interface AIGenerateResponse {
  content: string;
}

export interface AISuggestSubjectsResponse {
  subjects: string[];
}

export async function generateContent(prompt: string, maxTokens?: number) {
  return apiRequest<AIGenerateResponse>('/v1/ai/generate', {
    method: 'POST',
    body: { prompt, max_tokens: maxTokens },
  });
}

export async function suggestSubjects(topic: string, count: number = 5) {
  return apiRequest<AISuggestSubjectsResponse>('/v1/ai/suggest-subjects', {
    method: 'POST',
    body: { topic, count },
  });
}

// Tag types
export interface Tag {
  id: string;
  name: string;
  description: string | null;
  subscriber_count?: number;
  created_at: string;
}

// Tag API functions
export async function listTags() {
  return apiRequest<{ tags: Tag[] }>('/v1/tags');
}

export async function createTag(data: { name: string; description?: string }) {
  return apiRequest<{ tag: Tag }>('/v1/tags', {
    method: 'POST',
    body: data,
  });
}

export async function deleteTag(tagId: string) {
  return apiRequest<void>(`/v1/tags/${tagId}`, {
    method: 'DELETE',
  });
}

export async function getSubscriberTags(subscriberId: string) {
  return apiRequest<{ tags: Tag[] }>(`/v1/subscribers/${subscriberId}/tags`);
}

export async function addSubscriberTag(subscriberId: string, data: { tag_id?: string; tag_name?: string }) {
  return apiRequest<void>(`/v1/subscribers/${subscriberId}/tags`, {
    method: 'POST',
    body: data,
  });
}

export async function removeSubscriberTag(subscriberId: string, tagId: string) {
  return apiRequest<void>(`/v1/subscribers/${subscriberId}/tags/${tagId}`, {
    method: 'DELETE',
  });
}

// Import/Export API
export interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; email: string; reason: string }>;
}

export async function importSubscribers(
  file: File,
  contactListId?: string
): Promise<{ success: boolean; data?: ImportResult; error?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (contactListId) {
    formData.append('contact_list_id', contactListId);
  }

  const apiKey = getApiKey();
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(`${API_BASE}/subscribers/import`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Import failed' };
    }

    return data;
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}

export function getExportUrl(options?: {
  contactListId?: string;
  status?: 'active' | 'unsubscribed' | 'all';
}): string {
  const params = new URLSearchParams();
  if (options?.contactListId) {
    params.set('contact_list_id', options.contactListId);
  }
  if (options?.status) {
    params.set('status', options.status);
  }

  const queryString = params.toString();
  return `${API_BASE}/subscribers/export${queryString ? `?${queryString}` : ''}`;
}

// Image API
export interface ImageUploadResponse {
  url: string;
  filename: string;
}

export interface ImageInfo {
  key: string;
  url: string;
  uploaded: string;
  size: number;
}

export async function uploadImage(file: File): Promise<{ success: boolean; data?: ImageUploadResponse; error?: string }> {
  try {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/images/upload`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    // Check for non-JSON responses first
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      console.error('Unexpected response type:', contentType, 'status:', response.status);
      return { success: false, error: `Server error: ${response.status}` };
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('Failed to parse server response:', parseError);
      return { success: false, error: 'Invalid server response' };
    }

    if (!response.ok) {
      if (response.status === 401) {
        clearApiKey();
        return { success: false, error: 'Authentication failed' };
      }
      return { success: false, error: data.error || `Upload failed: ${response.status}` };
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}

/**
 * GET /api/images
 * List all uploaded images from R2 bucket
 */
export async function getImages(): Promise<{ success: boolean; data?: { images: ImageInfo[] }; error?: string }> {
  try {
    return await apiRequest<{ images: ImageInfo[] }>('/images');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: `Network error: ${message}` };
  }
}

// Mailserver API (for reply-to address selection)
// Proxied through newsletter worker to avoid CORS issues
// Note: MailUser type is also defined in workers/newsletter/src/types.ts
// Keep in sync when modifying

/**
 * Represents a mail user from the mailserver system.
 * @source External API: admin.kuma8088.com/api/mailserver/users
 */
export interface MailUser {
  id: number;
  email: string;
  domain_name: string;
  enabled: boolean;
}

export interface MailUserListResponse {
  users: MailUser[];
  total: number;
}

export async function listMailUsers(): Promise<{ success: boolean; data?: MailUserListResponse; error?: string }> {
  // Use the newsletter worker proxy endpoint to avoid CORS issues
  return apiRequest<MailUserListResponse>('/mailserver/users?enabled_only=true');
}
