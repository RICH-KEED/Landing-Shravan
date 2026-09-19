import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        orbit: resolve(import.meta.dirname, 'orbit.html'),
        console: resolve(import.meta.dirname, 'console.html'),
      },
    },
  },
});
