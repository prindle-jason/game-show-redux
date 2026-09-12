import { JeopardyBoardGrid } from '@gameshow/round-ui';
import { Button, InputField } from '@gameshow/ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { downloadRoundZip } from './export-round.js';
import {
  type JeopardyDraft,
  useJeopardyDraftStore,
  validateJeopardyDraft,
} from './jeopardy-draft-store.js';
import { exportJeopardyRound } from './jeopardy-export.js';
import { MediaField } from './MediaField.js';

interface SelectedClue {
  categoryIndex: number;
  clueIndex: number;
}

export function JeopardyEditor() {
  const draft = useJeopardyDraftStore((state) => state.draft);
  const setTitle = useJeopardyDraftStore((state) => state.setTitle);
  const addCategory = useJeopardyDraftStore((state) => state.addCategory);
  const removeCategory = useJeopardyDraftStore((state) => state.removeCategory);
  const setCategoryName = useJeopardyDraftStore((state) => state.setCategoryName);
  const addClue = useJeopardyDraftStore((state) => state.addClue);
  const removeClue = useJeopardyDraftStore((state) => state.removeClue);
  const setClueValue = useJeopardyDraftStore((state) => state.setClueValue);
  const setClueText = useJeopardyDraftStore((state) => state.setClueText);
  const setClueMedia = useJeopardyDraftStore((state) => state.setClueMedia);
  const setAnswerText = useJeopardyDraftStore((state) => state.setAnswerText);
  const setAnswerMedia = useJeopardyDraftStore((state) => state.setAnswerMedia);
  const toggleDailyDouble = useJeopardyDraftStore((state) => state.toggleDailyDouble);
  const applyDefaultBoard = useJeopardyDraftStore((state) => state.applyDefaultBoard);
  const attachAsset = useJeopardyDraftStore((state) => state.attachAsset);
  const [selectedClue, setSelectedClue] = useState<SelectedClue | null>(null);
  const [exporting, setExporting] = useState(false);

  const validation = validateJeopardyDraft(draft);
  // +1 beyond the tallest category so every category always has an "Add clue" slot available.
  const rowCount =
    draft.categories.length === 0
      ? 0
      : Math.max(...draft.categories.map((category) => category.clues.length)) + 1;
  const selected = selectedClue
    ? draft.categories[selectedClue.categoryIndex]?.clues[selectedClue.clueIndex]
    : undefined;

  async function handleExport(current: JeopardyDraft) {
    setExporting(true);
    try {
      const blob = await exportJeopardyRound(current);
      downloadRoundZip(blob, current.title);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8">
      <Link to="/" className="text-muted hover:text-strong">
        ← Back to round types
      </Link>
      <p className="text-muted">Round id: {draft.roundId}</p>
      <InputField
        label="Title"
        value={draft.title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-strong">Board</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={applyDefaultBoard}>
            Default board
          </Button>
          <Button variant="secondary" onClick={addCategory}>
            Add category
          </Button>
        </div>

        {draft.categories.length > 0 && (
          <JeopardyBoardGrid
            categoryNames={draft.categories.map((category) => category.name)}
            rowCount={rowCount}
            renderHeader={(categoryIndex, name) => (
              <div className="flex flex-col gap-1">
                <input
                  aria-label={`Category ${categoryIndex + 1} name`}
                  value={name}
                  onChange={(event) => setCategoryName(categoryIndex, event.target.value)}
                  className="rounded-md border border-border bg-surface-1 px-2 py-1 text-sm text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <Button variant="danger" size="sm" onClick={() => removeCategory(categoryIndex)}>
                  Remove category
                </Button>
              </div>
            )}
            renderCell={(categoryIndex, clueIndex) => {
              const category = draft.categories[categoryIndex];
              const clue = category?.clues[clueIndex];
              if (clue) {
                return (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setSelectedClue({ categoryIndex, clueIndex })}
                  >
                    {clue.isDailyDouble ? `${clue.value} (DD)` : clue.value}
                  </Button>
                );
              }
              if (category && clueIndex === category.clues.length) {
                return (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      addClue(categoryIndex);
                      setSelectedClue({ categoryIndex, clueIndex });
                    }}
                  >
                    Add clue
                  </Button>
                );
              }
              return null;
            }}
          />
        )}
      </div>

      {selected && selectedClue && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4">
          <h2 className="font-display text-lg text-strong">Edit clue</h2>
          <div className="flex items-end gap-4">
            <InputField
              label="Value"
              type="number"
              value={selected.value}
              onChange={(event) =>
                setClueValue(
                  selectedClue.categoryIndex,
                  selectedClue.clueIndex,
                  Number(event.target.value),
                )
              }
            />
            <label className="flex items-center gap-2 pb-2 text-strong">
              <input
                type="checkbox"
                checked={selected.isDailyDouble}
                onChange={() =>
                  toggleDailyDouble(selectedClue.categoryIndex, selectedClue.clueIndex)
                }
                className="accent-primary"
              />
              Daily Double
            </label>
          </div>

          <h3 className="font-display text-base text-strong">Clue</h3>
          <InputField
            label="Clue text"
            value={selected.clueText}
            onChange={(event) =>
              setClueText(selectedClue.categoryIndex, selectedClue.clueIndex, event.target.value)
            }
          />
          <MediaField
            label="Clue media"
            media={selected.clueMedia}
            assets={draft.assets}
            attachAsset={attachAsset}
            onChange={(media) =>
              setClueMedia(selectedClue.categoryIndex, selectedClue.clueIndex, media)
            }
          />

          <h3 className="font-display text-base text-strong">Answer</h3>
          <InputField
            label="Answer text"
            value={selected.answerText}
            onChange={(event) =>
              setAnswerText(selectedClue.categoryIndex, selectedClue.clueIndex, event.target.value)
            }
          />
          <MediaField
            label="Answer media"
            media={selected.answerMedia}
            assets={draft.assets}
            attachAsset={attachAsset}
            onChange={(media) =>
              setAnswerMedia(selectedClue.categoryIndex, selectedClue.clueIndex, media)
            }
          />

          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => {
                removeClue(selectedClue.categoryIndex, selectedClue.clueIndex);
                setSelectedClue(null);
              }}
            >
              Remove clue
            </Button>
            <Button variant="ghost" onClick={() => setSelectedClue(null)}>
              Close
            </Button>
          </div>
        </div>
      )}

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
