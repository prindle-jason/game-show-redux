import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exportFinalJeopardyRound = vi.fn().mockResolvedValue(new Blob());
const downloadRoundZip = vi.fn();

vi.mock('./final-jeopardy-export.js', () => ({ exportFinalJeopardyRound }));
vi.mock('./export-round.js', () => ({ downloadRoundZip }));

async function renderEditor() {
  const { useFinalJeopardyDraftStore } = await import('./final-jeopardy-draft-store.js');
  useFinalJeopardyDraftStore.setState({
    draft: {
      roundId: 'test-round',
      title: '',
      category: '',
      clueText: '',
      answerText: '',
      assets: {},
    },
  });
  const { FinalJeopardyEditor } = await import('./FinalJeopardyEditor.js');
  render(
    <MemoryRouter>
      <FinalJeopardyEditor />
    </MemoryRouter>,
  );
}

describe('FinalJeopardyEditor', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    exportFinalJeopardyRound.mockClear();
    downloadRoundZip.mockClear();
  });

  it('reflects clue and answer edits in the live preview', async () => {
    await renderEditor();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Geography' } });
    fireEvent.change(screen.getByLabelText('Clue text'), {
      target: { value: 'Highest capital in Africa' },
    });
    fireEvent.change(screen.getByLabelText('Answer text'), {
      target: { value: 'What is Addis Ababa?' },
    });

    expect(screen.getByRole('heading', { name: 'Geography' })).toBeInTheDocument();
    expect(screen.getByText('Highest capital in Africa')).toBeInTheDocument();
    expect(screen.getByText('What is Addis Ababa?')).toBeInTheDocument();
  });

  it('disables Export until the draft is valid, then enables it', async () => {
    await renderEditor();
    const exportButton = screen.getByRole('button', { name: 'Export round' });
    expect(exportButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'World Capitals' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Geography' } });
    expect(exportButton).toBeDisabled(); // still no clue/answer content

    fireEvent.change(screen.getByLabelText('Clue text'), { target: { value: 'Clue' } });
    expect(exportButton).toBeDisabled(); // still no answer content

    fireEvent.change(screen.getByLabelText('Answer text'), { target: { value: 'Answer' } });
    expect(exportButton).not.toBeDisabled();
  });

  it('exports the round as a zip once valid', async () => {
    await renderEditor();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'World Capitals' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Geography' } });
    fireEvent.change(screen.getByLabelText('Clue text'), { target: { value: 'Clue' } });
    fireEvent.change(screen.getByLabelText('Answer text'), { target: { value: 'Answer' } });

    fireEvent.click(screen.getByRole('button', { name: 'Export round' }));

    await vi.waitFor(() => expect(downloadRoundZip).toHaveBeenCalled());
    expect(exportFinalJeopardyRound).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'World Capitals', category: 'Geography' }),
    );
  });
});
