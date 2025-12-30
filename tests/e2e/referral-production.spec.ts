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
    // Without auth header, should return 401
    const response = await context.request.get(`${BASE_URL}/api/admin/milestones`);
    // Must be 401 (auth required) - not 200 (which would indicate broken auth)
    expect(response.status()).toBe(401);
  });

  test('should have referral stats API endpoint', async ({ context }) => {
    // Without auth header, should return 401
    const response = await context.request.get(`${BASE_URL}/api/admin/referral-stats`);
    // Must be 401 (auth required) - not 200 (which would indicate broken auth)
    expect(response.status()).toBe(401);
  });

  test('should return 404 for non-existent referral code', async ({ context }) => {
    const response = await context.request.get(`${BASE_URL}/api/referral/dashboard/NONEXISTENT`);
    // Must return 404 for invalid code - not 200 (which would mask errors)
    expect(response.status()).toBe(404);
  });

  test('should render referral page structure', async ({ page }) => {
    // Test the referral dashboard page for a non-existent code
    await page.goto(`${BASE_URL}/newsletter/referrals/TESTCODE`);

    // Page should render error state for invalid code
    await page.waitForLoadState('networkidle');

    // Check error message is displayed (not just body visibility)
    // This ensures we're not passing on 404 or generic error pages
    await expect(page.locator('h1')).toContainText('エラー');
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });
});
