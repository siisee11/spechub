export const DEFAULT_SPEC_DESCRIPTION = 'No summary available yet.';

export type RepoSource = {
  ownerRepo: string;
  ref: string;
};

export type SpecMarkdownFile = {
  path: string;
  content: string;
  metadata?: SpecMetadata | null;
};

export type SpecMetadata = {
  source: string;
  syncedDate: string;
};

export type SpecCatalogEntry = {
  slug: string;
  name: string;
  description: string;
  specPath: string;
  installCommand: string;
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

export function buildSpecCatalog(
  specFiles: SpecMarkdownFile[],
  repoSource?: RepoSource,
): SpecCatalogEntry[] {
  return specFiles
    .map((file) => {
      const slug = extractSpecSlugFromPath(file.path);
      if (!slug) {
        return null;
      }

      const parsed = parseSpecMarkdown(slug, file.content);

      return {
        slug,
        name: parsed.name,
        description: parsed.description,
        specPath: `specs/${slug}`,
        installCommand: buildInstallCommand(slug, repoSource),
        metadata: file.metadata ?? null,
      } satisfies SpecCatalogEntry;
    })
    .filter((entry): entry is SpecCatalogEntry => entry !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
