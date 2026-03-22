import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildSpecCatalog,
  parseGitHubOwnerRepo,
  type RepoSource,
  type SpecCatalogEntry,
  type SpecMarkdownFile,
  type SpecMetadata,
} from './spec-catalog';

function toPosixPath(filePath: string): string {
  return filePath.replaceAll(path.sep, '/');
}

function parseSpecMetadata(rawMetadata: string): SpecMetadata | null {
  try {
    const parsed = JSON.parse(rawMetadata) as {
      source?: unknown;
      synced_date?: unknown;
    };

    if (typeof parsed.source !== 'string' || typeof parsed.synced_date !== 'string') {
      return null;
    }

    const source = parsed.source.trim();
    const syncedDate = parsed.synced_date.trim();
    if (!source || !syncedDate) {
      return null;
    }

    return {
      source,
      syncedDate,
    };
  } catch {
    return null;
  }
}

async function loadSpecMetadata(specRoot: string): Promise<SpecMetadata | null> {
  const metadataPath = path.join(specRoot, 'metadata.json');

  try {
    const metadataContent = await readFile(metadataPath, 'utf8');
    return parseSpecMetadata(metadataContent);
  } catch {
    return null;
  }
}

async function loadOptionalMarkdown(specRoot: string, filename: string): Promise<string | null> {
  try {
    return await readFile(path.join(specRoot, filename), 'utf8');
  } catch {
    return null;
  }
}

function parseReadmeAssetBaseUrl(upstream: string, metadata: SpecMetadata | null): string | null {
  if (!metadata) {
    return null;
  }

  const ownerRepo = parseGitHubOwnerRepo(`${metadata.source}.git`);
  const commitMatch = upstream.match(/Resolved commit at fetch time \(\d{4}-\d{2}-\d{2}\): `([0-9a-f]{40})`/);
  if (!ownerRepo || !commitMatch?.[1]) {
    return null;
  }

  const prefix = upstream.includes('Upstream `spec/` directory copied') ? 'spec/' : '';
  return `https://raw.githubusercontent.com/${ownerRepo}/${commitMatch[1]}/${prefix}`;
}

async function loadReadmeAssetBaseUrl(specRoot: string, metadata: SpecMetadata | null): Promise<string | null> {
  try {
    const upstream = await readFile(path.join(specRoot, 'UPSTREAM.md'), 'utf8');
    return parseReadmeAssetBaseUrl(upstream, metadata);
  } catch {
    return null;
  }
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
      .map<Promise<SpecMarkdownFile | null>>(async (entry) => {
        const specRoot = path.join(specsRoot, entry.name);
        const specPath = path.join(specRoot, 'SPEC.md');

        try {
          const [content, readmeContent, metadata] = await Promise.all([
            readFile(specPath, 'utf8'),
            loadOptionalMarkdown(specRoot, 'README.md'),
            loadSpecMetadata(specRoot),
          ]);
          const readmeAssetBaseUrl = await loadReadmeAssetBaseUrl(specRoot, metadata);
          return {
            path: toPosixPath(path.relative(repoRoot, specPath)),
            content,
            readmeContent,
            readmeAssetBaseUrl,
            metadata,
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
