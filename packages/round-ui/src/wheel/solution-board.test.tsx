import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SolutionBoard } from './solution-board.js';

describe('SolutionBoard', () => {
  afterEach(() => cleanup());

  it('renders one item per row', () => {
    render(<SolutionBoard rows={['ABC', '', 'IT IS']} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('listitem', { name: 'ABC' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'IT IS' })).toBeInTheDocument();
  });

  it('renders a fixed 14-cell grid per row, centering short rows among blank cells', () => {
    render(<SolutionBoard rows={['AB']} />);
    const row = screen.getByRole('listitem', { name: 'AB' });
    expect(row.children).toHaveLength(14);
  });

  it('uppercases revealed letters, shows masked letters as an underscore, and leaves word gaps blank', () => {
    render(<SolutionBoard rows={['a_ c']} />);
    const row = screen.getByRole('listitem', { name: 'a_ c' });
    const cellText = Array.from(row.children).map((cell) => cell.textContent);
    // row.length is 4, so offset = floor((14 - 4) / 2) = 5
    expect(cellText.slice(5, 9)).toEqual(['A', '_', ' ', 'C']);
  });

  it('highlights revealed and masked letter cells, but not word gaps', () => {
    render(<SolutionBoard rows={['a_ c']} />);
    const row = screen.getByRole('listitem', { name: 'a_ c' });
    const cells = Array.from(row.children).slice(5, 9);
    expect(cells.map((cell) => cell.className.includes('bg-secondary'))).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });
});
