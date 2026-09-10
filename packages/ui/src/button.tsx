import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn.js';

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 disabled:opacity-40 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-surface-0 hover:shadow-glow-primary focus-visible:ring-primary',
        secondary:
          'bg-secondary text-strong hover:shadow-glow-secondary focus-visible:ring-secondary',
        danger: 'bg-danger text-surface-0 hover:shadow-glow-danger focus-visible:ring-danger',
        ghost: 'bg-transparent text-strong hover:bg-strong/10 focus-visible:ring-strong',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...props} />
  );
}
