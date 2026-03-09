// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSpecCatalogFromRepository, loadSpecMarkdownFilesFromRepository } from './spec-discovery';

const tempDirs: string[] = [];

async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'spechub-web-specs-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('loadSpecMarkdownFilesFromRepository', () => {
  it('returns an empty list when specs directory is missing', async () => {
    const repoRoot = await createTempRepo();

    await expect(loadSpecMarkdownFilesFromRepository(repoRoot)).resolves.toEqual([]);
  });

  it('loads only SPEC.md files from spec directories', async () => {
    const repoRoot = await createTempRepo();

    await mkdir(path.join(repoRoot, 'specs', 'create-harness'), { recursive: true });
    await mkdir(path.join(repoRoot, 'specs', 'missing-spec-file'), { recursive: true });
    await writeFile(path.join(repoRoot, 'specs', 'README.md'), 'not a spec directory', 'utf8');
    await writeFile(
      path.join(repoRoot, 'specs', 'create-harness', 'SPEC.md'),
      '# Create Harness\n\nBuild systems.\n',
      'utf8',
    );

    const files = await loadSpecMarkdownFilesFromRepository(repoRoot);

    expect(files).toEqual([
      {
        path: 'specs/create-harness/SPEC.md',
        content: '# Create Harness\n\nBuild systems.\n',
      },
    ]);
  });
});

describe('loadSpecCatalogFromRepository', () => {
  it('builds sorted catalog entries with install commands', async () => {
    const repoRoot = await createTempRepo();

    await mkdir(path.join(repoRoot, 'specs', 'z-spec'), { recursive: true });
    await mkdir(path.join(repoRoot, 'specs', 'a-spec'), { recursive: true });
    await writeFile(path.join(repoRoot, 'specs', 'z-spec', 'SPEC.md'), '# Z Spec\n\nZ summary.\n', 'utf8');
    await writeFile(path.join(repoRoot, 'specs', 'a-spec', 'SPEC.md'), '# A Spec\n\nA summary.\n', 'utf8');

    const catalog = await loadSpecCatalogFromRepository(repoRoot, {
      ownerRepo: 'openai/spechub',
      ref: 'main',
    });

    expect(catalog.map((entry) => entry.slug)).toEqual(['a-spec', 'z-spec']);
    expect(catalog[0]?.installCommand).toBe(
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "a-spec"',
    );
  });
});
