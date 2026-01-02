import { test, expect } from '@playwright/test';

/**
 * Auth Session Tests
 * Tests the frontend behavior with mocked authenticated API responses.
 * Verifies that SessionAuthProvider correctly handles the nested user response.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:4321';

test.describe('Auth Session Handling', () => {
  test('should handle getCurrentUser response with nested user correctly', async ({ page }) => {
    // Mock the /auth/me endpoint to return the actual backend format
    await page.route('**/api/premium/auth/me', async (route) => {
      // This is the ACTUAL format the backend returns
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: 'test-user-id',
              email: 'test@example.com',
              name: 'Test User',
              role: 'owner',
              created_at: 1704067200,
              updated_at: 1704067200,
            },
            authMethod: 'session',
          },
        }),
      });
    });

    // Navigate to dashboard
    await page.goto(`${BASE_URL}/auth/dashboard`);

    // Wait for the page to load and process auth
    await page.waitForTimeout(2000);

    // Should NOT redirect to login (auth loop bug)
    const url = page.url();
    console.log('Final URL:', url);

    // If the fix works, we should stay on dashboard or see dashboard content
    // If the bug exists, we'd be redirected to /auth/login
    expect(url).not.toContain('/auth/login');
    expect(url).toContain('/auth/dashboard');

    // Verify dashboard content is visible (admin dashboard for owner role)
    const dashboardHeading = page.getByRole('heading', { name: '管理ダッシュボード' });
    await expect(dashboardHeading).toBeVisible({ timeout: 5000 });
  });

  test('should redirect to login when not authenticated', async ({ page }) => {
    // Mock the /auth/me endpoint to return 401
    await page.route('**/api/premium/auth/me', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Unauthorized',
        }),
      });
    });

    // Navigate to dashboard
    await page.goto(`${BASE_URL}/auth/dashboard`);

    // Wait for redirect
    await page.waitForTimeout(2000);

    // Should redirect to login
    expect(page.url()).toContain('/auth/login');
  });

  test('should handle subscriber role correctly', async ({ page }) => {
    // Mock the /auth/me endpoint with subscriber role
    await page.route('**/api/premium/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: 'subscriber-id',
              email: 'subscriber@example.com',
              name: 'Subscriber',
              role: 'subscriber',
              created_at: 1704067200,
              updated_at: 1704067200,
            },
            authMethod: 'session',
          },
        }),
      });
    });

    // Navigate to dashboard
    await page.goto(`${BASE_URL}/auth/dashboard`);

    // Wait for the page to load
    await page.waitForTimeout(2000);

    // Should stay on dashboard (subscriber dashboard)
    expect(page.url()).toContain('/auth/dashboard');
  });
});
