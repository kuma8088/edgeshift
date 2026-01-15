/**
 * Resend Marketing API Service
 *
 * This module provides functions for interacting with Resend's Marketing API.
 * Design principles:
 * - D1 is master, Resend is cache (lazy sync)
 * - Contacts created on first broadcast send, not on subscription
 * - Temporary segments used for broadcast targeting
 */

import type { ResendContact, ResendSegment } from '../types';

// ============================================================================
// Configuration Types
// ============================================================================

export interface ResendMarketingConfig {
  apiKey: string;
  /** Default audience/segment ID for contacts */
  defaultSegmentId?: string;
}

export interface CreateContactResult {
  success: boolean;
  contactId?: string;
  error?: string;
  /** Whether the contact already existed */
  existed?: boolean;
}

export interface CreateSegmentResult {
  success: boolean;
  segmentId?: string;
  error?: string;
}

export interface CreateBroadcastResult {
  success: boolean;
  broadcastId?: string;
  error?: string;
}

export interface BroadcastOptions {
  segmentId: string;
  from: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Internal name for the broadcast */
  name?: string;
}

// ============================================================================
// Constants
// ============================================================================

const RESEND_API_BASE = 'https://api.resend.com';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ============================================================================
// Utility Functions
// ============================================================================

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resend rate limit delay constant - exported for use in other modules
// Resend default rate limit: 2 requests/second = 500ms minimum
export const RESEND_RATE_LIMIT_DELAY_MS = 550;

/**
 * Split a full name into firstName and lastName.
 * Handles various cases:
 * - "John Doe" -> { firstName: "John", lastName: "Doe" }
 * - "John" -> { firstName: "John", lastName: "" }
 * - "John Middle Doe" -> { firstName: "John", lastName: "Middle Doe" }
 * - null/undefined -> { firstName: "", lastName: "" }
 */
export function splitName(fullName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  if (!fullName || fullName.trim() === '') {
    return { firstName: '', lastName: '' };
  }

  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
}

/**
 * Fetch with retry logic and exponential backoff.
 * Retries on:
 * - 5xx server errors
 * - 429 rate limit errors (with longer delay)
 * - Network failures
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Success or non-retryable client error
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return response;
      }

      // Handle rate limiting (429)
      if (response.status === 429) {
        const responseBody = await response.json().catch(() => ({}));
        const retryAfter = response.headers.get('Retry-After');
        const parsedRetryAfter = retryAfter ? parseInt(retryAfter, 10) : NaN;
        const delayMs = !isNaN(parsedRetryAfter)
          ? parsedRetryAfter * 1000
          : RETRY_DELAY_MS * Math.pow(2, attempt + 2); // Longer delay for rate limits

        console.warn(`Rate limited by Resend API`, {
          attempt: attempt + 1,
          maxRetries,
          retryAfterMs: delayMs,
          responseBody,
          url,
        });

        if (attempt < maxRetries - 1) {
          await sleep(delayMs);
          continue;
        }

        // Last attempt - set detailed error
        lastError = new Error(
          `Rate limited after ${maxRetries} attempts. Retry-After: ${retryAfter || 'not specified'}`
        );
      } else {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Exponential backoff for server errors
    if (attempt < maxRetries - 1) {
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// ============================================================================
// Contact Management
// ============================================================================

interface ResendContactResponse {
  object?: string;
  id?: string;
  error?: { message: string };
}

/**
 * Ensure a contact exists in Resend (lazy sync).
 * Creates the contact if it doesn't exist, or returns existing contact info.
 *
 * This implements the "D1 is master" pattern:
 * - D1 subscribers are the source of truth
 * - Resend contacts are synced lazily on first broadcast
 */
export async function ensureResendContact(
  config: ResendMarketingConfig,
  email: string,
  name?: string | null
): Promise<CreateContactResult> {
  const { firstName, lastName } = splitName(name);

  try {
    const response = await fetchWithRetry(`${RESEND_API_BASE}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        first_name: firstName,
        last_name: lastName,
        unsubscribed: false,
      }),
    });

    const responseText = await response.text();
    let result: ResendContactResponse;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      const preview = responseText.length > 100 ? responseText.slice(0, 100) + '...' : responseText;
      console.error('Failed to parse Resend API response', {
        status: response.status,
        responsePreview: preview,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return {
        success: false,
        error: `Invalid JSON response from Resend API (HTTP ${response.status}): ${preview}`,
      };
    }

    // 409 Conflict means contact already exists
    // Try to extract contactId from response if Resend provides it
    if (response.status === 409) {
      console.log(`Contact already exists: ${email}`, { responseId: result.id });
      return {
        success: true,
        existed: true,
        contactId: result.id, // May be undefined if Resend doesn't return it
      };
    }

    if (!response.ok || result.error) {
      console.error('Resend create contact error:', {
        status: response.status,
        error: result.error,
        email,
      });
      return {
        success: false,
        error: result.error?.message || `Failed to create contact (HTTP ${response.status})`,
      };
    }

    return {
      success: true,
      contactId: result.id,
      existed: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Contact creation error:', { error: errorMessage, email });
    return {
      success: false,
      error: `Contact creation error: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Segment Management
// ============================================================================

interface ResendSegmentResponse {
  id?: string;
  error?: { message: string };
}

/**
 * Create a temporary segment for broadcast targeting.
 * After the broadcast is sent, delete the segment with deleteSegment().
 */
export async function createTempSegment(
  config: ResendMarketingConfig,
  name: string
): Promise<CreateSegmentResult> {
  try {
    const response = await fetchWithRetry(`${RESEND_API_BASE}/segments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    const responseText = await response.text();
    let result: ResendSegmentResponse;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      const preview = responseText.length > 100 ? responseText.slice(0, 100) + '...' : responseText;
      console.error('Failed to parse Resend API response', {
        status: response.status,
        responsePreview: preview,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return {
        success: false,
        error: `Invalid JSON response from Resend API (HTTP ${response.status}): ${preview}`,
      };
    }

    if (!response.ok || result.error) {
      console.error('Resend create segment error:', {
        status: response.status,
        error: result.error,
        name,
      });
      return {
        success: false,
        error: result.error?.message || `Failed to create segment (HTTP ${response.status})`,
      };
    }

    return {
      success: true,
      segmentId: result.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Segment creation error:', { error: errorMessage, name });
    return {
      success: false,
      error: `Segment creation error: ${errorMessage}`,
    };
  }
}

interface AddContactToSegmentResponse {
  object?: string;
  id?: string;
  error?: { message: string };
}


/**
 * Add contacts to a segment in batch.
 * Contacts must be specified by contact ID (not email).
 *
 * Resend API: POST /contacts/segments/add
 * Body: { contactId, segmentId }
 */
export async function addContactsToSegment(
  config: ResendMarketingConfig,
  segmentId: string,
  contactIds: string[]
): Promise<{ success: boolean; added: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;

  // Process contacts one by one (Resend API doesn't support batch add to segment)
  for (let i = 0; i < contactIds.length; i++) {
    const contactId = contactIds[i];

    // Add delay between requests to avoid rate limiting (skip for first request)
    if (i > 0) {
      await sleep(RESEND_RATE_LIMIT_DELAY_MS);
    }

    try {
      const response = await fetchWithRetry(
        `${RESEND_API_BASE}/contacts/segments/add`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contactId,
            segmentId,
          }),
        }
      );

      const responseText = await response.text();
      let result: AddContactToSegmentResponse;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        const preview = responseText.length > 100 ? responseText.slice(0, 100) + '...' : responseText;
        console.error('Failed to parse Resend API response', {
          status: response.status,
          responsePreview: preview,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
        });
        errors.push(`${contactId}: Invalid JSON response (HTTP ${response.status}): ${preview}`);
        continue;
      }

      if (!response.ok || result.error) {
        errors.push(`${contactId}: ${result.error?.message || `HTTP ${response.status}`}`);
      } else {
        added++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${contactId}: ${errorMessage}`);
    }
  }

  return {
    success: errors.length === 0,
    added,
    errors,
  };
}

/**
 * Delete a segment (cleanup after broadcast).
 */
export async function deleteSegment(
  config: ResendMarketingConfig,
  segmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetchWithRetry(`${RESEND_API_BASE}/segments/${segmentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const error = (result as { error?: { message: string } }).error;
      console.error('Resend delete segment error:', {
        status: response.status,
        error,
        segmentId,
      });
      return {
        success: false,
        error: error?.message || `Failed to delete segment (HTTP ${response.status})`,
      };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Segment deletion error:', { error: errorMessage, segmentId });
    return {
      success: false,
      error: `Segment deletion error: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Broadcast Management
// ============================================================================

interface ResendBroadcastResponse {
  id?: string;
  error?: { message: string };
}

interface SendBroadcastResponse {
  id?: string;
  error?: { message: string };
}

/**
 * Create and send a broadcast to a segment.
 *
 * Workflow:
 * 1. Create broadcast (returns draft)
 * 2. Send broadcast
 */
export async function createAndSendBroadcast(
  config: ResendMarketingConfig,
  options: BroadcastOptions
): Promise<CreateBroadcastResult> {
  try {
    // Step 1: Create broadcast
    const createResponse = await fetchWithRetry(`${RESEND_API_BASE}/broadcasts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        segment_id: options.segmentId,
        from: options.from,
        subject: options.subject,
        html: options.html,
        reply_to: options.replyTo,
        name: options.name,
      }),
    });

    const createResponseText = await createResponse.text();
    let createResult: ResendBroadcastResponse;
    try {
      createResult = JSON.parse(createResponseText);
    } catch (parseError) {
      const preview = createResponseText.length > 100 ? createResponseText.slice(0, 100) + '...' : createResponseText;
      console.error('Failed to parse Resend API response', {
        status: createResponse.status,
        responsePreview: preview,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return {
        success: false,
        error: `Invalid JSON response from Resend API (HTTP ${createResponse.status}): ${preview}`,
      };
    }

    if (!createResponse.ok || createResult.error) {
      console.error('Resend create broadcast error:', {
        status: createResponse.status,
        error: createResult.error,
      });
      return {
        success: false,
        error:
          createResult.error?.message ||
          `Failed to create broadcast (HTTP ${createResponse.status})`,
      };
    }

    const broadcastId = createResult.id;
    if (!broadcastId) {
      return {
        success: false,
        error: 'Broadcast created but no ID returned',
      };
    }

    // Step 2: Send broadcast
    const sendResponse = await fetchWithRetry(
      `${RESEND_API_BASE}/broadcasts/${broadcastId}/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      }
    );

    const sendResponseText = await sendResponse.text();
    let sendResult: SendBroadcastResponse;
    try {
      sendResult = JSON.parse(sendResponseText);
    } catch (parseError) {
      const preview = sendResponseText.length > 100 ? sendResponseText.slice(0, 100) + '...' : sendResponseText;
      console.error('Failed to parse Resend API response', {
        status: sendResponse.status,
        responsePreview: preview,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        broadcastId,
      });
      return {
        success: false,
        broadcastId,
        error: `Invalid JSON response from Resend API (HTTP ${sendResponse.status}): ${preview}`,
      };
    }

    if (!sendResponse.ok || sendResult.error) {
      console.error('Resend send broadcast error:', {
        status: sendResponse.status,
        error: sendResult.error,
        broadcastId,
      });
      return {
        success: false,
        broadcastId,
        error:
          sendResult.error?.message ||
          `Failed to send broadcast (HTTP ${sendResponse.status})`,
      };
    }

    return {
      success: true,
      broadcastId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Broadcast error:', { error: errorMessage });
    return {
      success: false,
      error: `Broadcast error: ${errorMessage}`,
    };
  }
}
