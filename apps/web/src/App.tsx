import { useEffect, useState } from 'react';
import type { SpecCatalogEntry } from './lib/spec-catalog';
import { renderMarkdown } from './lib/render-markdown';
import './App.css';

export async function defaultCopyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function splitSpecCardTitle(title: string): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);

  if (words.length < 2) {
    return [title];
  }

  return [words.slice(0, -1).join(' '), words.at(-1)!];
}

function readSelectedSlugFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, '').trim();
  if (hash === '') {
    return null;
  }

  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

function writeSelectedSlugToHash(slug: string): void {
  const encodedSlug = encodeURIComponent(slug);
  if (window.location.hash === `#${encodedSlug}`) {
    return;
  }

  window.history.replaceState(null, '', `#${encodedSlug}`);
}

type AppProps = {
  specs: SpecCatalogEntry[];
  onCopyText?: (text: string) => void | Promise<void>;
};

export default function App({
  specs,
  onCopyText = defaultCopyText,
}: AppProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => readSelectedSlugFromHash());
  const activeSlug = specs.some((spec) => spec.slug === selectedSlug) ? selectedSlug : specs[0]?.slug ?? null;
  const selectedSpec = specs.find((spec) => spec.slug === activeSlug) ?? null;
  const syncedSpecCount = specs.filter((spec) => spec.metadata?.syncedDate).length;
  const readmeCount = specs.filter((spec) => spec.readmeContent).length;
  const selectSpec = (slug: string): void => {
    setSelectedSlug(slug);
    writeSelectedSlugToHash(slug);
  };

  useEffect(() => {
    const syncSelectedSlugFromHash = (): void => {
      setSelectedSlug(readSelectedSlugFromHash());
    };

    window.addEventListener('hashchange', syncSelectedSlugFromHash);
    return () => {
      window.removeEventListener('hashchange', syncSelectedSlugFromHash);
    };
  }, []);

  return (
    <main className="page">
      <section className="hero-grid" aria-label="SpecHub introduction">
        <header className="panel hero hero-primary">
          <p className="eyebrow">COMMUNITY SPECS</p>
          <h1>SpecHub</h1>
          <p className="hero-copy">Open community marketplace for sharable specs.</p>
          <p className="hero-copy">
            Browse repository-backed specs, compare their source context, and copy implement prompts for your coding
            agent.
          </p>
          <p className="hero-copy">
            Each implement prompt tells the agent how to download the full spec folder, companion files, and declared
            dependencies next to <code>SPEC.md</code>.
          </p>
        </header>

        <section className="panel hero hero-metric" aria-label="Catalog coverage">
          <p className="section-label">Catalog coverage</p>
          <p className="metric-value">{specs.length}</p>
          <p className="metric-caption">repository-backed specs live in this marketplace right now</p>
        </section>

        <section className="panel hero hero-metric" aria-label="Catalog sync">
          <p className="section-label">Sync visibility</p>
          <p className="metric-value">{syncedSpecCount}</p>
          <p className="metric-caption">entries ship metadata with source links and synced UTC timestamps</p>
        </section>

        <section className="panel hero hero-note" aria-label="How SpecHub works">
          <p className="section-label">Agent-ready flow</p>
          <ol className="hero-list">
            <li>Pick a spec from the catalog grid.</li>
            <li>Inspect the source repo, README context, and generated commands.</li>
            <li>Copy the install or implement instruction into your coding loop.</li>
          </ol>
        </section>

        <section className="panel hero hero-note" aria-label="README availability">
          <p className="section-label">Attached docs</p>
          <p className="hero-emphasis">{readmeCount} specs include extra README context for implementation details.</p>
          <p className="hero-copy hero-copy-compact">
            The highlighted panel keeps the command surface and the adjacent README in the same place.
          </p>
        </section>
      </section>

      {specs.length === 0 ? (
        <section className="panel empty-state" aria-label="No specs available">
          <h2>No specs found</h2>
          <p>Add folders under <code>specs/</code> with a <code>SPEC.md</code> file to publish entries.</p>
        </section>
      ) : (
        (() => {
          const activeSpec = selectedSpec!;

          return (
            <section className="catalog-layout">
              <section className="panel selected-spec" aria-label="Selected spec details">
                <div className="selected-spec-header">
                  <div>
                    <p className="section-label">Selected spec</p>
                    <p className="slug">{activeSpec.slug}</p>
                  </div>
                  <p className="selected-status">{activeSpec.metadata ? 'Synced listing' : 'Community draft'}</p>
                </div>

                <div className="selected-spec-summary">
                  <div>
                    <h2>{activeSpec.name}</h2>
                    <p className="description">{activeSpec.description}</p>
                  </div>
                  <p className="spec-path">{activeSpec.specPath}</p>
                </div>

                <dl className="metadata-list metadata-grid">
                  <div>
                    <dt>Source</dt>
                    <dd>
                      {activeSpec.metadata ? (
                        <a href={activeSpec.metadata.source} target="_blank" rel="noreferrer">
                          {activeSpec.metadata.source}
                        </a>
                      ) : (
                        <span>Unknown</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Synced date (UTC)</dt>
                    <dd>
                      <code>{activeSpec.metadata?.syncedDate ?? 'Unknown'}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Dependencies</dt>
                    <dd>
                      {activeSpec.dependencies.length > 0 ? (
                        <ul className="dependency-list">
                          {activeSpec.dependencies.map((dependency) => (
                            <li key={dependency.key}>
                              {dependency.slug ? (
                                <button
                                  className="dependency-link"
                                  type="button"
                                  onClick={() => {
                                    selectSpec(dependency.slug!);
                                  }}
                                >
                                  {dependency.name ?? dependency.slug}
                                </button>
                              ) : (
                                <code>{dependency.key}</code>
                              )}
                              <span className="dependency-reason">{dependency.reason}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span>None</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="command-grid">
                  <section className="command-card">
                    <div className="command-card-header">
                      <div>
                        <p className="section-label">Install command</p>
                        <p className="command-caption">Shell installer for the full spec folder and its dependency graph.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void onCopyText(activeSpec.downloadCommand);
                        }}
                        aria-label={`Copy download command for ${activeSpec.slug}`}
                      >
                        Copy download command
                      </button>
                    </div>
                    <pre className="install-command">{activeSpec.downloadCommand}</pre>
                  </section>

                  <section className="command-card">
                    <div className="command-card-header">
                      <div>
                        <p className="section-label">Implement prompt</p>
                        <p className="command-caption">Drop this into your coding agent as the starting instruction.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void onCopyText(activeSpec.implementPrompt);
                        }}
                        aria-label={`Copy implement prompt for ${activeSpec.slug}`}
                      >
                        Copy implement prompt
                      </button>
                    </div>
                    <pre className="install-command">{activeSpec.implementPrompt}</pre>
                  </section>
                </div>

                {activeSpec.readmeContent ? (
                  <section className="readme-section" aria-label={`README for ${activeSpec.slug}`}>
                    <p className="readme-label">README</p>
                    <div className="readme-content">
                      {renderMarkdown(activeSpec.readmeContent, { imageBaseUrl: activeSpec.readmeAssetBaseUrl })}
                    </div>
                  </section>
                ) : null}
              </section>

              <section className="spec-list" aria-label="Spec catalog">
                {specs.map((spec, index) => {
                  const isSelected = spec.slug === activeSpec.slug;

                  return (
                    <article
                      className={`panel spec-card ${isSelected ? 'spec-card-selected' : ''}`}
                      key={spec.slug}
                      data-accent={index % 4}
                    >
                      <button
                        className="spec-select"
                        type="button"
                        onClick={() => {
                          selectSpec(spec.slug);
                        }}
                        aria-label={`Select ${spec.slug}`}
                        aria-pressed={isSelected}
                      >
                        <div className="spec-card-topline">
                          <p className="slug">{spec.slug}</p>
                          <p className="spec-chip">{spec.readmeContent ? 'README attached' : 'Spec only'}</p>
                        </div>
                        <div className="spec-card-copy">
                          <p className="spec-kicker">Implementation spec</p>
                          <h3 className="spec-card-title">
                            {splitSpecCardTitle(spec.name).map((titleLine) => (
                              <span key={`${spec.slug}-${titleLine}`}>{titleLine}</span>
                            ))}
                          </h3>
                          <p className="spec-card-description">{spec.description}</p>
                        </div>
                        <div className="spec-card-footer">
                          <p className="spec-card-path">{spec.specPath}</p>
                          <div className="spec-card-meta">
                            <p className="spec-meta-pill">{spec.metadata ? 'Source linked' : 'Source pending'}</p>
                            <p className="spec-meta-pill">
                              {spec.metadata?.syncedDate ? 'Synced UTC' : 'Unsynced listing'}
                            </p>
                          </div>
                        </div>
                      </button>
                    </article>
                  );
                })}
              </section>
            </section>
          );
        })()
      )}
    </main>
  );
}
