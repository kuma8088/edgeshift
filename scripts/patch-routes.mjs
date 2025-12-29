/**
 * Post-build script to patch _routes.json
 * Ensures /api/* routes are excluded from Cloudflare Pages
 * so they are handled by Cloudflare Workers instead.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROUTES_FILE = join(process.cwd(), 'dist', '_routes.json');

function patchRoutes() {
  if (!existsSync(ROUTES_FILE)) {
    console.log('_routes.json not found, skipping patch');
    return;
  }

  const routes = JSON.parse(readFileSync(ROUTES_FILE, 'utf-8'));

  // Ensure /api/* is in the exclude list
  if (!routes.exclude) {
    routes.exclude = [];
  }

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
