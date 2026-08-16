import type { ComponentType } from 'react';
import { Route, Routes } from 'react-router';
import { RoundPicker } from './RoundPicker.js';
import { type RoundEditorEntry, roundEditors } from './rounds/index.js';

function hasEditor(
  entry: RoundEditorEntry,
): entry is RoundEditorEntry & { component: ComponentType } {
  return entry.component !== undefined;
}

export function App() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<RoundPicker />} />
        {Object.values(roundEditors)
          .filter(hasEditor)
          .map((entry) => (
            <Route key={entry.type} path={entry.path} element={<entry.component />} />
          ))}
      </Routes>
    </main>
  );
}
