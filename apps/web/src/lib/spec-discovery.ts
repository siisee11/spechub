import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildSpecCatalog,
  parseGitHubOwnerRepo,
  type RepoSource,
  type SpecConfig,
  type SpecCatalogEntry,
  type SpecDependencyDefinition,
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

function parseSpecConfig(rawConfig: string): SpecConfig | null {
  try {
    const parsed = JSON.parse(rawConfig) as {
      schema_version?: unknown;
      spec?: {
        key?: unknown;
        slug?: unknown;
        title?: unknown;
        entry?: unknown;
      };
      dependencies?: unknown;
      install?: {
        include_dependencies?: unknown;
      };
    };

    const spec = parsed.spec;
    if (
      parsed.schema_version !== 1 ||
      typeof spec?.key !== 'string' ||
      typeof spec.slug !== 'string' ||
      typeof spec.title !== 'string' ||
      typeof spec.entry !== 'string'
    ) {
      return null;
    }

    const key = spec.key.trim();
    const slug = spec.slug.trim();
    const title = spec.title.trim();
    const entry = spec.entry.trim();
    if (!key || !slug || !title || !entry) {
      return null;
    }

    const includeDependencies = parsed.install?.include_dependencies;
    const installMode =
      includeDependencies === 'none' || includeDependencies === 'direct' || includeDependencies === 'transitive'
        ? includeDependencies
        : 'transitive';

    const dependencies = Array.isArray(parsed.dependencies)
      ? parsed.dependencies
          .map<SpecDependencyDefinition | null>((dependency) => {
            const typedDependency = dependency as {
              key?: unknown;
              type?: unknown;
              reason?: unknown;
            };

            if (
              typeof typedDependency.key !== 'string' ||
              typedDependency.type !== 'requires' ||
              typeof typedDependency.reason !== 'string'
            ) {
              return null;
            }

            const dependencyKey = typedDependency.key.trim();
            const reason = typedDependency.reason.trim();
            if (!dependencyKey || !reason) {
              return null;
            }

            return {
              key: dependencyKey,
              type: 'requires',
              reason,
            };
          })
          .filter((dependency): dependency is SpecDependencyDefinition => dependency !== null)
      : [];

    return {
      spec: {
        key,
        slug,
        title,
        entry,
      },
      dependencies,
      install: {
        includeDependencies: installMode,
      },
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

async function loadSpecConfig(specRoot: string): Promise<SpecConfig | null> {
  const configPath = path.join(specRoot, 'spec.config.json');

  try {
    const configContent = await readFile(configPath, 'utf8');
    return parseSpecConfig(configContent);
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
          const [content, readmeContent, metadata, config] = await Promise.all([
            readFile(specPath, 'utf8'),
            loadOptionalMarkdown(specRoot, 'README.md'),
            loadSpecMetadata(specRoot),
            loadSpecConfig(specRoot),
          ]);
          const readmeAssetBaseUrl = await loadReadmeAssetBaseUrl(specRoot, metadata);
          return {
            path: toPosixPath(path.relative(repoRoot, specPath)),
            content,
            readmeContent,
            readmeAssetBaseUrl,
            metadata,
            config,
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
