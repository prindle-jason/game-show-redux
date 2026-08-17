import { JeopardyBoardGrid } from '@gameshow/round-ui';
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
    <div>
      <Link to="/">← Back to round types</Link>
      <p>Round id: {draft.roundId}</p>
      <label>
        Title
        <input value={draft.title} onChange={(event) => setTitle(event.target.value)} />
      </label>

      <h2>Board</h2>
      <button type="button" onClick={applyDefaultBoard}>
        Default board
      </button>
      <button type="button" onClick={addCategory}>
        Add category
      </button>

      {draft.categories.length > 0 && (
        <JeopardyBoardGrid
          categoryNames={draft.categories.map((category) => category.name)}
          rowCount={rowCount}
          renderHeader={(categoryIndex, name) => (
            <div>
              <input
                aria-label={`Category ${categoryIndex + 1} name`}
                value={name}
                onChange={(event) => setCategoryName(categoryIndex, event.target.value)}
              />
              <button type="button" onClick={() => removeCategory(categoryIndex)}>
                Remove category
              </button>
            </div>
          )}
          renderCell={(categoryIndex, clueIndex) => {
            const category = draft.categories[categoryIndex];
            const clue = category?.clues[clueIndex];
            if (clue) {
              return (
                <button type="button" onClick={() => setSelectedClue({ categoryIndex, clueIndex })}>
                  {clue.isDailyDouble ? `${clue.value} (DD)` : clue.value}
                </button>
              );
            }
            if (category && clueIndex === category.clues.length) {
              return (
                <button
                  type="button"
                  onClick={() => {
                    addClue(categoryIndex);
                    setSelectedClue({ categoryIndex, clueIndex });
                  }}
                >
                  Add clue
                </button>
              );
            }
            return null;
          }}
        />
      )}

      {selected && selectedClue && (
        <div>
          <h2>Edit clue</h2>
          <label>
            Value
            <input
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
          </label>
          <label>
            <input
              type="checkbox"
              checked={selected.isDailyDouble}
              onChange={() => toggleDailyDouble(selectedClue.categoryIndex, selectedClue.clueIndex)}
            />
            Daily Double
          </label>

          <h3>Clue</h3>
          <label>
            Clue text
            <input
              value={selected.clueText}
              onChange={(event) =>
                setClueText(selectedClue.categoryIndex, selectedClue.clueIndex, event.target.value)
              }
            />
          </label>
          <MediaField
            label="Clue media"
            media={selected.clueMedia}
            assets={draft.assets}
            attachAsset={attachAsset}
            onChange={(media) =>
              setClueMedia(selectedClue.categoryIndex, selectedClue.clueIndex, media)
            }
          />

          <h3>Answer</h3>
          <label>
            Answer text
            <input
              value={selected.answerText}
              onChange={(event) =>
                setAnswerText(
                  selectedClue.categoryIndex,
                  selectedClue.clueIndex,
                  event.target.value,
                )
              }
            />
          </label>
          <MediaField
            label="Answer media"
            media={selected.answerMedia}
            assets={draft.assets}
            attachAsset={attachAsset}
            onChange={(media) =>
              setAnswerMedia(selectedClue.categoryIndex, selectedClue.clueIndex, media)
            }
          />

          <button
            type="button"
            onClick={() => {
              removeClue(selectedClue.categoryIndex, selectedClue.clueIndex);
              setSelectedClue(null);
            }}
          >
            Remove clue
          </button>
          <button type="button" onClick={() => setSelectedClue(null)}>
            Close
          </button>
        </div>
      )}

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
