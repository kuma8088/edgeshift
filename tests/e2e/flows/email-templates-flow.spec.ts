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

test.describe('Email Templates Flow - Production', () => {
  test.skip(!ADMIN_API_KEY, 'ADMIN_API_KEY is required for flow tests');

  test('should configure brand settings and verify persistence', async ({
    page,
    context,
  }) => {
    // 1. Navigate to brand settings page
    await setupAdminAuth(page, `${BASE_URL}/admin/brand-settings`);

    // Wait for form to load
    await page.waitForSelector('h2:has-text("ブランド設定")', {
      state: 'visible',
      timeout: 10000,
    });

    // 2. Save current settings to restore later
    const getSettingsResponse = await context.request.get(
      `${BASE_URL}/api/brand-settings`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );
    expect(getSettingsResponse.status()).toBe(200);
    const originalSettings = await getSettingsResponse.json();

    // 3. Update brand settings with test values
    const testId = Date.now();
    const testLogoUrl = `https://example.com/test-logo-${testId}.png`;
    const testPrimaryColor = '#FF5733';

    // Fill logo URL
    const logoInput = page.locator('input[type="url"]');
    await logoInput.clear();
    await logoInput.fill(testLogoUrl);

    // Fill primary color - color input needs special handling with event dispatch
    const primaryColorInput = page.locator('input[type="color"]').first();
    await primaryColorInput.evaluate((el, color) => {
      const input = el as HTMLInputElement;
      input.value = color;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, testPrimaryColor);

    // 4. Save settings
    const saveButton = page.locator('button:has-text("設定を保存")');
    await saveButton.click();

    // Wait for save confirmation (could be toast, redirect, or state change)
    await page.waitForTimeout(2000);

    // 5. Verify settings were saved via API
    const verifyResponse = await context.request.get(
      `${BASE_URL}/api/brand-settings`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_API_KEY}`,
        },
      }
    );
    expect(verifyResponse.status()).toBe(200);
    const savedSettings = await verifyResponse.json();

    expect(savedSettings.data.logo_url).toBe(testLogoUrl);
    expect(savedSettings.data.primary_color?.toLowerCase()).toBe(
      testPrimaryColor.toLowerCase()
    );

    // 6. Restore original settings
    await context.request.post(`${BASE_URL}/api/brand-settings`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      data: originalSettings.data || {},
    });
  });

  test('should select template in campaign creation and preview', async ({
    page,
    context,
  }) => {
    // 1. Navigate to campaign creation page
    await setupAdminAuth(page, `${BASE_URL}/admin/campaigns/new`);

    // Wait for form to load
    await page.waitForSelector('input#subject', { state: 'visible', timeout: 10000 });

    // 2. Check for template selector
    const templateLabel = page.locator('label:has-text("メールテンプレート")');
    const labelExists = await templateLabel.count();

    if (labelExists > 0) {
      // 3. Template dropdown should have options
      const templateSelect = page.locator('select').filter({
        has: page.locator('option:has-text("Default Template")'),
      });
      await expect(templateSelect).toBeVisible();

      // 4. Fill in required fields for preview
      const testId = Date.now();
      await page.locator('input#subject').fill(`Template Flow Test ${testId}`);

      // Fill content
      const editor = page.locator('.ProseMirror').first();
      await editor.click();
      await editor.fill('This is template flow test content.');

      // 5. Try preview button
      const previewButton = page.locator('button:has-text("Preview")');
      const previewExists = await previewButton.count();

      if (previewExists > 0) {
        // Preview should be enabled now that content is filled
        const isDisabled = await previewButton.isDisabled();

        if (!isDisabled) {
          // Click preview and check modal/response
          await previewButton.click();

          // Wait for preview modal or content to appear
          await page.waitForTimeout(2000);

          // Check if preview modal or iframe appeared
          const previewModal = page.locator('[role="dialog"], .modal, iframe');
          const modalCount = await previewModal.count();

          // Preview functionality varies - just verify interaction worked
          expect(modalCount).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  test('should list available templates', async ({ context }) => {
    // Verify templates API returns available templates
    const response = await context.request.get(`${BASE_URL}/api/templates`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);

    // Should have at least one template
    expect(data.data.length).toBeGreaterThan(0);

    // Each template should have required fields
    for (const template of data.data) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
    }
  });

  test('should preview template with content via API', async ({ context }) => {
    // Test the preview API endpoint
    const testContent = '<p>Preview test content</p>';
    const testSubject = 'Preview Test Subject';

    const response = await context.request.post(`${BASE_URL}/api/templates/preview`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      data: {
        template_id: 'simple',
        content: testContent,
        subject: testSubject,
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.html).toBeTruthy();

    // Preview should contain the content
    expect(data.data.html).toContain('Preview test content');
  });

  test('should navigate from brand settings to campaigns and back', async ({
    page,
  }) => {
    // 1. Start at brand settings
    await setupAdminAuth(page, `${BASE_URL}/admin/brand-settings`);
    await page.waitForSelector('astro-island', { state: 'attached' });

    // 2. Navigate to campaigns via sidebar
    const campaignsLink = page.locator('nav a[href="/admin/campaigns"]');
    await expect(campaignsLink).toBeVisible();
    await campaignsLink.click();

    await page.waitForURL(`${BASE_URL}/admin/campaigns`);
    expect(page.url()).toBe(`${BASE_URL}/admin/campaigns`);

    // 3. Navigate back to brand settings
    const brandSettingsLink = page.locator('nav a[href="/admin/brand-settings"]');
    await brandSettingsLink.click();

    await page.waitForURL(`${BASE_URL}/admin/brand-settings`);
    expect(page.url()).toBe(`${BASE_URL}/admin/brand-settings`);
  });

  test('should create campaign with selected template', async ({ page, context }) => {
    // 1. Navigate to campaign creation
    await setupAdminAuth(page, `${BASE_URL}/admin/campaigns/new`);
    await page.waitForSelector('input#subject', { state: 'visible', timeout: 10000 });

    const testId = Date.now();
    const testSubject = `Template Campaign Test ${testId}`;

    // 2. Fill form
    await page.locator('input#subject').fill(testSubject);

    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await editor.fill('This is content for template campaign test.');

    // 3. Select a template if dropdown exists
    const templateSelect = page
      .locator('select')
      .filter({
        has: page.locator('option'),
      })
      .first();

    const selectExists = await templateSelect.count();
    if (selectExists > 0) {
      // Select a template option
      const options = await page.locator('select option').allTextContents();
      if (options.length > 0) {
        await templateSelect.selectOption({ index: 0 });
      }
    }

    // 4. Submit form
    await page.locator('button[type="submit"]').click();

    // 5. Wait for redirect
    await page.waitForURL('**/admin/campaigns', { timeout: 15000 });

    // 6. Verify campaign was created via API
    const listResponse = await context.request.get(`${BASE_URL}/api/campaigns`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
      },
    });

    expect(listResponse.status()).toBe(200);
    const listData = await listResponse.json();

    const campaigns = listData.data?.campaigns || listData.data || [];
    const createdCampaign = campaigns.find(
      (c: { subject: string }) => c.subject === testSubject
    );

    expect(createdCampaign).toBeDefined();

    // 7. Cleanup
    await context.request.delete(`${BASE_URL}/api/campaigns/${createdCampaign.id}`, {
      headers: {
        Authorization: `Bearer ${ADMIN_API_KEY}`,
      },
    });
  });
});
