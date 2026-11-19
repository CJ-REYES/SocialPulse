import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTeal disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-electricTeal text-midnight font-semibold hover:bg-electricTeal-hover shadow-tealGlow',
        secondary:
          'bg-slateBlue text-slate-100 border border-slateBlue-border hover:bg-slateBlue-hover',
        outline:
          'border border-slateBlue-border bg-midnight/60 text-slate-200 hover:border-electricTeal/60 hover:text-electricTeal',
        ghost:
          'text-slate-300 hover:bg-slateBlue hover:text-white',
        danger:
          'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
