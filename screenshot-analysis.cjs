const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Full page screenshot
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4324/');
  await page.waitForTimeout(2000); // Wait for typing animation

  // Take full page screenshot
  await page.screenshot({
    path: 'screenshots/portfolio-full-new.png',
    fullPage: true
  });
  console.log('Full page screenshot saved');

  // Hero section
  await page.screenshot({
    path: 'screenshots/portfolio-hero-new.png',
    clip: { x: 0, y: 0, width: 1440, height: 900 }
  });
  console.log('Hero section screenshot saved');

  // Mobile view
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('http://localhost:4324/');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: 'screenshots/portfolio-mobile-new.png',
    fullPage: true
  });
  console.log('Mobile screenshot saved');

  await browser.close();
  console.log('All screenshots completed');
})();
