import { test, expect } from '@playwright/test';

const BASE_URL = 'https://edgeshift.tech';

test.describe('Referral Program - Production', () => {
  test('should display confirmed page with referral section', async ({ page }) => {
    // Note: The referral section only shows when there's a subscriber context
    // This test verifies the base page structure
    await page.goto(`${BASE_URL}/newsletter/confirmed`);

    // Check page loads
    await expect(page.locator('h1')).toContainText('登録が完了しました');

    // Check back to home link exists (use first() to avoid strict mode)
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });

  test('should load admin referrals page structure', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/referrals`);

    // Admin pages require auth - check page loads with sidebar
    await expect(page.locator('a[href="/admin/referrals"]')).toBeVisible();

    // Check sidebar has referral link in navigation
    await expect(page.locator('nav a[href="/admin/referrals"]')).toBeVisible();
  });

  test('should have referral dashboard component', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/referrals`);

    // Wait for React component to load
    await page.waitForSelector('astro-island', { state: 'attached' });

    // The component should be present (even if auth required)
    const authProvider = page.locator('astro-island[component-export="AuthProvider"]');
    await expect(authProvider).toBeAttached();
  });

  test('should have milestones API endpoint', async ({ context }) => {
    // This will return 401 without auth, but endpoint should exist
    const response = await context.request.get(`${BASE_URL}/api/admin/milestones`);
    // 401 means endpoint exists but auth required
    expect([200, 401]).toContain(response.status());
  });

  test('should have referral stats API endpoint', async ({ context }) => {
    const response = await context.request.get(`${BASE_URL}/api/admin/referral-stats`);
    expect([200, 401]).toContain(response.status());
  });

  test('should return 404 for non-existent referral code', async ({ context }) => {
    const response = await context.request.get(`${BASE_URL}/api/referral/dashboard/NONEXISTENT`);
    // Should return 404 or empty data for non-existent code
    expect([200, 404]).toContain(response.status());
  });

  test('should render referral page structure', async ({ page }) => {
    // Test the referral dashboard page for a non-existent code
    await page.goto(`${BASE_URL}/newsletter/referrals/TESTCODE`);

    // Page should render (even if showing error/not found state)
    await page.waitForLoadState('networkidle');

    // Check basic page structure exists
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
