import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render-markdown';

describe('renderMarkdown', () => {
  it('renders headings, paragraphs, lists, and code blocks', () => {
    render(
      <div>
        {renderMarkdown(`# Title

Intro paragraph.

## Steps

- first
- second

1. alpha
2. beta

\`\`\`
const ready = true;
\`\`\`
`)}
      </div>,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('Intro paragraph.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Steps' })).toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('const ready = true;')).toBeInTheDocument();
  });

  it('joins consecutive paragraph lines into one paragraph', () => {
    render(<div>{renderMarkdown(`Line one\nLine two\n`)}</div>);

    expect(screen.getByText('Line one Line two')).toBeInTheDocument();
  });

  it('renders level-three headings as h5 elements', () => {
    render(<div>{renderMarkdown(`### Deep Section\n`)}</div>);

    expect(screen.getByRole('heading', { level: 5, name: 'Deep Section' })).toBeInTheDocument();
  });

  it('renders markdown images using the provided asset base url', () => {
    render(
      <div>
        {renderMarkdown('![Architecture](./assets/architecture.png)\n', {
          imageBaseUrl: 'https://raw.githubusercontent.com/openai/spechub/abc123/spec/',
        })}
      </div>,
    );

    expect(screen.getByRole('img', { name: 'Architecture' })).toHaveAttribute(
      'src',
      'https://raw.githubusercontent.com/openai/spechub/abc123/spec/assets/architecture.png',
    );
  });

  it('keeps absolute image urls unchanged', () => {
    render(
      <div>
        {renderMarkdown('![Remote Architecture](https://example.com/architecture.png)\n', {
          imageBaseUrl: 'https://raw.githubusercontent.com/openai/spechub/abc123/spec/',
        })}
      </div>,
    );

    expect(screen.getByRole('img', { name: 'Remote Architecture' })).toHaveAttribute(
      'src',
      'https://example.com/architecture.png',
    );
  });
});
