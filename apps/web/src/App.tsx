import type { SpecCatalogEntry } from './lib/spec-catalog';
import { renderMarkdown } from './lib/render-markdown';
import './App.css';

export async function defaultCopyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

type AppProps = {
  specs: SpecCatalogEntry[];
  onCopyText?: (text: string) => void | Promise<void>;
};

export default function App({
  specs,
  onCopyText = defaultCopyText,
}: AppProps) {
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">COMMUNITY SPECS</p>
        <h1>SpecHub</h1>
        <p className="hero-copy">Open community marketplace for sharable specs.</p>
        <p className="hero-copy">Browse repository-backed specs and copy implement prompts for your coding agent.</p>
        <p className="hero-copy">Each implement prompt tells the agent how to download the full spec folder, including files next to <code>SPEC.md</code>.</p>
      </header>

      {specs.length === 0 ? (
        <section className="empty-state" aria-label="No specs available">
          <h2>No specs found</h2>
          <p>Add folders under <code>specs/</code> with a <code>SPEC.md</code> file to publish entries.</p>
        </section>
      ) : (
        <section className="spec-list" aria-label="Spec catalog">
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
                    void onCopyText(spec.implementPrompt);
                  }}
                  aria-label={`Copy implement prompt for ${spec.slug}`}
                >
                  Copy implement prompt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onCopyText(spec.downloadCommand);
                  }}
                  aria-label={`Copy download command for ${spec.slug}`}
                >
                  Copy download command
                </button>
              </div>
              {spec.readmeContent ? (
                <section className="readme-section" aria-label={`README for ${spec.slug}`}>
                  <p className="readme-label">README</p>
                  <div className="readme-content">{renderMarkdown(spec.readmeContent)}</div>
                </section>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
