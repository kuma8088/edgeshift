// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://edgeshift.tech',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [sitemap(), react()],
  vite: {
    plugins: [tailwindcss()]
  }
});