import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App, { defaultCopyText } from './App';
import type { SpecCatalogEntry } from './lib/spec-catalog';

const SAMPLE_SPECS: SpecCatalogEntry[] = [
  {
    slug: 'harness-spec',
    name: 'Harness Spec',
    description: 'Build a portable harness engineering system.',
    specPath: 'specs/harness-spec',
    downloadCommand:
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "harness-spec"',
    implementPrompt:
      'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "harness-spec"` command and start implement that spec.',
    metadata: {
      source: 'https://github.com/siisee11/harness.spec',
      syncedDate: '2026-03-10T12:34:10Z',
    },
    readmeAssetBaseUrl: 'https://raw.githubusercontent.com/siisee11/harness.spec/abc123/spec/',
    readmeContent: '# Overview\n\nPortable agent loop.\n\n![Diagram](./assets/diagram.png)\n',
  },
  {
    slug: 'docs-blueprint',
    name: 'Docs Blueprint',
    description: 'Generate canonical docs structure.',
    specPath: 'specs/docs-blueprint',
    downloadCommand:
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"',
    implementPrompt:
      'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"` command and start implement that spec.',
    metadata: null,
    readmeContent: null,
    readmeAssetBaseUrl: null,
  },
];

describe('App', () => {
  it('renders positioning copy, lists specs, and supports copy actions', () => {
    const copyMock = vi.fn();

    render(<App specs={SAMPLE_SPECS} onCopyText={copyMock} />);

    expect(screen.getByRole('heading', { name: 'SpecHub' })).toBeInTheDocument();
    expect(screen.getByText('Open community marketplace for sharable specs.')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          'Each implement prompt tells the agent how to download the full spec folder, including files next to SPEC.md.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Catalog coverage')).toBeInTheDocument();
    expect(screen.getByLabelText('How SpecHub works')).toBeInTheDocument();
    expect(screen.getByLabelText('README availability')).toBeInTheDocument();

    expect(screen.getByLabelText('Selected spec details')).toBeInTheDocument();
    expect(screen.getByLabelText('Spec catalog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select harness-spec' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select docs-blueprint' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByText('Source')).toHaveLength(3);
    expect(screen.getAllByText('Synced date (UTC)')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'https://github.com/siisee11/harness.spec' })).toBeInTheDocument();
    expect(screen.getAllByText('2026-03-10T12:34:10Z')).toHaveLength(2);
    expect(screen.getByText('README')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Portable agent loop.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Diagram' })).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/siisee11/harness.spec/abc123/spec/assets/diagram.png',
    );
    expect(screen.getByText('Generate canonical docs structure.')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Select docs-blueprint' }));

    const selectedDetails = screen.getByLabelText('Selected spec details');
    expect(within(selectedDetails).getByRole('heading', { name: 'Docs Blueprint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select docs-blueprint' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('link', { name: 'https://github.com/siisee11/harness.spec' })).not.toBeInTheDocument();
    expect(screen.queryByText('Portable agent loop.')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unknown')).toHaveLength(4);
    expect(screen.queryByLabelText('README for docs-blueprint')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Copy implement prompt for docs-blueprint'));
    expect(copyMock).toHaveBeenCalledWith(
      'Download SPEC files by executing `curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"` command and start implement that spec.',
    );
    fireEvent.click(screen.getByLabelText('Copy download command for docs-blueprint'));
    expect(copyMock).toHaveBeenCalledWith(
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"',
    );
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
