import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App, { defaultCopyInstallCommand } from './App';
import type { SpecCatalogEntry } from './lib/spec-catalog';

const SAMPLE_SPECS: SpecCatalogEntry[] = [
  {
    slug: 'harness-spec',
    name: 'Harness Spec',
    description: 'Build a portable harness engineering system.',
    specPath: 'specs/harness-spec',
    installCommand:
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "harness-spec"',
    metadata: {
      source: 'https://github.com/siisee11/harness.spec',
      syncedDate: '2026-03-10T12:34:10Z',
    },
  },
  {
    slug: 'docs-blueprint',
    name: 'Docs Blueprint',
    description: 'Generate canonical docs structure.',
    specPath: 'specs/docs-blueprint',
    installCommand:
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"',
    metadata: null,
  },
];

describe('App', () => {
  it('renders positioning copy, lists specs, and supports detail/copy actions', () => {
    const copyMock = vi.fn();

    render(<App specs={SAMPLE_SPECS} onCopyInstallCommand={copyMock} />);

    expect(screen.getByRole('heading', { name: 'SpecHub' })).toBeInTheDocument();
    expect(screen.getByText('Open community marketplace for sharable specs.')).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === 'Each install command downloads the full spec folder, including files next to SPEC.md.'),
    ).toBeInTheDocument();

    expect(screen.getAllByRole('heading', { name: 'Harness Spec' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Docs Blueprint' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'https://github.com/siisee11/harness.spec' })).toHaveLength(2);
    expect(screen.getAllByText('2026-03-10T12:34:10Z')).toHaveLength(2);

    fireEvent.click(screen.getByLabelText('View details for docs-blueprint'));
    expect(screen.getAllByRole('heading', { name: 'Docs Blueprint' })).toHaveLength(2);
    expect(screen.getAllByText('Generate canonical docs structure.')).toHaveLength(2);
    expect(
      screen.getByText((_, element) => element?.textContent === 'Install commands copy the full specs/docs-blueprint directory, not just SPEC.md.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Unknown')).toHaveLength(4);

    fireEvent.click(screen.getByLabelText('Copy install command for docs-blueprint'));
    expect(copyMock).toHaveBeenCalledWith(
      'curl -fsSL "https://raw.githubusercontent.com/openai/spechub/main/scripts/install-spec.sh" | sh -s -- "openai/spechub" "main" "docs-blueprint"',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy selected install command' }));
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

describe('defaultCopyInstallCommand', () => {
  it('writes install command to navigator clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText,
      },
      configurable: true,
    });

    await defaultCopyInstallCommand('echo hi');

    expect(writeText).toHaveBeenCalledWith('echo hi');
  });
});
