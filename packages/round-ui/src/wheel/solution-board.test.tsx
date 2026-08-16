import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SolutionBoard } from './solution-board.js';

describe('SolutionBoard', () => {
  it('renders one item per row', () => {
    render(<SolutionBoard rows={['ABC', '', 'IT IS']} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('ABC')).toBeInTheDocument();
    expect(screen.getByText('IT IS')).toBeInTheDocument();
  });
});
