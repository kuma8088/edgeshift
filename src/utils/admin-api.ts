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
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, error: 'Not authenticated' };
  }

  const { method = 'GET', body } = options;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        clearApiKey();
        return { success: false, error: 'Authentication failed. Please login again.' };
      }
      return { success: false, error: data.error || `Request failed: ${response.status}` };
    }

    return data;
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
}

export async function createCampaign(data: CreateCampaignData) {
  return apiRequest('/campaigns', { method: 'POST', body: data });
}

export async function updateCampaign(id: string, data: { subject?: string; content?: string; status?: string }) {
  return apiRequest(`/campaigns/${id}`, { method: 'PUT', body: data });
}

export async function deleteCampaign(id: string) {
  return apiRequest(`/campaigns/${id}`, { method: 'DELETE' });
}

export async function sendCampaign(id: string) {
  return apiRequest(`/campaigns/${id}/send`, { method: 'POST' });
}

export async function getCampaignStats(id: string) {
  return apiRequest(`/campaigns/${id}/stats`);
}

// Sequences
export interface Sequence {
  id: string;
  name: string;
  description?: string;
  is_active: number;
  default_send_time?: string;
  steps: {
    delay_days: number;
    delay_time?: string;
    subject: string;
    content: string;
  }[];
  created_at: number;
  updated_at?: number;
}

interface CreateSequenceData {
  name: string;
  description?: string;
  default_send_time: string;
  steps: {
    delay_days: number;
    delay_time?: string;
    subject: string;
    content: string;
  }[];
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
  steps?: { delay_days: number; delay_time?: string; subject: string; content: string }[];
}) {
  return apiRequest(`/sequences/${id}`, { method: 'PUT', body: data });
}

export async function deleteSequence(id: string) {
  return apiRequest(`/sequences/${id}`, { method: 'DELETE' });
}

// Subscribers
export async function listSubscribers(params?: { status?: string; limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());
  const queryString = query.toString();
  return apiRequest(`/newsletter/subscribers${queryString ? `?${queryString}` : ''}`);
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
