import { Link } from 'react-router';
import { roundEditors } from './rounds/index.js';

export function RoundPicker() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl text-glow text-primary">Quiz Builder</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {Object.values(roundEditors).map((entry) =>
          entry.component ? (
            <li key={entry.type}>
              <Link
                to={entry.path}
                className="block rounded-lg border border-border bg-surface-1 p-4 transition-shadow hover:shadow-glow-primary"
              >
                <strong className="font-display text-lg text-strong">{entry.label}</strong>
                <p className="mt-1 text-muted">{entry.description}</p>
              </Link>
            </li>
          ) : (
            <li
              key={entry.type}
              aria-disabled="true"
              className="rounded-lg border border-border bg-surface-0 p-4 opacity-50"
            >
              <strong className="font-display text-lg text-strong">{entry.label}</strong>
              <p className="mt-1 text-muted">{entry.description}</p>
              <span className="text-xs uppercase tracking-wide text-muted">Coming soon</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
