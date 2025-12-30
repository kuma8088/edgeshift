import { test, expect } from '@playwright/test';

const BASE_URL = 'https://edgeshift.tech';

test.describe('Archive Flow - Production', () => {
  test('should navigate from archive list to article detail and back', async ({ page }) => {
    // 1. Navigate to archive list page
    await page.goto(`${BASE_URL}/newsletter/archive`);
    await page.waitForSelector('h1', { state: 'visible' });

    // Verify archive page loaded
    await expect(page.locator('h1')).toContainText('Newsletter Archive');

    // 2. Wait for articles to load
    const articleCards = page.locator('article');
    await expect(articleCards.first()).toBeVisible({ timeout: 10000 });

    // 3. Get the first article title for verification
    const firstArticle = articleCards.first();
    const articleTitle = await firstArticle.locator('h2').textContent();
    expect(articleTitle).toBeTruthy();

    // 4. Click on the article to navigate to detail
    const articleLink = firstArticle.locator('a[href^="/newsletter/archive/"]');
    await articleLink.click();
    await page.waitForLoadState('networkidle');

    // 5. Verify detail page loaded
    await expect(page.locator('article h1')).toBeVisible();
    const detailTitle = await page.locator('article h1').textContent();
    expect(detailTitle).toBeTruthy();

    // 6. Verify article content is rendered
    await expect(page.locator('article div.prose')).toBeVisible();

    // 7. Click back link to return to archive list
    const backLink = page.locator('a[href="/newsletter/archive"]').first();
    await expect(backLink).toBeVisible();
    await backLink.click();

    // 8. Verify we're back on archive list
    await page.waitForURL(`${BASE_URL}/newsletter/archive`);
    await expect(page.locator('h1')).toContainText('Newsletter Archive');

    // 9. Verify articles are still visible
    await expect(articleCards.first()).toBeVisible();
  });

  test('should navigate through multiple articles', async ({ page }) => {
    // Navigate to archive list
    await page.goto(`${BASE_URL}/newsletter/archive`);
    await page.waitForSelector('article');

    const articleCount = await page.locator('article').count();

    // If there are multiple articles, navigate through them
    if (articleCount >= 2) {
      // Click first article
      await page.locator('article').first().locator('a[href^="/newsletter/archive/"]').click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('article h1')).toBeVisible();
      const firstTitle = await page.locator('article h1').textContent();

      // Go back
      await page.locator('a[href="/newsletter/archive"]').first().click();
      await page.waitForURL(`${BASE_URL}/newsletter/archive`);

      // Click second article
      await page.locator('article').nth(1).locator('a[href^="/newsletter/archive/"]').click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('article h1')).toBeVisible();
      const secondTitle = await page.locator('article h1').textContent();

      // Verify different articles
      expect(firstTitle).not.toBe(secondTitle);
    }
  });

  test('should have working RSS feed link', async ({ page, context }) => {
    // Navigate to archive page
    await page.goto(`${BASE_URL}/newsletter/archive`);
    await page.waitForLoadState('networkidle');

    // Check if RSS link exists (might be in header or footer)
    const rssLink = page.locator('a[href*="feed.xml"]');
    const rssLinkCount = await rssLink.count();

    if (rssLinkCount > 0) {
      // Get the href
      const href = await rssLink.first().getAttribute('href');
      expect(href).toContain('feed.xml');

      // Fetch the RSS feed
      const response = await context.request.get(`${BASE_URL}/newsletter/feed.xml`);
      expect(response.status()).toBe(200);

      const content = await response.text();
      expect(content).toContain('<rss');
      expect(content).toContain('<item>');
    } else {
      // RSS feed should still be accessible via direct URL
      const response = await context.request.get(`${BASE_URL}/newsletter/feed.xml`);
      expect(response.status()).toBe(200);
    }
  });

  test('should display article metadata correctly', async ({ page }) => {
    // Navigate to archive and click first article
    await page.goto(`${BASE_URL}/newsletter/archive`);
    await page.waitForSelector('article');

    const articleLink = page
      .locator('article')
      .first()
      .locator('a[href^="/newsletter/archive/"]');
    await articleLink.click();
    await page.waitForLoadState('networkidle');

    // Verify article has title
    await expect(page.locator('article h1')).toBeVisible();

    // Verify article has content
    await expect(page.locator('article div.prose')).toBeVisible();

    // Check OGP meta tags are present
    const ogTitle = page.locator('meta[property="og:title"]');
    const ogDescription = page.locator('meta[property="og:description"]');
    const ogType = page.locator('meta[property="og:type"]');

    await expect(ogTitle).toHaveAttribute('content', /.+/);
    await expect(ogDescription).toHaveAttribute('content', /.+/);
    await expect(ogType).toHaveAttribute('content', 'article');
  });

  test('should handle browser back button correctly', async ({ page }) => {
    // Navigate to archive
    await page.goto(`${BASE_URL}/newsletter/archive`);
    await page.waitForSelector('article');

    // Click first article
    await page
      .locator('article')
      .first()
      .locator('a[href^="/newsletter/archive/"]')
      .click();
    await page.waitForLoadState('networkidle');

    // Verify on detail page
    await expect(page.locator('article h1')).toBeVisible();

    // Use browser back button
    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Verify back on archive list
    await expect(page.locator('h1')).toContainText('Newsletter Archive');
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('should be accessible from home page navigation', async ({ page }) => {
    // Start from home page
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Look for a link to newsletter or archive
    const archiveLink = page.locator(
      'a[href="/newsletter/archive"], a[href*="newsletter"]'
    );
    const linkCount = await archiveLink.count();

    if (linkCount > 0) {
      await archiveLink.first().click();
      await page.waitForLoadState('domcontentloaded');

      // Should be on archive or newsletter related page
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/newsletter/);
    }
  });
});
