import { SolutionBoard, WheelGraphic } from '@gameshow/round-ui';
import type { WheelWedge } from '@gameshow/schema';
import { Button, InputField, SelectField } from '@gameshow/ui';
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
    <li className="flex items-center justify-between gap-2">
      <span className="text-strong">{label}</span>
      <Button variant="danger" size="sm" onClick={onRemove}>
        Remove
      </Button>
    </li>
  );
}

function AddWedgeForm({ onAdd }: { onAdd: (wedge: WheelWedge) => void }) {
  const [kind, setKind] = useState<WheelWedge['kind']>('cash');
  const [value, setValue] = useState(500);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(kind === 'cash' ? { kind, value } : { kind });
      }}
    >
      <SelectField
        label="Wedge type"
        value={kind}
        onChange={(event) => setKind(event.target.value as WheelWedge['kind'])}
      >
        <option value="cash">Cash</option>
        <option value="bankrupt">Bankrupt</option>
        <option value="lose-turn">Lose a turn</option>
      </SelectField>
      {kind === 'cash' && (
        <InputField
          label="Value"
          type="number"
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
        />
      )}
      <Button type="submit">Add wedge</Button>
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
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8">
      <Link to="/" className="text-muted hover:text-strong">
        ← Back to round types
      </Link>
      <p className="text-muted">Round id: {draft.roundId}</p>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <InputField
            label="Title"
            value={draft.title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <InputField
            label="Category"
            value={draft.category}
            onChange={(event) => setCategory(event.target.value)}
          />

          <div className="flex flex-col gap-2">
            <h2 className="font-display text-lg text-strong">Solution</h2>
            <div className="flex flex-col gap-2">
              {draft.solution.map((row, index) => (
                <InputField
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed 4 rows, never reordered/inserted/removed
                  key={index}
                  label={`Row ${index + 1}`}
                  value={row}
                  onChange={(event) => setSolutionRow(index, event.target.value)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="font-display text-lg text-strong">Wedges</h2>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={applyDefaultWedges}>
                Default
              </Button>
              <Button
                variant="secondary"
                disabled={draft.wedges.length === 0}
                onClick={shuffleWedges}
              >
                Shuffle
              </Button>
            </div>
            <ul className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
              {draft.wedges.length === 0 && <li className="text-muted">No wedges yet.</li>}
              {draft.wedges.map((wedge, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: wedges have no stable id; add/remove/shuffle all replace the whole list
                <WedgeRow key={index} wedge={wedge} onRemove={() => removeWedge(index)} />
              ))}
            </ul>
            <AddWedgeForm onAdd={addWedge} />
          </div>

          <div className="flex gap-4">
            <InputField
              label="Vowel cost"
              type="number"
              value={draft.vowelCost}
              onChange={(event) => setVowelCost(Number(event.target.value))}
            />
            <InputField
              label="Solve bonus"
              type="number"
              value={draft.solveBonus}
              onChange={(event) => setSolveBonus(Number(event.target.value))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 md:sticky md:top-8 md:h-fit md:self-start">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-lg text-strong">Preview</h2>
            <SolutionBoard rows={draft.solution} />
          </div>
          <div className="flex justify-center">
            <div className="w-full max-w-xs">
              <WheelGraphic wedges={draft.wedges} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          disabled={!validation.valid || exporting}
          className="self-start"
          onClick={() => void handleExport(draft)}
        >
          {exporting ? 'Exporting…' : 'Export round'}
        </Button>
        {!validation.valid && (
          <p role="alert" className="text-sm text-danger">
            {validation.error}
          </p>
        )}
      </div>
    </div>
  );
}
