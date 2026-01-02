import { test, expect, type Page } from '@playwright/test';

/**
 * Debug-only tests for AI content flow.
 * These tests hit live endpoints and should NOT run in CI.
 *
 * To run: DEBUG_AI_FLOW=true ADMIN_API_KEY=xxx npx playwright test flows/ai-content-flow
 */
const DEBUG_AI_FLOW = process.env.DEBUG_AI_FLOW === 'true';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4321';
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

test.describe('AI Content Flow - Debug', () => {
  // Skip unless explicitly enabled with both flag and API key
  test.skip(!DEBUG_AI_FLOW || !ADMIN_API_KEY, 'Debug tests - set DEBUG_AI_FLOW=true and ADMIN_API_KEY to run');

  test('should generate content using AI assistant on campaign page', async ({
    page,
  }) => {
    // 1. Navigate to campaign creation page
    await setupAdminAuth(page, `${BASE_URL}/admin/campaigns/new`);

    // Wait for form to load
    await page.waitForSelector('input#subject', { state: 'visible', timeout: 10000 });

    // 2. Click AI Assistant button to open panel
    const aiButton = page.locator('button:has-text("AI アシスタント")');
    await expect(aiButton).toBeVisible();
    await aiButton.click();

    // 3. Wait for AI panel to appear
    await page.waitForSelector('h2:has-text("AI アシスタント")', {
      state: 'visible',
      timeout: 5000,
    });

    // 4. Test content generation
    const contentTextarea = page.locator(
      'textarea[placeholder*="生成したいコンテンツの説明を入力"]'
    );
    await expect(contentTextarea).toBeVisible();
    await contentTextarea.fill('TypeScriptの型安全性についての短い解説');

    // 5. Click generate button
    const generateButton = page.locator('button:has-text("コンテンツを生成")');
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // 6. Wait for content generation (may take a few seconds)
    // Check that either content appears or no error message
    await page.waitForTimeout(5000);

    // 7. Verify no error message
    const errorMessage = page.locator('text="Failed to generate content"');
    const hasError = await errorMessage.count();
    expect(hasError).toBe(0);
  });

  test('should suggest subjects using AI assistant', async ({ page }) => {
    // 1. Navigate to campaign creation page
    await setupAdminAuth(page, `${BASE_URL}/admin/campaigns/new`);
    await page.waitForSelector('input#subject', { state: 'visible', timeout: 10000 });

    // 2. Open AI panel
    const aiButton = page.locator('button:has-text("AI アシスタント")');
    await aiButton.click();
    await page.waitForSelector('h2:has-text("AI アシスタント")', {
      state: 'visible',
      timeout: 5000,
    });

    // 3. Find subject suggestion section
    const subjectInput = page.locator(
      'input[placeholder*="ニュースレターのトピックを入力"]'
    );
    await expect(subjectInput).toBeVisible();
    await subjectInput.fill('TypeScript best practices');

    // 4. Click suggest button
    const suggestButton = page.locator('button:has-text("提案する")');
    await expect(suggestButton).toBeEnabled();
    await suggestButton.click();

    // 5. Wait for suggestions
    await page.waitForTimeout(5000);

    // 6. Verify no error
    const errorMessage = page.locator('text="Failed to suggest subjects"');
    const hasError = await errorMessage.count();
    expect(hasError).toBe(0);
  });
});
