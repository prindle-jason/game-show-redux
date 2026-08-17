import { useState } from 'react';
import { Link } from 'react-router';
import { downloadRoundZip } from './export-round.js';
import {
  type FinalJeopardyDraft,
  useFinalJeopardyDraftStore,
  validateFinalJeopardyDraft,
} from './final-jeopardy-draft-store.js';
import { exportFinalJeopardyRound } from './final-jeopardy-export.js';
import { MediaField } from './MediaField.js';

export function FinalJeopardyEditor() {
  const draft = useFinalJeopardyDraftStore((state) => state.draft);
  const setTitle = useFinalJeopardyDraftStore((state) => state.setTitle);
  const setCategory = useFinalJeopardyDraftStore((state) => state.setCategory);
  const setClueText = useFinalJeopardyDraftStore((state) => state.setClueText);
  const setClueMedia = useFinalJeopardyDraftStore((state) => state.setClueMedia);
  const setAnswerText = useFinalJeopardyDraftStore((state) => state.setAnswerText);
  const setAnswerMedia = useFinalJeopardyDraftStore((state) => state.setAnswerMedia);
  const attachAsset = useFinalJeopardyDraftStore((state) => state.attachAsset);
  const [exporting, setExporting] = useState(false);

  const validation = validateFinalJeopardyDraft(draft);

  async function handleExport(current: FinalJeopardyDraft) {
    setExporting(true);
    try {
      const blob = await exportFinalJeopardyRound(current);
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

      <h2>Clue</h2>
      <label>
        Clue text
        <input value={draft.clueText} onChange={(event) => setClueText(event.target.value)} />
      </label>
      <MediaField
        label="Clue media"
        media={draft.clueMedia}
        assets={draft.assets}
        attachAsset={attachAsset}
        onChange={setClueMedia}
      />

      <h2>Answer</h2>
      <label>
        Answer text
        <input value={draft.answerText} onChange={(event) => setAnswerText(event.target.value)} />
      </label>
      <MediaField
        label="Answer media"
        media={draft.answerMedia}
        assets={draft.assets}
        attachAsset={attachAsset}
        onChange={setAnswerMedia}
      />

      <h2>Preview</h2>
      <article>
        <h3>{draft.category}</h3>
        <p>{draft.clueText}</p>
        <p>{draft.answerText}</p>
      </article>

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
