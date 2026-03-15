import { useState } from 'react';
import type { SpecCatalogEntry } from './lib/spec-catalog';
import './App.css';

export async function defaultCopyImplementPrompt(prompt: string): Promise<void> {
  await navigator.clipboard.writeText(prompt);
}

type AppProps = {
  specs: SpecCatalogEntry[];
  onCopyImplementPrompt?: (prompt: string) => void | Promise<void>;
};

export default function App({
  specs,
  onCopyImplementPrompt = defaultCopyImplementPrompt,
}: AppProps) {
  const [selectedSpec, setSelectedSpec] = useState<SpecCatalogEntry | null>(specs[0] ?? null);

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">COMMUNITY SPECS</p>
        <h1>SpecHub</h1>
        <p className="hero-copy">Open community marketplace for sharable specs.</p>
        <p className="hero-copy">Browse repository-backed specs, inspect details, and copy implement prompts for your coding agent.</p>
        <p className="hero-copy">Each implement prompt tells the agent how to download the full spec folder, including files next to <code>SPEC.md</code>.</p>
      </header>

      {specs.length === 0 ? (
        <section className="empty-state" aria-label="No specs available">
          <h2>No specs found</h2>
          <p>Add folders under <code>specs/</code> with a <code>SPEC.md</code> file to publish entries.</p>
        </section>
      ) : (
        (() => {
          const detailSpec = selectedSpec as SpecCatalogEntry;

          return (
            <section className="layout" aria-label="Spec catalog">
              <section className="spec-list" aria-label="Available specs">
                {specs.map((spec) => (
                  <article className="spec-card" key={spec.slug}>
                    <p className="slug">{spec.slug}</p>
                    <h2>{spec.name}</h2>
                    <p className="description">{spec.description}</p>
                    <p className="spec-path">{spec.specPath}</p>
                    <dl className="metadata-list">
                      <div>
                        <dt>Source</dt>
                        <dd>
                          {spec.metadata ? (
                            <a href={spec.metadata.source} target="_blank" rel="noreferrer">
                              {spec.metadata.source}
                            </a>
                          ) : (
                            <span>Unknown</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Synced date (UTC)</dt>
                        <dd>
                          <code>{spec.metadata?.syncedDate ?? 'Unknown'}</code>
                        </dd>
                      </div>
                    </dl>
                    <pre className="install-command">{spec.implementPrompt}</pre>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSpec(spec);
                        }}
                        aria-label={`View details for ${spec.slug}`}
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void onCopyImplementPrompt(spec.implementPrompt);
                        }}
                        aria-label={`Copy implement prompt for ${spec.slug}`}
                      >
                        Copy implement prompt
                      </button>
                    </div>
                  </article>
                ))}
              </section>

              <aside className="detail-panel" aria-label="Selected spec details">
                <p className="detail-label">Selected spec</p>
                <h2>{detailSpec.name}</h2>
                <p>{detailSpec.description}</p>
                <p>
                  Source: <code>{detailSpec.specPath}</code>
                </p>
                <dl className="metadata-list metadata-list-detail">
                  <div>
                    <dt>Origin</dt>
                    <dd>
                      {detailSpec.metadata ? (
                        <a href={detailSpec.metadata.source} target="_blank" rel="noreferrer">
                          {detailSpec.metadata.source}
                        </a>
                      ) : (
                        <span>Unknown</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Synced date (UTC)</dt>
                    <dd>
                      <code>{detailSpec.metadata?.syncedDate ?? 'Unknown'}</code>
                    </dd>
                  </div>
                </dl>
                <p>
                  This implement prompt tells an agent to copy the full <code>{detailSpec.specPath}</code> directory, not just <code>SPEC.md</code>.
                </p>
                <h3>Implement prompt</h3>
                <pre className="install-command">{detailSpec.implementPrompt}</pre>
                <button
                  type="button"
                  onClick={() => {
                    void onCopyImplementPrompt(detailSpec.implementPrompt);
                  }}
                >
                  Copy selected implement prompt
                </button>
              </aside>
            </section>
          );
        })()
      )}
    </main>
  );
}
