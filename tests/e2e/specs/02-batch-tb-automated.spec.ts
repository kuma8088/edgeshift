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

    // Wait for dashboard to fully load
    await page.waitForLoadState('networkidle');

    // Navigate to sequence creation
    await page.goto('/admin/sequences/new');

    // Wait for page to fully load and React to hydrate
    await page.waitForLoadState('networkidle');

    // Wait for form to load (React component needs time to hydrate)
    await page.waitForSelector('#name', { timeout: 15000 });

    // Calculate times based on current time for immediate execution
    const now = new Date();
    const formatTime = (date: Date): string => {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const addMinutes = (date: Date, mins: number): Date => {
      return new Date(date.getTime() + mins * 60000);
    };

    // Fill sequence name and description
    await page.fill('#name', 'Test Sequence - Batch TB');
    await page.fill('#description', 'Automated test sequence with 5 steps');

    // Define 5 steps with dynamic timing
    const steps = [
      { delay_days: '0', delay_time: formatTime(addMinutes(now, 2)), subject: 'Step 1: Welcome', body: 'Welcome email with Link A: https://edgeshift.tech/articles/a' },
      { delay_days: '0', delay_time: formatTime(addMinutes(now, 5)), subject: 'Step 2: Sample', body: 'Sample email with Link B: https://edgeshift.tech/articles/b' },
      { delay_days: '0', delay_time: formatTime(addMinutes(now, 8)), subject: 'Step 3: Check', body: 'Check email with Link C: https://edgeshift.tech/page-c' },
      { delay_days: '1', delay_time: '', subject: 'Step 4: Default', body: 'Default time email with Link D: https://edgeshift.tech/page-d' },
      { delay_days: '1', delay_time: '14:00', subject: 'Step 5: Specified', body: 'Specified time email with Link E: https://edgeshift.tech/step5' },
    ];

    console.log('Sequence steps timing:', steps.map(s => ({ subject: s.subject, delay_days: s.delay_days, delay_time: s.delay_time })));

    // Fill first step (already exists in form)
    await page.fill('#delay_days_0', steps[0].delay_days);
    if (steps[0].delay_time) {
      await page.fill('#delay_time_0', steps[0].delay_time);
    }
    await page.fill('#subject_0', steps[0].subject);
    // Fill RichTextEditor for first step
    const editor0 = page.locator('.ProseMirror').first();
    await editor0.click();
    await page.keyboard.type(steps[0].body);

    // Add and fill remaining 4 steps
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];

      // Click "ステップを追加" button
      await page.click('button:has-text("ステップを追加")');
      await page.waitForSelector(`#subject_${i}`, { timeout: 5000 });

      await page.fill(`#delay_days_${i}`, step.delay_days);
      if (step.delay_time) {
        await page.fill(`#delay_time_${i}`, step.delay_time);
      }
      await page.fill(`#subject_${i}`, step.subject);

      // Fill RichTextEditor for this step (nth editor)
      const editor = page.locator('.ProseMirror').nth(i);
      await editor.click();
      await page.keyboard.type(step.body);
    }

    // Submit form to create sequence
    await page.click('button:has-text("作成")');

    // Wait for redirect to sequence list
    await page.waitForURL('/admin/sequences', { timeout: 15000 });

    // Verify sequence was created in D1
    const sequences = await queryD1<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM sequences WHERE name = 'Test Sequence - Batch TB' ORDER BY created_at DESC LIMIT 1`
    );
    expect(sequences.length).toBe(1);
    const sequenceId = sequences[0].id;

    // Verify 5 steps were created
    const stepsDb = await queryD1(`SELECT * FROM sequence_steps WHERE sequence_id = '${sequenceId}' ORDER BY step_order`);
    expect(stepsDb.length).toBe(5);

    console.log('Sequence created successfully with ID:', sequenceId);
    console.log('First 3 steps scheduled for today, starting at:', steps[0].delay_time);
  });
});
