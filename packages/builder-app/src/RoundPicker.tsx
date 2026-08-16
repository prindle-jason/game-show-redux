import { Link } from 'react-router';
import { roundEditors } from './rounds/index.js';

export function RoundPicker() {
  return (
    <div>
      <h1>Quiz Builder</h1>
      <ul>
        {Object.values(roundEditors).map((entry) =>
          entry.component ? (
            <li key={entry.type}>
              <Link to={entry.path}>
                <strong>{entry.label}</strong>
                <p>{entry.description}</p>
              </Link>
            </li>
          ) : (
            <li key={entry.type} aria-disabled="true">
              <strong>{entry.label}</strong>
              <p>{entry.description}</p>
              <span>Coming soon</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
