/**
 * Broadcast API Smoke Tests
 *
 * These tests verify that the campaign and sequence functionality works correctly
 * when the Broadcast API feature flag is enabled.
 *
 * Note: The actual API choice (Email API vs Broadcast API) depends on server-side
 * environment variables (USE_BROADCAST_API, RESEND_AUDIENCE_ID). These tests verify
 * the endpoints respond correctly regardless of which API is used internally.
 *
 * For detailed API path testing, see:
 * - workers/newsletter/src/__tests__/campaign-send.test.ts (feature flag routing)
 * - workers/newsletter/src/__tests__/broadcast-sender.test.ts (broadcast functions)
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'https://edgeshift.tech';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

test.describe('Broadcast API Smoke Tests', () => {
  test.skip(!ADMIN_API_KEY, 'ADMIN_API_KEY is required for API tests');

  test.describe('Campaign API', () => {
    test('should list campaigns successfully', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/campaigns`, {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data?.campaigns || data.data)).toBe(true);
    });

    test('should create and delete a draft campaign', async ({ request }) => {
      // Create a draft campaign (will not be sent)
      const createResponse = await request.post(`${BASE_URL}/api/campaigns`, {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        data: {
          subject: `[E2E-SMOKE-TEST] Broadcast API Test ${Date.now()}`,
          content: 'This is a smoke test for Broadcast API. Do not send.',
        },
      });

      expect(createResponse.status()).toBe(201);
      const createData = await createResponse.json();
      expect(createData.success).toBe(true);
      expect(createData.data?.id).toBeDefined();

      const campaignId = createData.data.id;

      // Verify campaign exists
      const getResponse = await request.get(`${BASE_URL}/api/campaigns/${campaignId}`, {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(getResponse.status()).toBe(200);
      const getData = await getResponse.json();
      expect(getData.data?.status).toBe('draft');

      // Cleanup: Delete the test campaign
      const deleteResponse = await request.delete(`${BASE_URL}/api/campaigns/${campaignId}`, {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(deleteResponse.status()).toBe(200);
    });
  });

  test.describe('Sequence API', () => {
    test('should list sequences successfully', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/sequences`, {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  test.describe('Subscriber API', () => {
    test('should list subscribers successfully', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/subscribers`, {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
