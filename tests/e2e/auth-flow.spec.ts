import { test, expect } from '@playwright/test';

/**
 * Debug-only tests for auth flow investigation.
 * These tests hit live endpoints and should NOT run in CI.
 *
 * To run: DEBUG_AUTH_FLOW=true BASE_URL=https://your-preview.pages.dev npx playwright test auth-flow
 */
const DEBUG_AUTH_FLOW = process.env.DEBUG_AUTH_FLOW === 'true';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4321';
const API_URL = `${BASE_URL}/api/premium`;

test.describe('Auth Flow Debug', () => {
  // Skip all tests unless explicitly enabled
  test.skip(!DEBUG_AUTH_FLOW, 'Debug tests - set DEBUG_AUTH_FLOW=true to run');
  test('should verify CORS headers on auth endpoints', async ({ request }) => {
    // Check CORS preflight
    const preflight = await request.fetch(`${API_URL}/auth/me`, {
      method: 'OPTIONS',
      headers: {
        'Origin': BASE_URL,
        'Access-Control-Request-Method': 'GET',
      },
    });

    console.log('=== Preflight Response ===');
    console.log('Status:', preflight.status());

    const headers = preflight.headers();
    console.log('access-control-allow-origin:', headers['access-control-allow-origin']);
    console.log('access-control-allow-credentials:', headers['access-control-allow-credentials']);

    expect(headers['access-control-allow-credentials']).toBe('true');
    expect(headers['access-control-allow-origin']).toBe(BASE_URL);
  });

  test('should check /auth/me response without cookie', async ({ request }) => {
    const response = await request.get(`${API_URL}/auth/me`, {
      headers: {
        'Origin': BASE_URL,
      },
    });

    console.log('=== /auth/me without cookie ===');
    console.log('Status:', response.status());
    const body = await response.json();
    console.log('Body:', JSON.stringify(body, null, 2));

    // Should return 401 without cookie
    expect(response.status()).toBe(401);
  });

  test('should verify login page loads correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`);

    console.log('=== Login Page ===');
    console.log('URL:', page.url());

    // Should stay on login page
    expect(page.url()).toContain('/auth/login');

    // Check if email input exists
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });

  test('should trace auth redirect behavior', async ({ page }) => {
    // Go to dashboard directly (should redirect to login)
    console.log('=== Navigating to /auth/dashboard ===');

    await page.goto(`${BASE_URL}/auth/dashboard`);

    // Wait for potential redirects
    await page.waitForTimeout(2000);

    console.log('Final URL:', page.url());

    // Without auth, should end up at login
    expect(page.url()).toContain('/auth/login');
  });

  test('should check cookie behavior with browser context', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Enable request/response logging
    page.on('request', request => {
      if (request.url().includes('/api/premium/auth')) {
        console.log(`>> ${request.method()} ${request.url()}`);
        const cookies = request.headers()['cookie'];
        console.log('   Cookie header:', cookies || '(none)');
      }
    });

    page.on('response', response => {
      if (response.url().includes('/api/premium/auth')) {
        console.log(`<< ${response.status()} ${response.url()}`);
        const setCookie = response.headers()['set-cookie'];
        if (setCookie) {
          console.log('   Set-Cookie:', setCookie);
        }
      }
    });

    // Navigate to dashboard
    await page.goto(`${BASE_URL}/auth/dashboard`);
    await page.waitForTimeout(3000);

    // Get all cookies
    const cookies = await context.cookies();
    console.log('=== Cookies in context ===');
    cookies.forEach(c => {
      console.log(`  ${c.name}: ${c.value.substring(0, 20)}... (domain: ${c.domain})`);
    });

    await context.close();
  });
});
