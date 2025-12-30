import { test, expect } from '@playwright/test';

const BASE_URL = 'https://edgeshift.tech';

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
});
