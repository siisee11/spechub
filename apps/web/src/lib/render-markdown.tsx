import type { ReactNode } from 'react';

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; content: string }
  | { type: 'image'; alt: string; src: string };

function resolveMarkdownUrl(src: string, baseUrl?: string | null): string {
  if (/^(https?:|data:)/.test(src) || !baseUrl) {
    return src;
  }

  return new URL(src, baseUrl).toString();
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === '') {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
      });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        content: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    const imageMatch = trimmed.match(/^!\[(.*)\]\((.+)\)$/);
    if (imageMatch) {
      blocks.push({
        type: 'image',
        alt: imageMatch[1].trim(),
        src: imageMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];

      while (index < lines.length) {
        const current = lines[index].trim();
        const currentMatch = ordered ? current.match(/^\d+\.\s+(.*)$/) : current.match(/^[-*]\s+(.*)$/);
        if (!currentMatch) {
          break;
        }
        items.push(currentMatch[1].trim());
        index += 1;
      }

      blocks.push({
        type: 'list',
        ordered,
        items,
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (
        currentTrimmed === '' ||
        currentTrimmed.startsWith('```') ||
        /^#{1,3}\s+/.test(currentTrimmed) ||
        /^!\[.*\]\(.+\)$/.test(currentTrimmed) ||
        /^[-*]\s+/.test(currentTrimmed) ||
        /^\d+\.\s+/.test(currentTrimmed)
      ) {
        break;
      }
      paragraphLines.push(currentTrimmed);
      index += 1;
    }

    blocks.push({
      type: 'paragraph',
      content: paragraphLines.join(' '),
    });
  }

  return blocks;
}

export function renderMarkdown(markdown: string, options?: { imageBaseUrl?: string | null }): ReactNode[] {
  return parseMarkdownBlocks(markdown).map((block, index) => {
    switch (block.type) {
      case 'heading':
        if (block.level === 1) {
          return <h3 key={`heading-${index}`}>{block.content}</h3>;
        }
        if (block.level === 2) {
          return <h4 key={`heading-${index}`}>{block.content}</h4>;
        }
        return <h5 key={`heading-${index}`}>{block.content}</h5>;
      case 'paragraph':
        return <p key={`paragraph-${index}`}>{block.content}</p>;
      case 'list':
        return block.ordered ? (
          <ol key={`list-${index}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`ordered-${index}-${itemIndex}`}>{item}</li>
            ))}
          </ol>
        ) : (
          <ul key={`list-${index}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`unordered-${index}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        );
      case 'code':
        return (
          <pre className="readme-code" key={`code-${index}`}>
            <code>{block.content}</code>
          </pre>
        );
      case 'image':
        return (
          <img
            alt={block.alt}
            className="readme-image"
            key={`image-${index}`}
            src={resolveMarkdownUrl(block.src, options?.imageBaseUrl)}
          />
        );
    }
  });
}
