import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { defaultCopyText, splitSpecCardTitle } from './App';
import type { SpecCatalogEntry } from './lib/spec-catalog';

const SAMPLE_SPECS: SpecCatalogEntry[] = [
  {
    slug: 'harness-spec',
    specKey: 'github:siisee11/harness.spec',
    name: 'Harness Spec',
    description: 'Build a portable harness engineering system.',
    specPath: 'specs/harness-spec',
    downloadCommand:
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "harness-spec"',
    implementPrompt:
      'Download SPEC files and declared dependencies by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "harness-spec"` command and start implement that spec.',
    dependencies: [
      {
        key: 'github:siisee11/ralph-loop.spec#spec',
        type: 'requires',
        reason: 'Harness assumes Ralph Loop is available.',
        slug: 'docs-blueprint',
        name: 'Docs Blueprint',
      },
    ],
    metadata: {
      source: 'https://github.com/siisee11/harness.spec',
      syncedDate: '2026-03-10T12:34:10Z',
    },
    readmeAssetBaseUrl: 'https://raw.githubusercontent.com/siisee11/harness.spec/abc123/spec/',
    readmeContent: '# Overview\n\nPortable agent loop.\n\n![Diagram](./assets/diagram.png)\n',
  },
  {
    slug: 'docs-blueprint',
    specKey: null,
    name: 'Docs Blueprint',
    description: 'Generate canonical docs structure.',
    specPath: 'specs/docs-blueprint',
    downloadCommand:
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"',
    implementPrompt:
      'Download SPEC files and declared dependencies by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"` command and start implement that spec.',
    dependencies: [],
    metadata: null,
    readmeContent: null,
    readmeAssetBaseUrl: null,
  },
];

describe('App', () => {
  beforeEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('uses the URL hash to select the matching spec on load', () => {
    window.history.replaceState(null, '', '#docs-blueprint');

    render(<App specs={SAMPLE_SPECS} />);

    const selectedDetails = screen.getByLabelText('Selected spec details');
    expect(within(selectedDetails).getByRole('heading', { name: 'Docs Blueprint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select docs-blueprint' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select harness-spec' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('falls back to the first spec when the URL hash is invalid', () => {
    window.history.replaceState(null, '', '#bad%ZZ');

    render(<App specs={SAMPLE_SPECS} />);

    const selectedDetails = screen.getByLabelText('Selected spec details');
    expect(within(selectedDetails).getByRole('heading', { name: 'Harness Spec' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select harness-spec' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders positioning copy, lists specs, and supports copy actions', () => {
    const copyMock = vi.fn();

    render(<App specs={SAMPLE_SPECS} onCopyText={copyMock} />);

    expect(screen.getByRole('heading', { name: 'SpecHub' })).toBeInTheDocument();
    expect(screen.getByText('Open community marketplace for sharable specs.')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          'Each implement prompt tells the agent how to download the full spec folder, companion files, and declared dependencies next to SPEC.md.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Catalog coverage')).toBeInTheDocument();
    expect(screen.getByLabelText('How SpecHub works')).toBeInTheDocument();
    expect(screen.getByLabelText('README availability')).toBeInTheDocument();

    expect(screen.getByLabelText('Selected spec details')).toBeInTheDocument();
    expect(screen.getByLabelText('Spec catalog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select harness-spec' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select docs-blueprint' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByText('Implementation spec')).toHaveLength(2);
    expect(screen.getByText('Source linked')).toBeInTheDocument();
    expect(screen.getByText('Source pending')).toBeInTheDocument();
    expect(screen.getByText('Unsynced listing')).toBeInTheDocument();
    expect(screen.getByText('Synced UTC')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Synced date (UTC)')).toBeInTheDocument();
    expect(screen.getByText('Dependencies')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Docs Blueprint' })).toBeInTheDocument();
    expect(screen.getByText('Harness assumes Ralph Loop is available.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://github.com/siisee11/harness.spec' })).toBeInTheDocument();
    expect(screen.getByText('2026-03-10T12:34:10Z')).toBeInTheDocument();
    expect(screen.getByText('README')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Portable agent loop.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Diagram' })).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/siisee11/harness.spec/abc123/spec/assets/diagram.png',
    );
    expect(screen.getByText('Generate canonical docs structure.')).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select docs-blueprint' }));

    const selectedDetails = screen.getByLabelText('Selected spec details');
    expect(within(selectedDetails).getByRole('heading', { name: 'Docs Blueprint' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#docs-blueprint');
    expect(screen.getByRole('button', { name: 'Select docs-blueprint' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('link', { name: 'https://github.com/siisee11/harness.spec' })).not.toBeInTheDocument();
    expect(screen.queryByText('Portable agent loop.')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unknown')).toHaveLength(2);
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.queryByLabelText('README for docs-blueprint')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Copy implement prompt for docs-blueprint'));
    expect(copyMock).toHaveBeenCalledWith(
      'Download SPEC files and declared dependencies by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"` command and start implement that spec.',
    );
    fireEvent.click(screen.getByLabelText('Copy download command for docs-blueprint'));
    expect(copyMock).toHaveBeenCalledWith(
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"',
    );
  });

  it('updates the selected spec when the hash changes externally', async () => {
    render(<App specs={SAMPLE_SPECS} />);

    window.location.hash = '#docs-blueprint';

    await waitFor(() => {
      const selectedDetails = screen.getByLabelText('Selected spec details');
      expect(within(selectedDetails).getByRole('heading', { name: 'Docs Blueprint' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Select docs-blueprint' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('lets users jump to a dependency from the selected spec panel', () => {
    render(<App specs={SAMPLE_SPECS} />);

    fireEvent.click(screen.getByRole('button', { name: 'Docs Blueprint' }));

    const selectedDetails = screen.getByLabelText('Selected spec details');
    expect(within(selectedDetails).getByRole('heading', { name: 'Docs Blueprint' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#docs-blueprint');
  });

  it('falls back to dependency slug when the dependency name is unavailable', () => {
    render(
      <App
        specs={[
          {
            ...SAMPLE_SPECS[0],
            dependencies: [
              {
                key: 'github:siisee11/ralph-loop.spec#spec',
                type: 'requires',
                reason: 'Fallback label.',
                slug: 'docs-blueprint',
                name: null,
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'docs-blueprint' })).toBeInTheDocument();
  });

  it('renders unresolved dependency keys when the catalog target is unavailable', () => {
    render(
      <App
        specs={[
          {
            ...SAMPLE_SPECS[0],
            dependencies: [
              {
                key: 'github:missing/spec',
                type: 'requires',
                reason: 'External prerequisite.',
                slug: null,
                name: null,
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('github:missing/spec')).toBeInTheDocument();
    expect(screen.getByText('External prerequisite.')).toBeInTheDocument();
  });

  it('does not rewrite the hash when the selected spec is clicked again', () => {
    window.history.replaceState(null, '', '#harness-spec');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    render(<App specs={SAMPLE_SPECS} />);
    replaceStateSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Select harness-spec' }));

    expect(replaceStateSpy).not.toHaveBeenCalled();
    replaceStateSpy.mockRestore();
  });

  it('renders empty state when there are no specs', () => {
    render(<App specs={[]} />);

    expect(screen.getByRole('heading', { name: 'No specs found' })).toBeInTheDocument();
    expect(screen.getByLabelText('No specs available')).toBeInTheDocument();
  });
});

describe('defaultCopyText', () => {
  it('writes text to navigator clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText,
      },
      configurable: true,
    });

    await defaultCopyText('echo hi');

    expect(writeText).toHaveBeenCalledWith('echo hi');
  });
});

describe('splitSpecCardTitle', () => {
  it('splits the final word into its own highlighted line', () => {
    expect(splitSpecCardTitle('Ralph Loop Spec')).toEqual(['Ralph Loop', 'Spec']);
    expect(splitSpecCardTitle('Symphony Service Specification')).toEqual(['Symphony Service', 'Specification']);
    expect(splitSpecCardTitle('Spec')).toEqual(['Spec']);
  });
});
