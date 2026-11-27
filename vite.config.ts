import { resolve } from 'node:path';
import { defineConfig, type PreviewServer, type ViteDevServer } from 'vite';
import firebaseConfig from './firebase.json';

const root = resolve(import.meta.dirname, 'apps/web');
const workspaceRewrites = firebaseConfig.hosting.rewrites.flatMap(({ regex, destination }) =>
  regex && (destination === '/login.html' || destination === '/advin.html')
    ? [{ pattern: new RegExp(regex), destination }]
    : [],
);

function serveWorkspaceRoutes(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((req, _res, next) => {
    if (req.url && (req.method === 'GET' || req.method === 'HEAD')) {
      const { pathname, search } = new URL(req.url, 'http://localhost');
      const route = workspaceRewrites.find(({ pattern }) => pattern.test(pathname));
      if (route) req.url = route.destination + search;
    }
    next();
  });
}

export default defineConfig({
  root,
  envDir: import.meta.dirname,
  plugins: [{
    name: 'workspace-routes',
    configureServer: serveWorkspaceRoutes,
    configurePreviewServer: serveWorkspaceRoutes,
  }],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: [resolve(root, 'index.html'), resolve(root, 'login.html'), resolve(root, 'faq.html'), resolve(root, 'register.html'), resolve(root, 'advin.html')] },
  },
});
