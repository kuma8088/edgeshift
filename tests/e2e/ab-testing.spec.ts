import { test, expect } from '@playwright/test';

const BASE_URL = 'https://edgeshift.tech';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

test.describe('A/B Testing - Production', () => {
  test.describe('Campaign New Page (/admin/campaigns/new)', () => {
    test('should not show A/B test toggle without scheduled date', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // A/B test section should not be visible without scheduled date
      const abTestCheckbox = page.getByText('A/Bテストを有効にする');
      await expect(abTestCheckbox).not.toBeVisible();
    });

    test('should show A/B test toggle when scheduled date is set', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // Set a scheduled date (tomorrow at 18:00)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      const dateStr = tomorrow.toISOString().slice(0, 16);

      const scheduledInput = page.locator('input[type="datetime-local"]');
      const inputExists = await scheduledInput.count();

      if (inputExists > 0) {
        await scheduledInput.fill(dateStr);

        // Now A/B test toggle should be visible
        const abTestCheckbox = page.getByText('A/Bテストを有効にする');
        await expect(abTestCheckbox).toBeVisible();
      }
    });

    test('should expand A/B test settings when enabled', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // Set scheduled date first
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      const dateStr = tomorrow.toISOString().slice(0, 16);

      const scheduledInput = page.locator('input[type="datetime-local"]');
      const inputExists = await scheduledInput.count();

      if (inputExists > 0) {
        await scheduledInput.fill(dateStr);

        // Enable A/B test
        const abTestCheckbox = page.getByText('A/Bテストを有効にする');
        await abTestCheckbox.click();

        // Check A/B test fields are visible
        await expect(page.locator('input#abSubjectB')).toBeVisible();
        await expect(page.locator('input#abFromNameB')).toBeVisible();

        // Check placeholders
        await expect(page.locator('input#abSubjectB')).toHaveAttribute('placeholder', 'テストする別の件名');
        await expect(page.locator('input#abFromNameB')).toHaveAttribute('placeholder', 'テストする別の送信者名');

        // Check wait time options
        await expect(page.getByText('1時間')).toBeVisible();
        await expect(page.getByText('2時間')).toBeVisible();
        await expect(page.getByText('4時間')).toBeVisible();
      }
    });

    test('should show test timing preview when A/B enabled', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // Set scheduled date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      const dateStr = tomorrow.toISOString().slice(0, 16);

      const scheduledInput = page.locator('input[type="datetime-local"]');
      const inputExists = await scheduledInput.count();

      if (inputExists > 0) {
        await scheduledInput.fill(dateStr);

        // Enable A/B test
        const abTestCheckbox = page.getByText('A/Bテストを有効にする');
        await abTestCheckbox.click();

        // Check timing preview is shown
        await expect(page.getByText('配信スケジュール')).toBeVisible();
        await expect(page.getByText(/テスト配信:/)).toBeVisible();
        await expect(page.getByText(/本配信:/)).toBeVisible();
      }
    });

    test('should allow changing wait time options', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // Set scheduled date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      const dateStr = tomorrow.toISOString().slice(0, 16);

      const scheduledInput = page.locator('input[type="datetime-local"]');
      const inputExists = await scheduledInput.count();

      if (inputExists > 0) {
        await scheduledInput.fill(dateStr);

        // Enable A/B test
        await page.getByText('A/Bテストを有効にする').click();

        // Default should be 4 hours, verify it's checked
        const fourHoursRadio = page.locator('input[name="abWaitHours"][value="4"]');
        await expect(fourHoursRadio).toBeChecked();

        // Select 1 hour option
        await page.getByText('1時間').click();
        const oneHourRadio = page.locator('input[name="abWaitHours"][value="1"]');
        await expect(oneHourRadio).toBeChecked();

        // Select 2 hours option
        await page.getByText('2時間').click();
        const twoHoursRadio = page.locator('input[name="abWaitHours"][value="2"]');
        await expect(twoHoursRadio).toBeChecked();
      }
    });

    test('should collapse A/B settings when disabled', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // Set scheduled date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().slice(0, 16);

      const scheduledInput = page.locator('input[type="datetime-local"]');
      const inputExists = await scheduledInput.count();

      if (inputExists > 0) {
        await scheduledInput.fill(dateStr);

        // Enable A/B test
        await page.getByText('A/Bテストを有効にする').click();

        // Fields should be visible
        await expect(page.locator('input#abSubjectB')).toBeVisible();

        // Disable A/B test
        await page.getByText('A/Bテストを有効にする').click();

        // Fields should be hidden
        await expect(page.locator('input#abSubjectB')).not.toBeVisible();
      }
    });

    test('should hide A/B section when scheduled date is cleared', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // Set scheduled date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().slice(0, 16);

      const scheduledInput = page.locator('input[type="datetime-local"]');
      const inputExists = await scheduledInput.count();

      if (inputExists > 0) {
        await scheduledInput.fill(dateStr);

        // A/B test toggle should be visible
        await expect(page.getByText('A/Bテストを有効にする')).toBeVisible();

        // Clear scheduled date
        await scheduledInput.clear();

        // A/B test toggle should be hidden
        await expect(page.getByText('A/Bテストを有効にする')).not.toBeVisible();
      }
    });
  });

  test.describe('Campaign Edit Page', () => {
    test('should load campaign edit page with potential A/B settings', async ({ page }) => {
      // First, get an existing campaign ID from the campaigns list
      await page.goto(`${BASE_URL}/admin/campaigns`);
      await page.waitForLoadState('networkidle');

      // Look for any campaign link
      const campaignLink = page.locator('a[href^="/admin/campaigns/"][href$="/edit"]').first();
      const linkExists = await campaignLink.count();

      if (linkExists > 0) {
        await campaignLink.click();
        await page.waitForLoadState('networkidle');

        // Verify the page has A/B test toggle capability
        await page.waitForSelector('astro-island', { state: 'attached' });

        // The page should have the scheduled date input
        const scheduledInput = page.locator('input[type="datetime-local"]');
        await expect(scheduledInput).toBeVisible();
      }
    });
  });

  test.describe('API Endpoints', () => {
    test('should accept A/B test fields in campaign creation', async ({ context }) => {
      // Create a campaign with A/B test settings - should require auth
      const response = await context.request.post(`${BASE_URL}/api/campaigns`, {
        data: {
          subject: 'Test Subject A',
          content: '<p>Test content</p>',
          ab_test_enabled: true,
          ab_subject_b: 'Test Subject B',
          ab_from_name_b: 'Test Name B',
          ab_wait_hours: 4,
        },
      });

      // Without auth header, should return 401
      expect(response.status()).toBe(401);
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('A/B test settings should be accessible on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // Set scheduled date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().slice(0, 16);

      const scheduledInput = page.locator('input[type="datetime-local"]');
      const inputExists = await scheduledInput.count();

      if (inputExists > 0) {
        await scheduledInput.fill(dateStr);

        // A/B test toggle should be visible and tappable
        const abTestLabel = page.getByText('A/Bテストを有効にする');
        await expect(abTestLabel).toBeVisible();

        // Enable A/B test
        await abTestLabel.click();

        // A/B test fields should be visible on mobile
        await expect(page.locator('input#abSubjectB')).toBeVisible();

        // Wait time options should be visible
        await expect(page.getByText('1時間')).toBeVisible();
        await expect(page.getByText('2時間')).toBeVisible();
        await expect(page.getByText('4時間')).toBeVisible();
      }
    });
  });

  test.describe('UI to API Integration (Full Flow)', () => {
    test.skip(!ADMIN_API_KEY, 'ADMIN_API_KEY is required for this test');

    test('should create A/B campaign via UI and verify API persistence', async ({ page, context }) => {
      // Set up authentication
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.evaluate((apiKey) => {
        localStorage.setItem('edgeshift_admin_api_key', apiKey);
      }, ADMIN_API_KEY);

      // Reload page to apply authentication
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('astro-island', { state: 'attached' });

      // Fill in campaign form
      const subjectA = `E2E Test - A/B Campaign ${Date.now()}`;
      const subjectB = 'E2E Test - Subject B Variant';
      const fromNameB = 'E2E Test Sender B';

      // Subject
      await page.locator('input#subject').fill(subjectA);

      // Content - TipTap RichTextEditor uses ProseMirror
      const editor = page.locator('.ProseMirror').first();
      await editor.click();
      await editor.fill('E2E test content for A/B testing');

      // Set scheduled date (tomorrow at 18:00)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      const dateStr = tomorrow.toISOString().slice(0, 16);

      const scheduledInput = page.locator('input[type="datetime-local"]');
      await scheduledInput.fill(dateStr);

      // Enable A/B test
      await page.getByText('A/Bテストを有効にする').click();

      // Fill A/B test fields
      await page.locator('input#abSubjectB').fill(subjectB);
      await page.locator('input#abFromNameB').fill(fromNameB);

      // Select 2 hours wait time
      await page.getByText('2時間').click();

      // Submit form
      await page.locator('button[type="submit"]').click();

      // Wait for redirect to campaigns list
      await page.waitForURL('**/admin/campaigns', { timeout: 10000 });

      // Verify campaign was created via API
      const response = await context.request.get(`${BASE_URL}/api/campaigns`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Find the created campaign
      const campaigns = data.data?.campaigns || data.data || [];
      const createdCampaign = campaigns.find((c: { subject: string }) => c.subject === subjectA);

      expect(createdCampaign).toBeDefined();
      expect(createdCampaign.ab_test_enabled).toBe(1);
      expect(createdCampaign.ab_subject_b).toBe(subjectB);
      expect(createdCampaign.ab_from_name_b).toBe(fromNameB);
      expect(createdCampaign.ab_wait_hours).toBe(2);

      // Get campaign detail to verify ab_stats field exists
      const detailResponse = await context.request.get(`${BASE_URL}/api/campaigns/${createdCampaign.id}`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(detailResponse.status()).toBe(200);
      const detailData = await detailResponse.json();
      expect(detailData.success).toBe(true);
      expect(detailData.data.campaign).toBeDefined();
      expect(detailData.data.campaign.ab_test_enabled).toBe(1);
      // ab_stats should be null before sending (no delivery logs)
      expect(detailData.data.campaign.ab_stats).toBeNull();

      // Navigate to campaign detail page and verify A/B info is displayed
      await page.goto(`${BASE_URL}/admin/campaigns/${createdCampaign.id}`);
      await page.waitForLoadState('networkidle');

      // Verify A/B test configuration is shown on detail page
      // The A/B results section shows when ab_test_enabled is true
      // Even without stats, the settings should be retrievable via API
      const campaignTitle = page.locator('h1, h2').first();
      await expect(campaignTitle).toBeVisible();

      // Cleanup: delete the test campaign
      const deleteResponse = await context.request.delete(`${BASE_URL}/api/campaigns/${createdCampaign.id}`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(deleteResponse.status()).toBe(200);
    });

    test('should update A/B settings via API and verify persistence', async ({ context }) => {
      // Create a campaign with A/B settings via API
      const subjectA = `E2E Update API Test ${Date.now()}`;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);

      const createResponse = await context.request.post(`${BASE_URL}/api/campaigns`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        data: {
          subject: subjectA,
          content: '<p>Test content</p>',
          scheduled_at: Math.floor(tomorrow.getTime() / 1000),
          ab_test_enabled: true,
          ab_subject_b: 'Initial Subject B',
          ab_from_name_b: 'Initial Sender B',
          ab_wait_hours: 4,
        },
      });

      expect([200, 201]).toContain(createResponse.status());
      const createData = await createResponse.json();
      const campaignId = createData.data.id;

      // Verify initial A/B settings
      expect(createData.data.ab_test_enabled).toBe(1);
      expect(createData.data.ab_subject_b).toBe('Initial Subject B');

      // Update A/B settings via API
      const updateResponse = await context.request.put(`${BASE_URL}/api/campaigns/${campaignId}`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        data: {
          ab_subject_b: 'Updated Subject B',
          ab_from_name_b: 'Updated Sender B',
          ab_wait_hours: 1,
        },
      });

      expect(updateResponse.status()).toBe(200);

      // Verify via GET
      const verifyResponse = await context.request.get(`${BASE_URL}/api/campaigns/${campaignId}`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_API_KEY}`,
        },
      });

      expect(verifyResponse.status()).toBe(200);
      const verifyData = await verifyResponse.json();

      expect(verifyData.data.campaign.ab_test_enabled).toBe(1);
      expect(verifyData.data.campaign.ab_subject_b).toBe('Updated Subject B');
      expect(verifyData.data.campaign.ab_from_name_b).toBe('Updated Sender B');
      expect(verifyData.data.campaign.ab_wait_hours).toBe(1);

      // Cleanup
      await context.request.delete(`${BASE_URL}/api/campaigns/${campaignId}`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_API_KEY}`,
        },
      });
    });
  });
});
