import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App, { defaultCopyImplementPrompt } from './App';
import type { SpecCatalogEntry } from './lib/spec-catalog';

const SAMPLE_SPECS: SpecCatalogEntry[] = [
  {
    slug: 'harness-spec',
    name: 'Harness Spec',
    description: 'Build a portable harness engineering system.',
    specPath: 'specs/harness-spec',
    implementPrompt:
      'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "harness-spec"` command and start implement that spec.',
    metadata: {
      source: 'https://github.com/siisee11/harness.spec',
      syncedDate: '2026-03-10T12:34:10Z',
    },
    readmeContent: '# Overview\n\nPortable agent loop.\n',
  },
  {
    slug: 'docs-blueprint',
    name: 'Docs Blueprint',
    description: 'Generate canonical docs structure.',
    specPath: 'specs/docs-blueprint',
    implementPrompt:
      'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"` command and start implement that spec.',
    metadata: null,
    readmeContent: null,
  },
];

describe('App', () => {
  it('renders positioning copy, lists specs, and supports copy actions', () => {
    const copyMock = vi.fn();

    render(<App specs={SAMPLE_SPECS} onCopyImplementPrompt={copyMock} />);

    expect(screen.getByRole('heading', { name: 'SpecHub' })).toBeInTheDocument();
    expect(screen.getByText('Open community marketplace for sharable specs.')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          'Each implement prompt tells the agent how to download the full spec folder, including files next to SPEC.md.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Harness Spec' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Docs Blueprint' })).toBeInTheDocument();
    expect(screen.getAllByText('Source')).toHaveLength(2);
    expect(screen.getAllByText('Synced date (UTC)')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'https://github.com/siisee11/harness.spec' })).toBeInTheDocument();
    expect(screen.getByText('2026-03-10T12:34:10Z')).toBeInTheDocument();
    expect(screen.getByText('README')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Portable agent loop.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Selected spec details')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected spec')).not.toBeInTheDocument();
    expect(screen.getByText('Generate canonical docs structure.')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown')).toHaveLength(2);
    expect(screen.queryByLabelText('README for docs-blueprint')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Copy implement prompt for docs-blueprint'));
    expect(copyMock).toHaveBeenCalledWith(
      'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"` command and start implement that spec.',
    );
  });

  it('renders empty state when there are no specs', () => {
    render(<App specs={[]} />);

    expect(screen.getByRole('heading', { name: 'No specs found' })).toBeInTheDocument();
    expect(screen.getByLabelText('No specs available')).toBeInTheDocument();
  });
});

describe('defaultCopyImplementPrompt', () => {
  it('writes implement prompt to navigator clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText,
      },
      configurable: true,
    });

    await defaultCopyImplementPrompt('echo hi');

    expect(writeText).toHaveBeenCalledWith('echo hi');
  });
});
