import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JeopardyBoardGrid } from './board-grid.js';

describe('JeopardyBoardGrid', () => {
  afterEach(() => cleanup());

  it('renders one header per category and one row per rowCount', () => {
    render(
      <JeopardyBoardGrid
        categoryNames={['Science', 'History']}
        rowCount={2}
        renderCell={(categoryIndex, clueIndex) => `${categoryIndex}-${clueIndex}`}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Science' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'History' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header row + 2 body rows
    for (const label of ['0-0', '1-0', '0-1', '1-1']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('falls back to plain category-name text when renderHeader is omitted', () => {
    render(<JeopardyBoardGrid categoryNames={['Science']} rowCount={1} renderCell={() => 'x'} />);
    expect(screen.getByRole('columnheader', { name: 'Science' })).toBeInTheDocument();
  });

  it('uses renderHeader when provided, passing the category index and name', () => {
    render(
      <JeopardyBoardGrid
        categoryNames={['Science', 'History']}
        rowCount={1}
        renderCell={() => null}
        renderHeader={(categoryIndex, name) => `${categoryIndex}:${name}`}
      />,
    );
    expect(screen.getByRole('columnheader', { name: '0:Science' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '1:History' })).toBeInTheDocument();
  });
});
