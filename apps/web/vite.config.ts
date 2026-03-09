import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { parseGitHubOwnerRepo, type RepoSource } from './src/lib/spec-catalog';
import { loadSpecCatalogFromRepository } from './src/lib/spec-discovery';

const SPEC_CATALOG_VIRTUAL_ID = 'virtual:spec-catalog';
const RESOLVED_SPEC_CATALOG_VIRTUAL_ID = `\0${SPEC_CATALOG_VIRTUAL_ID}`;

function gitOutput(repoRoot: string, args: string[]): string | null {
  try {
    const output = execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function detectRepoSource(repoRoot: string): RepoSource | undefined {
  const ownerRepoFromEnv = process.env.SPECHUB_REPO?.trim();
  const refFromEnv = process.env.SPECHUB_REF?.trim();
  if (ownerRepoFromEnv && refFromEnv) {
    return {
      ownerRepo: ownerRepoFromEnv,
      ref: refFromEnv,
    };
  }

  const remoteUrl = gitOutput(repoRoot, ['remote', 'get-url', 'origin']);
  if (!remoteUrl) {
    return undefined;
  }

  const ownerRepo = parseGitHubOwnerRepo(remoteUrl);
  if (!ownerRepo) {
    return undefined;
  }

  const originHead = gitOutput(repoRoot, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  const ref = originHead?.startsWith('origin/') ? originHead.slice('origin/'.length) : 'main';

  return {
    ownerRepo,
    ref: ref || 'main',
  };
}

function specCatalogPlugin(repoRoot: string): Plugin {
  return {
    name: 'spechub-spec-catalog',
    resolveId(id) {
      if (id === SPEC_CATALOG_VIRTUAL_ID) {
        return RESOLVED_SPEC_CATALOG_VIRTUAL_ID;
      }

      return null;
    },
    async load(id) {
      if (id !== RESOLVED_SPEC_CATALOG_VIRTUAL_ID) {
        return null;
      }

      const repoSource = detectRepoSource(repoRoot);
      const specCatalog = await loadSpecCatalogFromRepository(repoRoot, repoSource);

      return `export const specCatalog = ${JSON.stringify(specCatalog)};`;
    },
  };
}

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [react(), specCatalogPlugin(repoRoot)],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
