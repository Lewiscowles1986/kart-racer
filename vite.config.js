import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the static build works at any subpath (e.g. GitHub Pages /kart-racer/).
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
});
