import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exportWheelRound = vi.fn().mockResolvedValue(new Blob());
const downloadRoundZip = vi.fn();

vi.mock('./export-round.js', () => ({ exportWheelRound, downloadRoundZip }));

async function renderEditor() {
  const { useWheelDraftStore } = await import('./wheel-draft-store.js');
  useWheelDraftStore.setState({
    draft: {
      roundId: 'test-round',
      title: '',
      category: '',
      solution: ['', '', '', ''],
      wedges: [],
      vowelCost: 250,
      solveBonus: 0,
    },
  });
  const { WheelEditor } = await import('./WheelEditor.js');
  render(
    <MemoryRouter>
      <WheelEditor />
    </MemoryRouter>,
  );
}

describe('WheelEditor', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    exportWheelRound.mockClear();
    downloadRoundZip.mockClear();
  });

  it('reflects solution row edits in the live preview', async () => {
    await renderEditor();
    fireEvent.change(screen.getByLabelText('Row 1'), { target: { value: 'HELLO' } });
    expect(screen.getByRole('listitem', { name: 'HELLO' })).toBeInTheDocument();
  });

  it('disables Export until the draft is valid, then enables it', async () => {
    await renderEditor();
    const exportButton = screen.getByRole('button', { name: 'Export round' });
    expect(exportButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Puzzle' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Places' } });
    expect(exportButton).toBeDisabled(); // still no wedges

    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect(exportButton).not.toBeDisabled();
  });

  it('shuffles existing wedges without changing how many there are', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    const before = screen.getAllByRole('listitem').length;
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(before);
  });

  it('exports the round as a zip once valid', async () => {
    await renderEditor();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Puzzle' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Places' } });
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));

    fireEvent.click(screen.getByRole('button', { name: 'Export round' }));

    await vi.waitFor(() => expect(downloadRoundZip).toHaveBeenCalled());
    expect(exportWheelRound).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Puzzle', category: 'Places' }),
    );
  });
});
