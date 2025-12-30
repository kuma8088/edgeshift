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

// Helper to wait for campaign form to be fully rendered
async function waitForCampaignForm(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('astro-island', { state: 'attached' });
  // Wait for the subject input to be visible, which indicates the form is rendered
  await page.waitForSelector('input#subject', { state: 'visible', timeout: 10000 });
}

test.describe('A/B Testing Flow - Production', () => {
  test.skip(!ADMIN_API_KEY, 'ADMIN_API_KEY is required for flow tests');

  test('should create A/B campaign via UI and verify A/B settings are saved', async ({
    page,
    context,
  }) => {
    // 1. Navigate to campaign creation page
    await setupAdminAuth(page, `${BASE_URL}/admin/campaigns/new`);
    await waitForCampaignForm(page);

    // Generate unique test identifier
    const testId = Date.now();
    const subjectA = `Flow Test - A/B Campaign ${testId}`;
    const subjectB = `Flow Test - Subject B ${testId}`;
    const fromNameB = `Flow Test Sender B ${testId}`;

    // 2. Fill in subject
    await page.locator('input#subject').fill(subjectA);

    // 3. Fill in content - TipTap RichTextEditor uses ProseMirror
    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await editor.fill('E2E flow test content for A/B testing');

    // 4. Set scheduled date (tomorrow at 18:00)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    const dateStr = tomorrow.toISOString().slice(0, 16);

    const scheduledInput = page.locator('input[type="datetime-local"]');
    await expect(scheduledInput).toBeVisible({ timeout: 5000 });
    await scheduledInput.fill(dateStr);

    // 5. Enable A/B test
    const abTestCheckbox = page.getByText('A/Bテストを有効にする');
    await expect(abTestCheckbox).toBeVisible();
    await abTestCheckbox.click();

    // 6. Fill A/B test fields
    await page.locator('input#abSubjectB').fill(subjectB);
    await page.locator('input#abFromNameB').fill(fromNameB);

    // Select 2 hours wait time
    await page.getByText('2時間').click();

    // 7. Submit form
    await page.locator('button[type="submit"]').click();

    // 8. Wait for redirect to campaigns list
    await page.waitForURL('**/admin/campaigns', { timeout: 15000 });

    // 9. Verify campaign was created via API
    const listResponse = await context.request.get(`${BASE_URL}/api/campaigns`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
      },
    });

    expect(listResponse.status()).toBe(200);
    const listData = await listResponse.json();
    expect(listData.success).toBe(true);

    // Find the created campaign
    const campaigns = listData.data?.campaigns || listData.data || [];
    const createdCampaign = campaigns.find(
      (c: { subject: string }) => c.subject === subjectA
    );

    expect(createdCampaign).toBeDefined();
    const campaignId = createdCampaign.id;

    // 10. Navigate to campaign detail page
    await page.goto(`${BASE_URL}/admin/campaigns/${campaignId}`);
    await page.waitForLoadState('networkidle');

    // 11. Verify A/B settings via API
    const detailResponse = await context.request.get(
      `${BASE_URL}/api/campaigns/${campaignId}`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );

    expect(detailResponse.status()).toBe(200);
    const detailData = await detailResponse.json();
    expect(detailData.success).toBe(true);

    const campaign = detailData.data.campaign;
    expect(campaign.ab_test_enabled).toBe(1);
    expect(campaign.ab_subject_b).toBe(subjectB);
    expect(campaign.ab_from_name_b).toBe(fromNameB);
    expect(campaign.ab_wait_hours).toBe(2);

    // ab_stats should be null before sending
    expect(campaign.ab_stats).toBeNull();

    // 12. Verify campaign detail page shows the campaign
    const pageTitle = page.locator('h1, h2').first();
    await expect(pageTitle).toBeVisible();

    // 13. Cleanup: delete the test campaign
    const deleteResponse = await context.request.delete(
      `${BASE_URL}/api/campaigns/${campaignId}`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );
    expect(deleteResponse.status()).toBe(200);
  });

  test('should edit existing campaign A/B settings and verify persistence', async ({
    page,
    context,
  }) => {
    // Create a test campaign via API first
    const testId = Date.now();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);

    const createResponse = await context.request.post(`${BASE_URL}/api/campaigns`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      data: {
        subject: `Flow Edit Test ${testId}`,
        content: '<p>Initial content</p>',
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

    // Navigate to edit page
    await setupAdminAuth(page, `${BASE_URL}/admin/campaigns/edit?id=${campaignId}`);
    await waitForCampaignForm(page);

    // Update A/B settings via UI
    const abSubjectBInput = page.locator('input#abSubjectB');
    await expect(abSubjectBInput).toBeVisible({ timeout: 5000 });

    await abSubjectBInput.clear();
    await abSubjectBInput.fill(`Updated Subject B ${testId}`);

    const abFromNameBInput = page.locator('input#abFromNameB');
    await abFromNameBInput.clear();
    await abFromNameBInput.fill(`Updated Sender B ${testId}`);

    // Change wait time to 1 hour
    await page.getByText('1時間').click();

    // Save changes
    await page.locator('button[type="submit"]').click();

    // Wait for redirect
    await page.waitForURL('**/admin/campaigns', { timeout: 15000 });

    // Verify changes via API
    const verifyResponse = await context.request.get(
      `${BASE_URL}/api/campaigns/${campaignId}`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );

    expect(verifyResponse.status()).toBe(200);
    const verifyData = await verifyResponse.json();

    expect(verifyData.data.campaign.ab_test_enabled).toBe(1);
    expect(verifyData.data.campaign.ab_subject_b).toBe(`Updated Subject B ${testId}`);
    expect(verifyData.data.campaign.ab_from_name_b).toBe(`Updated Sender B ${testId}`);
    expect(verifyData.data.campaign.ab_wait_hours).toBe(1);

    // Cleanup
    await context.request.delete(`${BASE_URL}/api/campaigns/${campaignId}`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
      },
    });
  });

  test('should disable A/B test and verify it is cleared', async ({ page, context }) => {
    // Create a test campaign with A/B enabled
    const testId = Date.now();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);

    const createResponse = await context.request.post(`${BASE_URL}/api/campaigns`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      data: {
        subject: `Flow Disable A/B Test ${testId}`,
        content: '<p>Test content</p>',
        scheduled_at: Math.floor(tomorrow.getTime() / 1000),
        ab_test_enabled: true,
        ab_subject_b: 'Subject B to be cleared',
        ab_from_name_b: 'Sender B to be cleared',
        ab_wait_hours: 2,
      },
    });

    expect([200, 201]).toContain(createResponse.status());
    const createData = await createResponse.json();
    const campaignId = createData.data.id;

    // Navigate to edit page
    await setupAdminAuth(page, `${BASE_URL}/admin/campaigns/edit?id=${campaignId}`);
    await waitForCampaignForm(page);

    // Disable A/B test by clicking the checkbox
    const abTestCheckbox = page.getByText('A/Bテストを有効にする');
    await abTestCheckbox.click();

    // A/B fields should be hidden
    await expect(page.locator('input#abSubjectB')).not.toBeVisible();

    // Save changes
    await page.locator('button[type="submit"]').click();

    // Wait for redirect
    await page.waitForURL('**/admin/campaigns', { timeout: 15000 });

    // Verify A/B is disabled via API
    const verifyResponse = await context.request.get(
      `${BASE_URL}/api/campaigns/${campaignId}`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );

    expect(verifyResponse.status()).toBe(200);
    const verifyData = await verifyResponse.json();

    expect(verifyData.data.campaign.ab_test_enabled).toBe(0);

    // Cleanup
    await context.request.delete(`${BASE_URL}/api/campaigns/${campaignId}`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
      },
    });
  });
});
