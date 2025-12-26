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

  test('TB-2-1: Create sequence with 5 steps', async ({ page }) => {
    await loginAdmin(page);

    // Navigate to sequence creation
    await page.goto('/admin/sequences/new');

    // Fill sequence name
    await page.fill('input[name="name"]', 'Test Sequence - Batch TB');
    await page.fill('textarea[name="description"]', 'Automated test sequence with 5 steps');

    // Save sequence first
    await page.click('button:has-text("Save")');
    await page.waitForURL(/\/admin\/sequences\/edit\?id=/);

    // Get sequence ID from URL
    const sequenceId = new URL(page.url()).searchParams.get('id');
    expect(sequenceId).toBeTruthy();

    // Define 5 steps
    const steps = [
      { delay_days: '0', delay_time: '09:00', subject: 'Step 1: Welcome', body: 'Welcome email with Link A: https://edgeshift.tech/articles/a' },
      { delay_days: '0', delay_time: '09:15', subject: 'Step 2: Sample', body: 'Sample email with Link B: https://edgeshift.tech/articles/b' },
      { delay_days: '0', delay_time: '09:30', subject: 'Step 3: Check', body: 'Check email with Link C: https://edgeshift.tech/page-c' },
      { delay_days: '1', delay_time: '', subject: 'Step 4: Default', body: 'Default time email with Link D: https://edgeshift.tech/page-d' },
      { delay_days: '1', delay_time: '14:00', subject: 'Step 5: Specified', body: 'Specified time email with Link E: https://edgeshift.tech/step5' },
    ];

    // Add each step
    for (const step of steps) {
      await page.click('button:has-text("Add Step")');
      await page.waitForSelector('input[name="subject"]');

      await page.fill('input[name="subject"]', step.subject);
      await page.fill('input[name="delay_days"]', step.delay_days);
      if (step.delay_time) {
        await page.fill('input[name="delay_time"]', step.delay_time);
      }

      // Fill body in RichTextEditor
      await page.click('.ProseMirror');
      await page.keyboard.type(step.body);

      // Save step
      await page.click('button:has-text("Save Step")');
      await page.waitForTimeout(500); // Wait for save
    }

    // Activate sequence
    await page.click('button:has-text("Activate")');
    await expect(page.locator('text=active')).toBeVisible();

    // Verify in D1
    const sequence = await queryD1(`SELECT * FROM sequences WHERE id = '${sequenceId}'`);
    expect(sequence[0].status).toBe('active');

    const stepsDb = await queryD1(`SELECT * FROM sequence_steps WHERE sequence_id = '${sequenceId}' ORDER BY step_order`);
    expect(stepsDb.length).toBe(5);
  });
});
