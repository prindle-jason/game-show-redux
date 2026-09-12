import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { cn } from './cn.js';

export const surfaceControlStyles = 'rounded-md border border-border bg-surface-1 text-strong';

const controlStyles = cn(
  surfaceControlStyles,
  'px-3 py-2 placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:pointer-events-none',
);

type FieldChromeProps = {
  label: string;
  error?: string;
  wrapperClassName?: string;
  controlId: string;
  children: ReactNode;
};

function FieldChrome({ label, error, wrapperClassName, controlId, children }: FieldChromeProps) {
  return (
    <div className={cn('flex flex-col gap-1', wrapperClassName)}>
      <label htmlFor={controlId} className="text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type FieldBaseProps = {
  label: string;
  error?: string;
  wrapperClassName?: string;
  className?: string;
  id?: string;
};

export type FieldProps = FieldBaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>;

export function InputField({ label, error, wrapperClassName, className, id, ...rest }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  return (
    <FieldChrome
      label={label}
      error={error}
      wrapperClassName={wrapperClassName}
      controlId={controlId}
    >
      <input id={controlId} className={cn(controlStyles, className)} {...rest} />
    </FieldChrome>
  );
}

export type TextareaFieldProps = FieldBaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'id'>;

export function TextareaField({
  label,
  error,
  wrapperClassName,
  className,
  id,
  ...rest
}: TextareaFieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  return (
    <FieldChrome
      label={label}
      error={error}
      wrapperClassName={wrapperClassName}
      controlId={controlId}
    >
      <textarea id={controlId} className={cn(controlStyles, className)} {...rest} />
    </FieldChrome>
  );
}

export type SelectFieldProps = FieldBaseProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id'> & { children: ReactNode };

export function SelectField({
  label,
  error,
  wrapperClassName,
  className,
  id,
  children,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  return (
    <FieldChrome
      label={label}
      error={error}
      wrapperClassName={wrapperClassName}
      controlId={controlId}
    >
      <select id={controlId} className={cn(controlStyles, className)} {...rest}>
        {children}
      </select>
    </FieldChrome>
  );
}
