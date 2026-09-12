import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputField, SelectField, TextareaField } from './field.js';

describe('Field', () => {
  afterEach(() => cleanup());

  it('associates the label with the input via id/htmlFor', () => {
    render(<InputField label="Name" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('renders a textarea for TextareaField', () => {
    render(<TextareaField label="Notes" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA');
  });

  it('renders a select for SelectField', () => {
    render(
      <SelectField label="Kind" value="a" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </SelectField>,
    );
    expect(screen.getByLabelText('Kind').tagName).toBe('SELECT');
  });

  it('shows error text with role="alert" when provided', () => {
    render(<InputField label="Name" value="" onChange={() => {}} error="Required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('forwards native input props like onChange', () => {
    const handleChange = vi.fn();
    render(<InputField label="Name" value="" onChange={handleChange} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jason' } });
    expect(handleChange).toHaveBeenCalled();
  });
});
