import { test, expect } from '@playwright/test';

const BASE_URL = 'https://edgeshift.tech';

test.describe('Newsletter Archive - Production', () => {
  test('should display archive index with articles', async ({ page }) => {
    await page.goto(`${BASE_URL}/newsletter/archive`);

    // Wait for content to load
    await page.waitForSelector('h1', { state: 'visible' });

    // Check page title
    await expect(page.locator('h1')).toContainText('Newsletter Archive');

    // Should have at least one article card
    const articleCards = page.locator('article');
    await expect(articleCards.first()).toBeVisible();

    // Each article should have title, excerpt, and read more link
    const firstCard = articleCards.first();
    await expect(firstCard.locator('h2')).toBeVisible();
    await expect(firstCard.locator('p')).toBeVisible(); // excerpt
    await expect(firstCard.locator('a[href^="/newsletter/archive/"]')).toBeVisible();
  });

  test('should open individual article page', async ({ page }) => {
    // First get a slug from the archive page
    await page.goto(`${BASE_URL}/newsletter/archive`);
    await page.waitForSelector('article a[href^="/newsletter/archive/"]');

    const firstArticleLink = page.locator('article a[href^="/newsletter/archive/"]').first();
    const href = await firstArticleLink.getAttribute('href');
    expect(href).toBeTruthy();

    // Navigate to article
    await firstArticleLink.click();
    await page.waitForLoadState('networkidle');

    // Should have article content
    await expect(page.locator('article h1')).toBeVisible();
    await expect(page.locator('article p').first()).toBeVisible();

    // Should have back link
    await expect(page.locator('a[href="/newsletter/archive"]')).toBeVisible();
  });

  test('should have valid RSS feed', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/newsletter/feed.xml`);
    expect(response?.status()).toBe(200);

    const content = await page.content();

    // Should be valid XML
    expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(content).toContain('<rss version="2.0"');
    expect(content).toContain('<channel>');
    expect(content).toContain('<title>');
    expect(content).toContain('<item>');
  });

  test('should have correct OGP meta tags on article page', async ({ page }) => {
    // Get first article URL
    await page.goto(`${BASE_URL}/newsletter/archive`);
    await page.waitForSelector('article a[href^="/newsletter/archive/"]');

    const firstArticleLink = page.locator('article a[href^="/newsletter/archive/"]').first();
    await firstArticleLink.click();
    await page.waitForLoadState('networkidle');

    // Check OGP meta tags
    const ogTitle = page.locator('meta[property="og:title"]');
    const ogDescription = page.locator('meta[property="og:description"]');
    const ogType = page.locator('meta[property="og:type"]');
    const ogUrl = page.locator('meta[property="og:url"]');

    await expect(ogTitle).toHaveAttribute('content', /.+/);
    await expect(ogDescription).toHaveAttribute('content', /.+/);
    await expect(ogType).toHaveAttribute('content', 'article');
    await expect(ogUrl).toHaveAttribute('content', /https:\/\/edgeshift\.tech\/newsletter\/archive\/.+/);
  });

  test('should return 404 for unpublished articles', async ({ page }) => {
    // Try to access a non-existent article
    const response = await page.goto(`${BASE_URL}/newsletter/archive/this-article-does-not-exist-12345`);
    expect(response?.status()).toBe(404);
  });

  test('should have proper navigation structure', async ({ page }) => {
    await page.goto(`${BASE_URL}/newsletter/archive`);

    // Should have header/nav links
    const homeLink = page.locator('a[href="/"]');
    await expect(homeLink.first()).toBeVisible();

    // Should have breadcrumbs or back navigation
    const navElements = page.locator('nav');
    expect(await navElements.count()).toBeGreaterThan(0);
  });

  test('should be mobile responsive', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/newsletter/archive`);

    // Content should be visible and not overflow
    const article = page.locator('article').first();
    await expect(article).toBeVisible();

    // Check that horizontal scroll is not needed
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 1); // Allow 1px tolerance
  });
});
