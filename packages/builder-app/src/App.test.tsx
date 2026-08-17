import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.js';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  afterEach(() => cleanup());

  it('shows the round-type picker at the root path', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Quiz Builder' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wheel of Fortune/ })).toBeInTheDocument();
  });

  it('shows the Wheel editor at its route', () => {
    renderAt('/wheel-of-fortune');
    expect(screen.getByText(/Round id:/)).toBeInTheDocument();
  });

  it('shows the Final Jeopardy editor at its route', () => {
    renderAt('/final-jeopardy');
    expect(screen.getByText(/Round id:/)).toBeInTheDocument();
  });

  it('shows the Jeopardy editor at its route', () => {
    renderAt('/jeopardy');
    expect(screen.getByText(/Round id:/)).toBeInTheDocument();
  });
});
