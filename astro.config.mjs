// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://edgeshift.tech',
  output: 'server',
  adapter: cloudflare({
    mode: 'advanced',
    routes: {
      exclude: ['/api/*']
    }
  }),
  integrations: [sitemap(), react()],
  vite: {
    plugins: [tailwindcss()]
  }
});