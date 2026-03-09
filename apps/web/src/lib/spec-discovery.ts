import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSpecCatalog, type RepoSource, type SpecCatalogEntry, type SpecMarkdownFile } from './spec-catalog';

function toPosixPath(filePath: string): string {
  return filePath.replaceAll(path.sep, '/');
}

export async function loadSpecMarkdownFilesFromRepository(repoRoot: string): Promise<SpecMarkdownFile[]> {
  const specsRoot = path.join(repoRoot, 'specs');
  let entries: Awaited<ReturnType<typeof readdir>>;

  try {
    entries = await readdir(specsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const specPath = path.join(specsRoot, entry.name, 'SPEC.md');

        try {
          const content = await readFile(specPath, 'utf8');
          return {
            path: toPosixPath(path.relative(repoRoot, specPath)),
            content,
          } satisfies SpecMarkdownFile;
        } catch {
          return null;
        }
      }),
  );

  return files.filter((file): file is SpecMarkdownFile => file !== null);
}

export async function loadSpecCatalogFromRepository(
  repoRoot: string,
  repoSource?: RepoSource,
): Promise<SpecCatalogEntry[]> {
  const specFiles = await loadSpecMarkdownFilesFromRepository(repoRoot);
  return buildSpecCatalog(specFiles, repoSource);
}
