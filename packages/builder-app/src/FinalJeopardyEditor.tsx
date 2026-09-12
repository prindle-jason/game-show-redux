import { Button, InputField } from '@gameshow/ui';
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
      <InputField
        label="Category"
        value={draft.category}
        onChange={(event) => setCategory(event.target.value)}
      />

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-strong">Clue</h2>
        <InputField
          label="Clue text"
          value={draft.clueText}
          onChange={(event) => setClueText(event.target.value)}
        />
        <MediaField
          label="Clue media"
          media={draft.clueMedia}
          assets={draft.assets}
          attachAsset={attachAsset}
          onChange={setClueMedia}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-strong">Answer</h2>
        <InputField
          label="Answer text"
          value={draft.answerText}
          onChange={(event) => setAnswerText(event.target.value)}
        />
        <MediaField
          label="Answer media"
          media={draft.answerMedia}
          assets={draft.assets}
          attachAsset={attachAsset}
          onChange={setAnswerMedia}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg text-strong">Preview</h2>
        <article className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
          <h3 className="font-display text-base text-strong">{draft.category}</h3>
          <p className="text-strong">{draft.clueText}</p>
          <p className="text-muted">{draft.answerText}</p>
        </article>
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
