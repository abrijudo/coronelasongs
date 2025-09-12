import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  output: "server", 
  adapter: vercel(),
});

