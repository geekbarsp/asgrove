import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset URLs: works at the domain root or under a sub-path (GitHub Pages)
  build: { chunkSizeWarningLimit: 1500 },
  server: { port: 5173 },
});
