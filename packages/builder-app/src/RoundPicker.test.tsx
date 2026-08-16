import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { RoundPicker } from './RoundPicker.js';

describe('RoundPicker', () => {
  afterEach(() => cleanup());

  it('renders a working link for Wheel of Fortune', () => {
    render(
      <MemoryRouter>
        <RoundPicker />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Wheel of Fortune/ });
    expect(link).toHaveAttribute('href', '/wheel-of-fortune');
  });

  it('renders Jeopardy and Final Jeopardy as disabled, non-navigable cards', () => {
    render(
      <MemoryRouter>
        <RoundPicker />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /^Jeopardy/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Final Jeopardy/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
  });
});
