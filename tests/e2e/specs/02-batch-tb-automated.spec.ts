import { test, expect, type Page } from '@playwright/test';
import { getDeliveryLogs, getSubscriber, queryD1 } from '../helpers/d1-client';

const userEmail = process.env.TEST_USER_EMAIL!;
const adminApiKey = process.env.ADMIN_API_KEY!;

if (!userEmail || !adminApiKey) {
  throw new Error('TEST_USER_EMAIL and ADMIN_API_KEY must be set');
}

/**
 * Login to admin panel
 */
async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/admin');

  // Wait for login form
  await page.waitForSelector('input[type="password"]', { timeout: 5000 });

  // Enter API key
  await page.fill('input[type="password"]', adminApiKey);
  await page.click('button[type="submit"]');

  // Wait for dashboard to load
  await page.waitForSelector('text=ダッシュボード', { timeout: 10000 });
}

test.describe('Batch TB User Test - Automated Flow', () => {
  test('Admin login works', async ({ page }) => {
    await loginAdmin(page);
    await expect(page.locator('text=ダッシュボード')).toBeVisible();
  });
});
