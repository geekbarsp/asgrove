import { defineConfig } from 'vite';

export default defineConfig({
  build: { chunkSizeWarningLimit: 1500 },
  server: { port: 5173 },
});
