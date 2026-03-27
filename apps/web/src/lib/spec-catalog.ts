export const DEFAULT_SPEC_DESCRIPTION = 'No summary available yet.';

export type RepoSource = {
  ownerRepo: string;
  ref: string;
};

export type SpecDependencyType = 'requires';

export type SpecDependencyDefinition = {
  key: string;
  type: SpecDependencyType;
  reason: string;
};

export type SpecInstallMode = 'none' | 'direct' | 'transitive';

export type SpecConfig = {
  spec: {
    key: string;
    slug: string;
    title: string;
    entry: string;
  };
  dependencies: SpecDependencyDefinition[];
  install: {
    includeDependencies: SpecInstallMode;
  };
};

export type SpecMarkdownFile = {
  path: string;
  content: string;
  readmeContent?: string | null;
  readmeAssetBaseUrl?: string | null;
  metadata?: SpecMetadata | null;
  config?: SpecConfig | null;
};

export type SpecMetadata = {
  source: string;
  syncedDate: string;
};

export type SpecCatalogDependency = {
  key: string;
  type: SpecDependencyType;
  reason: string;
  slug: string | null;
  name: string | null;
};

export type SpecCatalogEntry = {
  slug: string;
  specKey: string | null;
  name: string;
  description: string;
  specPath: string;
  downloadCommand: string;
  implementPrompt: string;
  dependencies: SpecCatalogDependency[];
  readmeContent?: string | null;
  readmeAssetBaseUrl?: string | null;
  metadata?: SpecMetadata | null;
};

export function parseSpecMarkdown(slug: string, markdown: string): {
  name: string;
  description: string;
} {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim());

  const name =
    lines
      .find((line) => line.startsWith('# '))
      ?.slice(2)
      .trim() || slug;

  const description =
    lines.find(
      (line) =>
        line.length > 0 && !line.startsWith('#') && !line.startsWith('```') && !line.startsWith('`'),
    ) || DEFAULT_SPEC_DESCRIPTION;

  return {
    name,
    description,
  };
}

export function parseGitHubOwnerRepo(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  const withoutSuffix = trimmed.endsWith('.git') ? trimmed.slice(0, -4) : trimmed;

  if (withoutSuffix.startsWith('git@github.com:')) {
    return withoutSuffix.slice('git@github.com:'.length);
  }
  if (withoutSuffix.startsWith('https://github.com/')) {
    return withoutSuffix.slice('https://github.com/'.length).replace(/^\/+|\/+$/g, '') || null;
  }
  if (withoutSuffix.startsWith('ssh://git@github.com/')) {
    return withoutSuffix.slice('ssh://git@github.com/'.length).replace(/^\/+|\/+$/g, '') || null;
  }

  return null;
}

export function extractSpecSlugFromPath(specPath: string): string | null {
  const normalized = specPath.replaceAll('\\', '/');
  const match = normalized.match(/(?:^|\/)specs\/([^/]+)\/SPEC\.md$/);

  return match?.[1] ?? null;
}

export function buildInstallCommand(slug: string, repoSource?: RepoSource): string {
  if (repoSource) {
    return `curl -fsSL "https://raw.githubusercontent.com/${repoSource.ownerRepo}/${repoSource.ref}/scripts/install-spec.sh" | sh -s -- "${repoSource.ownerRepo}" "${repoSource.ref}" "${slug}"`;
  }

  return `REPO=owner/repo REF=main curl -fsSL "https://raw.githubusercontent.com/${'${REPO}'}/${'${REF}'}/scripts/install-spec.sh" | sh -s -- "${'${REPO}'}" "${'${REF}'}" "${slug}"`;
}

export function buildImplementPrompt(slug: string, repoSource?: RepoSource): string {
  return `Download SPEC files and declared dependencies by executing \`${buildInstallCommand(slug, repoSource)}\` command and start implement that spec.`;
}

export function buildSpecCatalog(
  specFiles: SpecMarkdownFile[],
  repoSource?: RepoSource,
): SpecCatalogEntry[] {
  const catalog = specFiles
    .map<SpecCatalogEntry | null>((file) => {
      const slug = extractSpecSlugFromPath(file.path);
      if (!slug) {
        return null;
      }

      const parsed = parseSpecMarkdown(slug, file.content);

      return {
        slug,
        specKey: file.config?.spec.key ?? null,
        name: parsed.name,
        description: parsed.description,
        specPath: `specs/${slug}`,
        downloadCommand: buildInstallCommand(slug, repoSource),
        implementPrompt: buildImplementPrompt(slug, repoSource),
        dependencies: [],
        readmeContent: file.readmeContent ?? null,
        readmeAssetBaseUrl: file.readmeAssetBaseUrl ?? null,
        metadata: file.metadata ?? null,
      } satisfies SpecCatalogEntry;
    })
    .filter((entry): entry is SpecCatalogEntry => entry !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const entryBySpecKey = new Map(
    catalog
      .filter((entry) => entry.specKey !== null)
      .map((entry) => [entry.specKey!, entry] as const),
  );
  const configBySlug = new Map(
    specFiles
      .map((file) => {
        const slug = extractSpecSlugFromPath(file.path);
        return slug ? ([slug, file.config ?? null] as const) : null;
      })
      .filter((entry): entry is readonly [string, SpecConfig | null] => entry !== null),
  );

  return catalog.map((entry) => {
    const config = configBySlug.get(entry.slug);
    const dependencies =
      config?.dependencies.map((dependency) => {
        const targetEntry = entryBySpecKey.get(dependency.key);
        return {
          key: dependency.key,
          type: dependency.type,
          reason: dependency.reason,
          slug: targetEntry?.slug ?? null,
          name: targetEntry?.name ?? null,
        } satisfies SpecCatalogDependency;
      }) ?? [];

    return {
      ...entry,
      dependencies,
    } satisfies SpecCatalogEntry;
  });
}
