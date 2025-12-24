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

export async function createCampaign(data: { subject: string; content: string; scheduled_at?: number }) {
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
  return apiRequest('/sequences');
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
