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

/** Short git hash of the build: the host's variable (Cloudflare Pages sets CF_PAGES_COMMIT_SHA), else git, else "dev". */
function buildHash(): string {
  const sha = process.env.CF_PAGES_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; } catch { return 'dev'; }
}

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
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
