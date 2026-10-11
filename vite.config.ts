import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';

/** Dev only: GET /__build answers with the current git branch and short hash, read fresh on every request. */
function buildInfo() {
  const git = (args: string) => { try { return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  return {
    name: 'build-info',
    configureServer(server: { middlewares: { use: (path: string, fn: (req: unknown, res: { setHeader(k: string, v: string): void; end(s: string): void }) => void) => void } }) {
      server.middlewares.use('/__build', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ branch: git('rev-parse --abbrev-ref HEAD'), hash: git('rev-parse --short HEAD'), dirty: git('status --porcelain').length > 0 }));
      });
    },
  };
}

export default defineConfig({
  plugins: [viteSingleFile(), buildInfo()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    brotliSize: false,
    rollupOptions: {
      inlineDynamicImports: true,
      output: {
        manualChunks: undefined,
      },
    },
  },
});
