import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exportJeopardyRound = vi.fn().mockResolvedValue(new Blob());
const downloadRoundZip = vi.fn();

vi.mock('./jeopardy-export.js', () => ({ exportJeopardyRound }));
vi.mock('./export-round.js', () => ({ downloadRoundZip }));

async function renderEditor() {
  const { useJeopardyDraftStore } = await import('./jeopardy-draft-store.js');
  useJeopardyDraftStore.setState({
    draft: {
      roundId: 'test-round',
      title: '',
      categories: [],
      assets: {},
    },
  });
  const { JeopardyEditor } = await import('./JeopardyEditor.js');
  render(
    <MemoryRouter>
      <JeopardyEditor />
    </MemoryRouter>,
  );
}

describe('JeopardyEditor', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    exportJeopardyRound.mockClear();
    downloadRoundZip.mockClear();
  });

  it('seeds a 6x5 grid with the expected values via Default board', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Default board' }));

    expect(screen.getAllByLabelText(/Category \d name/)).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: '200' })).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: '400' })).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: '600' })).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: '800' })).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: '1000' })).toHaveLength(6);
  });

  it('Add category adds an editable, removable header', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    expect(screen.getByLabelText('Category 1 name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove category' }));
    expect(screen.queryByLabelText('Category 1 name')).not.toBeInTheDocument();
  });

  it('clicking Add clue opens the edit panel pre-filled for the new clue', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add clue' }));

    expect(screen.getByRole('heading', { name: 'Edit clue' })).toBeInTheDocument();
    expect(screen.getByLabelText('Value')).toHaveValue(200);
    expect(screen.getByLabelText('Clue text')).toHaveValue('');
    expect(screen.getByLabelText('Answer text')).toHaveValue('');
  });

  it('editing the Value field updates the grid button label', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add clue' }));

    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '999' } });

    expect(screen.getByRole('button', { name: '999' })).toBeInTheDocument();
  });

  it('toggling Daily Double marks the clue in the grid', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add clue' }));

    fireEvent.click(screen.getByLabelText('Daily Double'));

    expect(screen.getByRole('button', { name: '200 (DD)' })).toBeInTheDocument();
  });

  it('Remove clue clears the slot and closes the panel', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add clue' }));

    fireEvent.click(screen.getByRole('button', { name: 'Remove clue' }));

    expect(screen.queryByRole('heading', { name: 'Edit clue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add clue' })).toBeInTheDocument();
  });

  it('disables Export until the draft is valid, then enables it', async () => {
    await renderEditor();
    const exportButton = screen.getByRole('button', { name: 'Export round' });
    expect(exportButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Trivia Night' } });
    expect(exportButton).toBeDisabled(); // no categories yet

    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    fireEvent.change(screen.getByLabelText('Category 1 name'), {
      target: { value: 'Science' },
    });
    expect(exportButton).toBeDisabled(); // category has no clues yet

    fireEvent.click(screen.getByRole('button', { name: 'Add clue' }));
    expect(exportButton).toBeDisabled(); // clue has no clue/answer content

    fireEvent.change(screen.getByLabelText('Clue text'), { target: { value: 'H2O' } });
    expect(exportButton).toBeDisabled(); // still no answer content

    fireEvent.change(screen.getByLabelText('Answer text'), {
      target: { value: 'What is water?' },
    });
    expect(exportButton).not.toBeDisabled();
  });

  it('exports the round as a zip once valid', async () => {
    await renderEditor();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Trivia Night' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    fireEvent.change(screen.getByLabelText('Category 1 name'), {
      target: { value: 'Science' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add clue' }));
    fireEvent.change(screen.getByLabelText('Clue text'), { target: { value: 'H2O' } });
    fireEvent.change(screen.getByLabelText('Answer text'), {
      target: { value: 'What is water?' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export round' }));

    await vi.waitFor(() => expect(downloadRoundZip).toHaveBeenCalled());
    expect(exportJeopardyRound).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Trivia Night',
        categories: expect.arrayContaining([expect.objectContaining({ name: 'Science' })]),
      }),
    );
  });
});
