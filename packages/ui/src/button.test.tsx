import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button.js';

describe('Button', () => {
  afterEach(() => cleanup());

  it('renders as a native button with its label', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('defaults to type="button" so it never submits a wrapping form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('respects an explicit type', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit');
  });

  it('applies variant and size classes', () => {
    render(
      <Button variant="danger" size="lg">
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toContain('bg-danger');
    expect(button.className).toContain('text-lg');
  });

  it('merges a caller-provided className without dropping variant classes', () => {
    render(<Button className="w-full">Wide</Button>);
    const button = screen.getByRole('button', { name: 'Wide' });
    expect(button.className).toContain('w-full');
    expect(button.className).toContain('bg-primary');
  });

  it('fires onClick and honors disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
