import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname, 'apps/web');
export default defineConfig({
  root,
  envDir: import.meta.dirname,
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: [resolve(root, 'index.html'), resolve(root, 'home.html'), resolve(root, 'faq.html'), resolve(root, 'admin/index.html')] },
  },
});
