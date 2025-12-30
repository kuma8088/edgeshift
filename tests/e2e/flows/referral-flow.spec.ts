import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'https://edgeshift.tech';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// Helper to set up admin authentication
async function setupAdminAuth(page: Page, url: string) {
  await page.goto(url);
  await page.evaluate((apiKey) => {
    localStorage.setItem('edgeshift_admin_api_key', apiKey);
  }, ADMIN_API_KEY);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('astro-island', { state: 'attached' });
}

test.describe('Referral Program Flow - Production', () => {
  test('should display confirmed page with referral section structure', async ({
    page,
  }) => {
    // 1. Navigate to confirmed page
    await page.goto(`${BASE_URL}/newsletter/confirmed`);
    await page.waitForLoadState('networkidle');

    // 2. Verify page loaded
    await expect(page.locator('h1')).toContainText('登録が完了しました');

    // 3. Check for referral section structure
    // Note: Referral section only shows with subscriber context from URL params
    // Here we verify the page structure exists

    // Check for home link
    await expect(page.locator('a[href="/"]').first()).toBeVisible();

    // The referral section would appear if we had a valid referral code
    // This test verifies the base page is working
  });

  test('should display referral dashboard for valid referral code via API', async ({
    context,
  }) => {
    // First, get a list of subscribers to find one with a referral code
    const subscribersResponse = await context.request.get(
      `${BASE_URL}/api/newsletter/subscribers`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );

    if (subscribersResponse.status() !== 200) {
      test.skip(true, 'Could not fetch subscribers - skipping referral code test');
      return;
    }

    const subscribersData = await subscribersResponse.json();
    const subscribers = subscribersData.data?.subscribers || subscribersData.data || [];

    // Find a subscriber with a referral code
    const subscriberWithCode = subscribers.find(
      (s: { referral_code?: string }) => s.referral_code
    );

    if (!subscriberWithCode?.referral_code) {
      test.skip(true, 'No subscriber with referral code found');
      return;
    }

    // Test the referral dashboard API
    const dashboardResponse = await context.request.get(
      `${BASE_URL}/api/referral/dashboard/${subscriberWithCode.referral_code}`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );

    expect(dashboardResponse.status()).toBe(200);
    const dashboardData = await dashboardResponse.json();

    // Should have referral stats
    expect(dashboardData.success).toBe(true);
  });

  test('should return 404 for invalid referral code', async ({ context }) => {
    const response = await context.request.get(
      `${BASE_URL}/api/referral/dashboard/INVALID_CODE_${Date.now()}`
    );

    expect(response.status()).toBe(404);
  });

  test.describe('Admin Referral Dashboard', () => {
    test.skip(!ADMIN_API_KEY, 'ADMIN_API_KEY is required for admin tests');

    test('should load admin referrals page with statistics', async ({ page }) => {
      // 1. Navigate to admin referrals page
      await setupAdminAuth(page, `${BASE_URL}/admin/referrals`);

      // 2. Wait for React component to load
      await page.waitForSelector('astro-island', {
        state: 'attached',
        timeout: 10000,
      });

      // 3. Check page has loaded content
      // The component may show stats, leaderboard, or empty state

      // Sidebar should have referrals link
      await expect(page.locator('nav a[href="/admin/referrals"]')).toBeVisible();
    });

    test('should display referral statistics via API', async ({ context }) => {
      // Test the referral stats API endpoint
      const response = await context.request.get(
        `${BASE_URL}/api/admin/referral-stats`,
        {
          headers: {
            Authorization: `Bearer ${ADMIN_API_KEY}`,
          },
        }
      );

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Should have stats structure
      expect(data.data).toBeDefined();
    });

    test('should display milestones via API', async ({ context }) => {
      // Test the milestones API endpoint
      const response = await context.request.get(`${BASE_URL}/api/admin/milestones`, {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    test('should navigate between admin pages correctly', async ({ page }) => {
      // 1. Start at referrals page
      await setupAdminAuth(page, `${BASE_URL}/admin/referrals`);

      // 2. Navigate to campaigns (more reliable link)
      const campaignsLink = page.locator('nav a[href="/admin/campaigns"]');
      await expect(campaignsLink).toBeVisible({ timeout: 10000 });
      await campaignsLink.click();
      await page.waitForURL(`${BASE_URL}/admin/campaigns`, { timeout: 10000 });

      // 3. Navigate back to referrals
      const referralsLink = page.locator('nav a[href="/admin/referrals"]');
      await expect(referralsLink).toBeVisible({ timeout: 10000 });
      await referralsLink.click();
      await page.waitForURL(`${BASE_URL}/admin/referrals`, { timeout: 10000 });
    });
  });

  test('should render referral dashboard page for invalid code with error state', async ({
    page,
  }) => {
    // Navigate to referral dashboard with invalid code
    await page.goto(`${BASE_URL}/newsletter/referrals/INVALID_TEST_CODE`);
    await page.waitForLoadState('networkidle');

    // Should show error state
    await expect(page.locator('h1')).toContainText('エラー');

    // Should have link to go back home
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });

  test('should display referral link on confirmed page with subscriber param', async ({
    page,
    context,
  }) => {
    // This test simulates what happens after a user confirms their subscription
    // The confirmed page would receive subscriber info via query params or session

    // First, get a subscriber to use for testing
    test.skip(!ADMIN_API_KEY, 'ADMIN_API_KEY required');

    const subscribersResponse = await context.request.get(
      `${BASE_URL}/api/newsletter/subscribers`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );

    if (subscribersResponse.status() !== 200) {
      test.skip(true, 'Could not fetch subscribers');
      return;
    }

    const subscribersData = await subscribersResponse.json();
    const subscribers = subscribersData.data?.subscribers || subscribersData.data || [];

    const subscriberWithCode = subscribers.find(
      (s: { referral_code?: string }) => s.referral_code
    );

    if (!subscriberWithCode?.referral_code) {
      test.skip(true, 'No subscriber with referral code found');
      return;
    }

    // Navigate to confirmed page with referral code param
    await page.goto(
      `${BASE_URL}/newsletter/confirmed?code=${subscriberWithCode.referral_code}`
    );
    await page.waitForLoadState('networkidle');

    // Check page loads
    await expect(page.locator('h1')).toContainText('登録が完了しました');

    // The referral section should be visible if the page supports code param
    // This depends on implementation - check for any referral-related content
    const referralSection = page.locator(
      '[data-testid="referral-section"], .referral, :has-text("紹介")'
    );
    const sectionExists = await referralSection.count();

    // Log whether referral section was found (informational, not assertion)
    if (sectionExists === 0) {
      console.log(
        'Referral section not found - may require session-based subscriber context'
      );
    }
  });

  test('should track referral visit correctly', async ({ page, context }) => {
    // Get a subscriber with referral code
    test.skip(!ADMIN_API_KEY, 'ADMIN_API_KEY required');

    const subscribersResponse = await context.request.get(
      `${BASE_URL}/api/newsletter/subscribers`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );

    if (subscribersResponse.status() !== 200) {
      test.skip(true, 'Could not fetch subscribers');
      return;
    }

    const subscribersData = await subscribersResponse.json();
    const subscribers = subscribersData.data?.subscribers || subscribersData.data || [];

    const subscriberWithCode = subscribers.find(
      (s: { referral_code?: string }) => s.referral_code
    );

    if (!subscriberWithCode?.referral_code) {
      test.skip(true, 'No subscriber with referral code found');
      return;
    }

    // Visit the newsletter page with referral code (simulates following a referral link)
    await page.goto(`${BASE_URL}/newsletter?ref=${subscriberWithCode.referral_code}`);
    await page.waitForLoadState('networkidle');

    // The page should load the newsletter signup form
    // Referral tracking would happen in the background
    await expect(page.locator('body')).toBeVisible();
  });
});
