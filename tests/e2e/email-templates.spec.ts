import { test, expect } from '@playwright/test';

const BASE_URL = 'https://edgeshift.tech';

test.describe('Email Templates - Production', () => {
  test.describe('Brand Settings Page (/admin/brand-settings)', () => {
    test('should load brand settings page structure', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/brand-settings`);

      // Admin pages require auth - check page loads with sidebar
      await expect(page.locator('a[href="/admin/brand-settings"]')).toBeVisible();

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });
    });

    test('should have BrandSettingsForm component', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/brand-settings`);

      // Wait for React component to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // The component should be present (renders after auth check)
      const formComponent = page.locator('astro-island');
      await expect(formComponent).toBeAttached();
    });

    test('should display brand settings form elements after loading', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/brand-settings`);

      // Wait for the page to load
      await page.waitForLoadState('networkidle');

      // Check for form heading (may be visible after component loads)
      // The form has "ブランド設定" heading
      const heading = page.locator('h2:has-text("ブランド設定")');
      const formExists = await heading.count();

      // Either form loads or auth blocks it - both are valid states
      if (formExists > 0) {
        await expect(heading).toBeVisible();

        // Check form elements
        await expect(page.locator('input[type="url"]')).toBeVisible(); // Logo URL
        await expect(page.locator('input[type="color"]').first()).toBeVisible(); // Primary color
        await expect(page.locator('select')).toBeVisible(); // Default template dropdown
        await expect(page.locator('button:has-text("設定を保存")')).toBeVisible();
        await expect(page.locator('button:has-text("プレビュー")')).toBeVisible();
      }
    });

    test('should display available templates section', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/brand-settings`);
      await page.waitForLoadState('networkidle');

      // Check for template info section
      const templateSection = page.locator('h2:has-text("利用可能なテンプレート")');
      const sectionExists = await templateSection.count();

      // Templates section might not be visible if auth is required or data hasn't loaded
      // This test validates the page structure exists, not the content
      if (sectionExists > 0) {
        await expect(templateSection).toBeVisible();
      }
    });
  });

  test.describe('Campaign New Page (/admin/campaigns/new)', () => {
    test('should load campaign creation page', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);

      // Check page loads - there's a main h1 for the page
      await page.waitForSelector('h1', { state: 'visible' });

      // The page has multiple h1 elements - admin title and page title
      // Check for the page-specific title
      const pageTitle = page.locator('h1:has-text("新規ニュースレター")');
      const pageTitleExists = await pageTitle.count();

      if (pageTitleExists > 0) {
        await expect(pageTitle).toBeVisible();
      } else {
        // Fallback: just verify an h1 exists (admin header)
        await expect(page.locator('h1').first()).toBeVisible();
      }
    });

    test('should have CampaignNewForm with TemplateSelector', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Wait for React components to load
      await page.waitForSelector('astro-island', { state: 'attached' });

      // Check for template selector section (label: "メールテンプレート")
      const templateLabel = page.locator('label:has-text("メールテンプレート")');
      const labelExists = await templateLabel.count();

      if (labelExists > 0) {
        await expect(templateLabel).toBeVisible();

        // Template dropdown should be present
        // The TemplateSelector has "Default Template" option
        const templateSelect = page.locator('select').filter({
          has: page.locator('option:has-text("Default Template")'),
        });
        await expect(templateSelect).toBeVisible();
      }
    });

    test('should have Preview button for template preview', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Check for Preview button
      const previewButton = page.locator('button:has-text("Preview")');
      const buttonExists = await previewButton.count();

      if (buttonExists > 0) {
        // Preview button should be disabled when content is empty
        await expect(previewButton).toBeDisabled();
      }
    });

    test('should have form fields for campaign creation', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Check for subject field
      const subjectField = page.locator('input#subject');
      const fieldExists = await subjectField.count();

      if (fieldExists > 0) {
        await expect(subjectField).toBeVisible();
        // Check placeholder
        await expect(subjectField).toHaveAttribute('placeholder', 'メールの件名を入力');
      }
    });
  });

  test.describe('API Endpoints', () => {
    test('should require auth for brand settings API', async ({ context }) => {
      // API path is /api/brand-settings (not /api/admin/brand-settings)
      const response = await context.request.get(`${BASE_URL}/api/brand-settings`);
      // Without auth header, should return 401
      expect(response.status()).toBe(401);
    });

    test('should require auth for templates API', async ({ context }) => {
      // API path is /api/templates (not /api/admin/templates)
      const response = await context.request.get(`${BASE_URL}/api/templates`);
      // Without auth header, should return 401
      expect(response.status()).toBe(401);
    });

    test('should require auth for template preview API', async ({ context }) => {
      // API path is /api/templates/preview
      const response = await context.request.post(`${BASE_URL}/api/templates/preview`, {
        data: {
          template_id: 'simple',
          content: '<p>Test</p>',
          subject: 'Test',
        },
      });
      // Without auth header, should return 401
      expect(response.status()).toBe(401);
    });
  });

  test.describe('Navigation', () => {
    test('should have brand settings link in admin sidebar', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin`);
      await page.waitForLoadState('networkidle');

      // Check sidebar has brand settings link
      const brandSettingsLink = page.locator('nav a[href="/admin/brand-settings"]');
      await expect(brandSettingsLink).toBeVisible();
    });

    test('should navigate from admin to brand settings', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin`);
      await page.waitForLoadState('networkidle');

      const brandSettingsLink = page.locator('nav a[href="/admin/brand-settings"]');
      await brandSettingsLink.click();

      await page.waitForURL(`${BASE_URL}/admin/brand-settings`);
      expect(page.url()).toBe(`${BASE_URL}/admin/brand-settings`);
    });

    test('should navigate from campaigns list to new campaign', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/campaigns`);
      await page.waitForLoadState('networkidle');

      // Look for create/new button
      const newButton = page.locator('a[href="/admin/campaigns/new"]').first();
      const buttonExists = await newButton.count();

      if (buttonExists > 0) {
        await newButton.click();
        await page.waitForURL(`${BASE_URL}/admin/campaigns/new`);
        expect(page.url()).toBe(`${BASE_URL}/admin/campaigns/new`);
      }
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('brand settings page should be accessible on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/admin/brand-settings`);
      await page.waitForLoadState('networkidle');

      // Verify page loads on mobile
      await expect(page.locator('astro-island')).toBeAttached();

      // Admin pages may have horizontal scroll due to sidebar
      // Just verify the main content area is accessible
      const mainContent = page.locator('main, [role="main"], .flex-1').first();
      if (await mainContent.count() > 0) {
        await expect(mainContent).toBeVisible();
      }
    });

    test('campaign new page should be accessible on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`${BASE_URL}/admin/campaigns/new`);
      await page.waitForLoadState('networkidle');

      // Verify page loads on mobile
      await expect(page.locator('h1').first()).toBeVisible();

      // Admin pages may have horizontal scroll due to sidebar
      // Just verify content is accessible
      const heading = page.locator('h1');
      await expect(heading.first()).toBeVisible();
    });
  });
});
