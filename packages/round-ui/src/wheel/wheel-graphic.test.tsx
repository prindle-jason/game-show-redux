import type { WheelWedge } from '@gameshow/schema';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WheelGraphic } from './wheel-graphic.js';

const WEDGES: WheelWedge[] = [
  { kind: 'cash', value: 500 },
  { kind: 'bankrupt' },
  { kind: 'lose-turn' },
];

describe('WheelGraphic', () => {
  it('renders one labeled slice per wedge', () => {
    render(<WheelGraphic wedges={WEDGES} />);
    expect(screen.getByText('$500')).toBeInTheDocument();
    expect(screen.getByText('Bankrupt')).toBeInTheDocument();
    expect(screen.getByText('Lose a turn')).toBeInTheDocument();
  });

  it('renders an empty circle when there are no wedges', () => {
    render(<WheelGraphic wedges={[]} />);
    expect(screen.getByRole('img', { name: 'Wheel with no wedges yet' })).toBeInTheDocument();
  });
});
