/**
 * Post-build script to patch _routes.json
 * Ensures /api/* routes are excluded from Cloudflare Pages
 * so they are handled by Cloudflare Workers instead.
 *
 * CRITICAL: This script must succeed for correct routing.
 * If _routes.json is missing or malformed, the build MUST fail.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROUTES_FILE = join(process.cwd(), 'dist', '_routes.json');

function patchRoutes() {
  // CRITICAL: _routes.json must exist after build
  if (!existsSync(ROUTES_FILE)) {
    console.error('ERROR: _routes.json not found at', ROUTES_FILE);
    console.error('Build output may be corrupted or in unexpected location.');
    process.exit(1);
  }

  let routes;
  try {
    routes = JSON.parse(readFileSync(ROUTES_FILE, 'utf-8'));
  } catch (e) {
    console.error('ERROR: Failed to parse _routes.json:', e.message);
    process.exit(1);
  }

  // Validate and normalize exclude array
  if (!routes.exclude) {
    routes.exclude = [];
  } else if (!Array.isArray(routes.exclude)) {
    console.error('ERROR: routes.exclude is not an array:', typeof routes.exclude);
    process.exit(1);
  }

  // Add /api/* to exclude list if not present
  if (!routes.exclude.includes('/api/*')) {
    routes.exclude.push('/api/*');
    console.log('Added /api/* to _routes.json exclude list');
  } else {
    console.log('/api/* already in exclude list');
  }

  writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2));
  console.log('_routes.json patched successfully');
}

patchRoutes();
