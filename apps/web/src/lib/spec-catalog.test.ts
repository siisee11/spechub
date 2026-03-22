import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPEC_DESCRIPTION,
  buildImplementPrompt,
  buildInstallCommand,
  buildSpecCatalog,
  extractSpecSlugFromPath,
  parseGitHubOwnerRepo,
  parseSpecMarkdown,
} from './spec-catalog';

describe('parseSpecMarkdown', () => {
  it('uses markdown heading and first non-heading summary line', () => {
    const parsed = parseSpecMarkdown(
      'harness-spec',
      '# Harness Spec\n\n## Summary\n`code`\nBuild a portable harness engineering system.\n',
    );

    expect(parsed).toEqual({
      name: 'Harness Spec',
      description: 'Build a portable harness engineering system.',
    });
  });

  it('falls back to slug and default description when content is empty', () => {
    const parsed = parseSpecMarkdown('empty-spec', '');

    expect(parsed).toEqual({
      name: 'empty-spec',
      description: DEFAULT_SPEC_DESCRIPTION,
    });
  });
});

describe('parseGitHubOwnerRepo', () => {
  it('parses supported github remote formats', () => {
    expect(parseGitHubOwnerRepo('git@github.com:openai/spechub.git')).toBe('openai/spechub');
    expect(parseGitHubOwnerRepo('https://github.com/openai/spechub.git')).toBe('openai/spechub');
    expect(parseGitHubOwnerRepo('ssh://git@github.com/openai/spechub.git')).toBe('openai/spechub');
  });

  it('returns null for unsupported remotes or empty owner/repo path', () => {
    expect(parseGitHubOwnerRepo('https://example.com/openai/spechub.git')).toBeNull();
    expect(parseGitHubOwnerRepo('https://github.com/')).toBeNull();
    expect(parseGitHubOwnerRepo('ssh://git@github.com/')).toBeNull();
  });
});

describe('extractSpecSlugFromPath', () => {
  it('extracts slug from POSIX and Windows-style paths', () => {
    expect(extractSpecSlugFromPath('specs/harness-spec/SPEC.md')).toBe('harness-spec');
    expect(extractSpecSlugFromPath('specs\\demo-spec\\SPEC.md')).toBe('demo-spec');
  });

  it('returns null when the path does not point to a spec markdown file', () => {
    expect(extractSpecSlugFromPath('specs/harness-spec/README.md')).toBeNull();
  });
});

describe('buildInstallCommand', () => {
  it('builds command from concrete repo source', () => {
    const command = buildInstallCommand('harness-spec', {
      ownerRepo: 'openai/spechub',
      ref: 'main',
    });

    expect(command).toBe(
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "harness-spec"',
    );
  });

  it('builds placeholder command when repo source is unavailable', () => {
    const command = buildInstallCommand('harness-spec');

    expect(command).toContain('REPO=owner/repo REF=main');
    expect(command).toContain('"harness-spec"');
  });
});

describe('buildImplementPrompt', () => {
  it('wraps the install command in a coding-agent prompt', () => {
    const prompt = buildImplementPrompt('harness-spec', {
      ownerRepo: 'siisee11/spechub',
      ref: 'main',
    });

    expect(prompt).toBe(
      'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/siisee11/spechub/main/scripts/install-spec.sh" | sh -s -- "siisee11/spechub" "main" "harness-spec"` command and start implement that spec.',
    );
  });
});

describe('buildSpecCatalog', () => {
  it('sorts entries and ignores invalid file paths', () => {
    const catalog = buildSpecCatalog(
      [
        {
          path: 'docs/not-a-spec.md',
          content: '# Ignore Me',
          readmeAssetBaseUrl: null,
          metadata: null,
        },
        {
          path: 'specs/zeta/SPEC.md',
          content: '# Zeta\n\nZeta description.',
          readmeContent: '# Zeta Readme\n\nReadme body.\n',
          readmeAssetBaseUrl: 'https://raw.githubusercontent.com/example/zeta/abc123/',
          metadata: null,
        },
        {
          path: 'specs/alpha/SPEC.md',
          content: '',
          readmeAssetBaseUrl: null,
          metadata: {
            source: 'https://example.com/alpha',
            syncedDate: '2026-03-10T12:34:10Z',
          },
        },
      ],
      {
        ownerRepo: 'openai/spechub',
        ref: 'main',
      },
    );

    expect(catalog).toEqual([
      {
        slug: 'alpha',
        name: 'alpha',
        description: DEFAULT_SPEC_DESCRIPTION,
        specPath: 'specs/alpha',
        downloadCommand:
          'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "alpha"',
        implementPrompt:
          'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "alpha"` command and start implement that spec.',
        readmeContent: null,
        readmeAssetBaseUrl: null,
        metadata: {
          source: 'https://example.com/alpha',
          syncedDate: '2026-03-10T12:34:10Z',
        },
      },
      {
        slug: 'zeta',
        name: 'Zeta',
        description: 'Zeta description.',
        specPath: 'specs/zeta',
        downloadCommand:
          'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "zeta"',
        implementPrompt:
          'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "zeta"` command and start implement that spec.',
        readmeContent: '# Zeta Readme\n\nReadme body.\n',
        readmeAssetBaseUrl: 'https://raw.githubusercontent.com/example/zeta/abc123/',
        metadata: null,
      },
    ]);
  });

  it('defaults metadata to null when metadata is omitted in source files', () => {
    const catalog = buildSpecCatalog(
      [
        {
          path: 'specs/no-metadata/SPEC.md',
          content: '# No Metadata\n\nDemo spec.',
        },
      ],
      {
        ownerRepo: 'openai/spechub',
        ref: 'main',
      },
    );

    expect(catalog).toEqual([
      {
        slug: 'no-metadata',
        name: 'No Metadata',
        description: 'Demo spec.',
        specPath: 'specs/no-metadata',
        downloadCommand:
          'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "no-metadata"',
        implementPrompt:
          'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "no-metadata"` command and start implement that spec.',
        readmeContent: null,
        readmeAssetBaseUrl: null,
        metadata: null,
      },
    ]);
  });
});
