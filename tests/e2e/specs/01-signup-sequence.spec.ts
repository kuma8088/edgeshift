import { test, expect } from '@playwright/test';
import { getConfirmToken, getDeliveryLogs, getSubscriber, waitForSubscriberStatus } from '../helpers/d1-client';
import { waitForSequenceDelivery } from '../helpers/trigger-cron';

test.describe('Signup to Sequence Email Flow', () => {
  const testEmail = `test+${Date.now()}@edgeshift.tech`;
  const testName = 'Playwright Test User';

  test('should complete full signup and receive sequence email', async ({ page }) => {
    // Step 1: Navigate to signup page
    await page.goto('/newsletter/signup/welcome');
    await expect(page).toHaveURL(/\/newsletter\/signup\/welcome/);

    // Step 2: Fill and submit signup form
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="name"]', testName);

    // Note: Turnstile is skipped for test+* emails
    await page.click('button[type="submit"]');

    // Step 3: Verify success message
    await expect(page.locator('text=確認メールを送信しました')).toBeVisible({ timeout: 10000 });

    // Step 4: Wait for subscriber creation in DB
    const created = await waitForSubscriberStatus(testEmail, 'pending', 5000);
    expect(created).toBe(true);

    // Step 5: Get confirm token from D1
    const confirmToken = await getConfirmToken(testEmail);
    expect(confirmToken).toBeTruthy();

    // Step 6: Navigate to confirmation URL
    await page.goto(`/api/newsletter/confirm/${confirmToken}`);

    // Should redirect to confirmed page
    await expect(page).toHaveURL(/\/newsletter\/confirmed/);

    // Step 7: Verify subscriber is now active
    const subscriber = await getSubscriber(testEmail);
    expect(subscriber).toBeTruthy();
    expect(subscriber!.status).toBe('active');

    // Step 8: Wait for sequence email delivery (trigger cron and poll)
    const delivered = await waitForSequenceDelivery(testEmail, 30000);
    expect(delivered).toBe(true);

    // Step 9: Verify delivery logs
    const logs = await getDeliveryLogs(testEmail);
    expect(logs.length).toBeGreaterThan(0);

    const sequenceLog = logs.find(log => log.sequence_id !== null);
    expect(sequenceLog).toBeTruthy();
    expect(sequenceLog!.status).toBe('sent');
    expect(sequenceLog!.email_subject).toBeTruthy();

    console.log(`✅ Test completed: ${testEmail} received sequence email`);
  });

  test('should handle re-subscription for unsubscribed user', async ({ page }) => {
    const resubEmail = `test+resub${Date.now()}@edgeshift.tech`;

    // First subscription
    await page.goto('/newsletter/signup/welcome');
    await page.fill('input[name="email"]', resubEmail);
    await page.click('button[type="submit"]');

    const token1 = await getConfirmToken(resubEmail);
    await page.goto(`/api/newsletter/confirm/${token1}`);

    // Get unsubscribe token
    const sub1 = await getSubscriber(resubEmail);
    const unsubToken = sub1!.unsubscribe_token;

    // Unsubscribe
    await page.goto(`/api/newsletter/unsubscribe/${unsubToken}`);
    await expect(page).toHaveURL(/\/newsletter\/unsubscribed/);

    // Re-subscribe
    await page.goto('/newsletter/signup/welcome');
    await page.fill('input[name="email"]', resubEmail);
    await page.click('button[type="submit"]');

    const token2 = await getConfirmToken(resubEmail);
    expect(token2).toBeTruthy();
    expect(token2).not.toBe(token1); // New token generated

    await page.goto(`/api/newsletter/confirm/${token2}`);

    const sub2 = await getSubscriber(resubEmail);
    expect(sub2!.status).toBe('active');
    expect(sub2!.unsubscribed_at).toBeNull();
  });
});
