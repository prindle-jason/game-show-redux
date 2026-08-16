import { SolutionBoard, WheelGraphic } from '@gameshow/round-ui';
import type { WheelWedge } from '@gameshow/schema';
import { useState } from 'react';
import { Link } from 'react-router';
import { downloadRoundZip, exportWheelRound } from './export-round.js';
import { useWheelDraftStore, validateWheelDraft, type WheelDraft } from './wheel-draft-store.js';

function WedgeRow({ wedge, onRemove }: { wedge: WheelWedge; onRemove: () => void }) {
  const label =
    wedge.kind === 'cash'
      ? `$${wedge.value}`
      : wedge.kind === 'bankrupt'
        ? 'Bankrupt'
        : 'Lose a turn';
  return (
    <li>
      {label}
      <button type="button" onClick={onRemove}>
        Remove
      </button>
    </li>
  );
}

function AddWedgeForm({ onAdd }: { onAdd: (wedge: WheelWedge) => void }) {
  const [kind, setKind] = useState<WheelWedge['kind']>('cash');
  const [value, setValue] = useState(500);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(kind === 'cash' ? { kind, value } : { kind });
      }}
    >
      <label>
        Wedge type
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as WheelWedge['kind'])}
        >
          <option value="cash">Cash</option>
          <option value="bankrupt">Bankrupt</option>
          <option value="lose-turn">Lose a turn</option>
        </select>
      </label>
      {kind === 'cash' && (
        <label>
          Value
          <input
            type="number"
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
          />
        </label>
      )}
      <button type="submit">Add wedge</button>
    </form>
  );
}

export function WheelEditor() {
  const draft = useWheelDraftStore((state) => state.draft);
  const setTitle = useWheelDraftStore((state) => state.setTitle);
  const setCategory = useWheelDraftStore((state) => state.setCategory);
  const setSolutionRow = useWheelDraftStore((state) => state.setSolutionRow);
  const addWedge = useWheelDraftStore((state) => state.addWedge);
  const removeWedge = useWheelDraftStore((state) => state.removeWedge);
  const applyDefaultWedges = useWheelDraftStore((state) => state.applyDefaultWedges);
  const shuffleWedges = useWheelDraftStore((state) => state.shuffleWedges);
  const setVowelCost = useWheelDraftStore((state) => state.setVowelCost);
  const setSolveBonus = useWheelDraftStore((state) => state.setSolveBonus);
  const [exporting, setExporting] = useState(false);

  const validation = validateWheelDraft(draft);

  async function handleExport(current: WheelDraft) {
    setExporting(true);
    try {
      const blob = await exportWheelRound(current);
      downloadRoundZip(blob, current.title);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <Link to="/">← Back to round types</Link>
      <p>Round id: {draft.roundId}</p>
      <label>
        Title
        <input value={draft.title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Category
        <input value={draft.category} onChange={(event) => setCategory(event.target.value)} />
      </label>

      <h2>Solution</h2>
      <div>
        {draft.solution.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 4 rows, never reordered/inserted/removed
          <label key={index}>
            {`Row ${index + 1}`}
            <input value={row} onChange={(event) => setSolutionRow(index, event.target.value)} />
          </label>
        ))}
      </div>
      <SolutionBoard rows={draft.solution} />

      <h2>Wedges</h2>
      <button type="button" onClick={applyDefaultWedges}>
        Default
      </button>
      <button type="button" disabled={draft.wedges.length === 0} onClick={shuffleWedges}>
        Shuffle
      </button>
      <ul>
        {draft.wedges.map((wedge, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: wedges have no stable id; add/remove/shuffle all replace the whole list
          <WedgeRow key={index} wedge={wedge} onRemove={() => removeWedge(index)} />
        ))}
      </ul>
      <AddWedgeForm onAdd={addWedge} />
      <WheelGraphic wedges={draft.wedges} />

      <label>
        Vowel cost
        <input
          type="number"
          value={draft.vowelCost}
          onChange={(event) => setVowelCost(Number(event.target.value))}
        />
      </label>
      <label>
        Solve bonus
        <input
          type="number"
          value={draft.solveBonus}
          onChange={(event) => setSolveBonus(Number(event.target.value))}
        />
      </label>

      <div>
        <button
          type="button"
          disabled={!validation.valid || exporting}
          onClick={() => void handleExport(draft)}
        >
          {exporting ? 'Exporting…' : 'Export round'}
        </button>
        {!validation.valid && <p role="alert">{validation.error}</p>}
      </div>
    </div>
  );
}
