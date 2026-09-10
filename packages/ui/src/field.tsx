import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { cn } from './cn.js';

type FieldBaseProps = {
  label: string;
  error?: string;
  wrapperClassName?: string;
  className?: string;
};

type FieldInputProps = FieldBaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & { as?: 'input' };
type FieldTextareaProps = FieldBaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & { as: 'textarea' };
type FieldSelectProps = FieldBaseProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
    as: 'select';
    children: ReactNode;
  };

export type FieldProps = FieldInputProps | FieldTextareaProps | FieldSelectProps;

const controlStyles =
  'rounded-md border border-border bg-surface-1 px-3 py-2 text-strong placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:pointer-events-none';

export function Field(props: FieldProps) {
  const autoId = useId();
  const {
    label,
    error,
    wrapperClassName,
    className,
    as = 'input',
    id,
    ...rest
  } = props as FieldProps & { id?: string };
  const controlId = id ?? autoId;
  const controlClassName = cn(controlStyles, className);

  return (
    <div className={cn('flex flex-col gap-1', wrapperClassName)}>
      <label htmlFor={controlId} className="text-sm font-medium text-muted">
        {label}
      </label>
      {as === 'textarea' && (
        <textarea
          id={controlId}
          className={controlClassName}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      )}
      {as === 'select' && (
        <select
          id={controlId}
          className={controlClassName}
          {...(rest as SelectHTMLAttributes<HTMLSelectElement>)}
        />
      )}
      {as === 'input' && (
        <input
          id={controlId}
          className={controlClassName}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
