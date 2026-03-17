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

  it('loads SPEC.md files and optional README.md from spec directories', async () => {
    const repoRoot = await createTempRepo();

    await mkdir(path.join(repoRoot, 'specs', 'harness-spec'), { recursive: true });
    await mkdir(path.join(repoRoot, 'specs', 'missing-spec-file'), { recursive: true });
    await writeFile(path.join(repoRoot, 'specs', 'README.md'), 'not a spec directory', 'utf8');
    await writeFile(
      path.join(repoRoot, 'specs', 'harness-spec', 'SPEC.md'),
      '# Harness Spec\n\nBuild systems.\n',
      'utf8',
    );
    await writeFile(path.join(repoRoot, 'specs', 'harness-spec', 'README.md'), '# Readme\n\nExtra details.\n', 'utf8');

    const files = (await loadSpecMarkdownFilesFromRepository(repoRoot)).sort((a, b) => a.path.localeCompare(b.path));

    expect(files).toEqual([
      {
        path: 'specs/harness-spec/SPEC.md',
        content: '# Harness Spec\n\nBuild systems.\n',
        readmeContent: '# Readme\n\nExtra details.\n',
        metadata: null,
      },
    ]);
  });

  it('loads metadata from metadata.json and ignores invalid metadata payloads', async () => {
    const repoRoot = await createTempRepo();

    await mkdir(path.join(repoRoot, 'specs', 'symphony'), { recursive: true });
    await mkdir(path.join(repoRoot, 'specs', 'broken-spec'), { recursive: true });
    await mkdir(path.join(repoRoot, 'specs', 'invalid-json'), { recursive: true });

    await writeFile(path.join(repoRoot, 'specs', 'symphony', 'SPEC.md'), '# Symphony\n\nAgent loop.\n', 'utf8');
    await writeFile(
      path.join(repoRoot, 'specs', 'symphony', 'metadata.json'),
      JSON.stringify(
        {
          source: 'https://github.com/openai/symphony',
          synced_date: '2026-03-10T12:34:10Z',
        },
        null,
        2,
      ),
      'utf8',
    );

    await writeFile(path.join(repoRoot, 'specs', 'broken-spec', 'SPEC.md'), '# Broken\n\nBad metadata.\n', 'utf8');
    await writeFile(path.join(repoRoot, 'specs', 'broken-spec', 'metadata.json'), '{"source": 42}', 'utf8');
    await writeFile(path.join(repoRoot, 'specs', 'invalid-json', 'SPEC.md'), '# Invalid Json\n\nBad metadata json.\n', 'utf8');
    await writeFile(path.join(repoRoot, 'specs', 'invalid-json', 'metadata.json'), '{', 'utf8');

    const files = (await loadSpecMarkdownFilesFromRepository(repoRoot)).sort((a, b) => a.path.localeCompare(b.path));

    expect(files).toEqual([
      {
        path: 'specs/broken-spec/SPEC.md',
        content: '# Broken\n\nBad metadata.\n',
        readmeContent: null,
        metadata: null,
      },
      {
        path: 'specs/invalid-json/SPEC.md',
        content: '# Invalid Json\n\nBad metadata json.\n',
        readmeContent: null,
        metadata: null,
      },
      {
        path: 'specs/symphony/SPEC.md',
        content: '# Symphony\n\nAgent loop.\n',
        readmeContent: null,
        metadata: {
          source: 'https://github.com/openai/symphony',
          syncedDate: '2026-03-10T12:34:10Z',
        },
      },
    ]);
  });

  it('trims metadata string values and rejects empty metadata fields', async () => {
    const repoRoot = await createTempRepo();

    await mkdir(path.join(repoRoot, 'specs', 'trimmed-spec'), { recursive: true });
    await mkdir(path.join(repoRoot, 'specs', 'empty-metadata'), { recursive: true });

    await writeFile(path.join(repoRoot, 'specs', 'trimmed-spec', 'SPEC.md'), '# Trimmed\n\nValid metadata.\n', 'utf8');
    await writeFile(
      path.join(repoRoot, 'specs', 'trimmed-spec', 'metadata.json'),
      JSON.stringify(
        {
          source: '  https://github.com/openai/symphony  ',
          synced_date: ' 2026-03-10T12:34:10Z ',
        },
        null,
        2,
      ),
      'utf8',
    );

    await writeFile(path.join(repoRoot, 'specs', 'empty-metadata', 'SPEC.md'), '# Empty\n\nInvalid metadata.\n', 'utf8');
    await writeFile(
      path.join(repoRoot, 'specs', 'empty-metadata', 'metadata.json'),
      JSON.stringify(
        {
          source: '   ',
          synced_date: '2026-03-10T12:34:10Z',
        },
        null,
        2,
      ),
      'utf8',
    );

    const files = (await loadSpecMarkdownFilesFromRepository(repoRoot)).sort((a, b) => a.path.localeCompare(b.path));

    expect(files).toEqual([
      {
        path: 'specs/empty-metadata/SPEC.md',
        content: '# Empty\n\nInvalid metadata.\n',
        readmeContent: null,
        metadata: null,
      },
      {
        path: 'specs/trimmed-spec/SPEC.md',
        content: '# Trimmed\n\nValid metadata.\n',
        readmeContent: null,
        metadata: {
          source: 'https://github.com/openai/symphony',
          syncedDate: '2026-03-10T12:34:10Z',
        },
      },
    ]);
  });
});

describe('loadSpecCatalogFromRepository', () => {
  it('builds sorted catalog entries with implement prompts', async () => {
    const repoRoot = await createTempRepo();

    await mkdir(path.join(repoRoot, 'specs', 'z-spec'), { recursive: true });
    await mkdir(path.join(repoRoot, 'specs', 'a-spec'), { recursive: true });
    await writeFile(path.join(repoRoot, 'specs', 'z-spec', 'SPEC.md'), '# Z Spec\n\nZ summary.\n', 'utf8');
    await writeFile(path.join(repoRoot, 'specs', 'a-spec', 'SPEC.md'), '# A Spec\n\nA summary.\n', 'utf8');
    await writeFile(path.join(repoRoot, 'specs', 'a-spec', 'README.md'), '# A Readme\n\nSetup steps.\n', 'utf8');
    await writeFile(
      path.join(repoRoot, 'specs', 'a-spec', 'metadata.json'),
      JSON.stringify(
        {
          source: 'https://github.com/example/a-spec',
          synced_date: '2026-03-10T12:34:10Z',
        },
        null,
        2,
      ),
      'utf8',
    );

    const catalog = await loadSpecCatalogFromRepository(repoRoot, {
      ownerRepo: 'openai/spechub',
      ref: 'main',
    });

    expect(catalog.map((entry) => entry.slug)).toEqual(['a-spec', 'z-spec']);
    expect(catalog[0]?.implementPrompt).toBe(
      'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "a-spec"` command and start implement that spec.',
    );
    expect(catalog[0]?.readmeContent).toBe('# A Readme\n\nSetup steps.\n');
    expect(catalog[0]?.metadata).toEqual({
      source: 'https://github.com/example/a-spec',
      syncedDate: '2026-03-10T12:34:10Z',
    });
    expect(catalog[1]?.readmeContent).toBeNull();
    expect(catalog[1]?.metadata).toBeNull();
  });
});
