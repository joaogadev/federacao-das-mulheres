import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), '');
const site = process.env.SITE_URL || env.SITE_URL;

export default defineConfig({
  site:
    process.env.CONTENT_SOURCE === 'demo'
      ? 'http://localhost:4321'
      : site || 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
});
