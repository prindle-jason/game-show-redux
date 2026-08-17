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

  it('renders a working link for Final Jeopardy', () => {
    render(
      <MemoryRouter>
        <RoundPicker />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Final Jeopardy/ });
    expect(link).toHaveAttribute('href', '/final-jeopardy');
  });

  it('renders a working link for Jeopardy', () => {
    render(
      <MemoryRouter>
        <RoundPicker />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /^Jeopardy/ });
    expect(link).toHaveAttribute('href', '/jeopardy');
  });
});
