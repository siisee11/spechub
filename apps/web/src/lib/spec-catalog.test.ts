import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPEC_DESCRIPTION,
  buildInstallCommand,
  buildSpecCatalog,
  extractSpecSlugFromPath,
  parseGitHubOwnerRepo,
  parseSpecMarkdown,
} from './spec-catalog';

describe('parseSpecMarkdown', () => {
  it('uses markdown heading and first non-heading summary line', () => {
    const parsed = parseSpecMarkdown(
      'create-harness',
      '# Create Harness\n\n## Summary\n`code`\nBuild a portable harness engineering system.\n',
    );

    expect(parsed).toEqual({
      name: 'Create Harness',
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
    expect(extractSpecSlugFromPath('specs/create-harness/SPEC.md')).toBe('create-harness');
    expect(extractSpecSlugFromPath('specs\\demo-spec\\SPEC.md')).toBe('demo-spec');
  });

  it('returns null when the path does not point to a spec markdown file', () => {
    expect(extractSpecSlugFromPath('specs/create-harness/README.md')).toBeNull();
  });
});

describe('buildInstallCommand', () => {
  it('builds command from concrete repo source', () => {
    const command = buildInstallCommand('create-harness', {
      ownerRepo: 'openai/spechub',
      ref: 'main',
    });

    expect(command).toBe(
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "create-harness"',
    );
  });

  it('builds placeholder command when repo source is unavailable', () => {
    const command = buildInstallCommand('create-harness');

    expect(command).toContain('REPO=owner/repo REF=main');
    expect(command).toContain('"create-harness"');
  });
});

describe('buildSpecCatalog', () => {
  it('sorts entries and ignores invalid file paths', () => {
    const catalog = buildSpecCatalog(
      [
        {
          path: 'docs/not-a-spec.md',
          content: '# Ignore Me',
        },
        {
          path: 'specs/zeta/SPEC.md',
          content: '# Zeta\n\nZeta description.',
        },
        {
          path: 'specs/alpha/SPEC.md',
          content: '',
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
        installCommand:
          'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "alpha"',
      },
      {
        slug: 'zeta',
        name: 'Zeta',
        description: 'Zeta description.',
        specPath: 'specs/zeta',
        installCommand:
          'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "zeta"',
      },
    ]);
  });
});
