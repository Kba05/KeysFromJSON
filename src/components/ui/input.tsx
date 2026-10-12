import * as React from 'react';
import { cn } from '@/lib/utils';
export function Input({ className, type, ...props }: React.ComponentProps<'input'>) { return <input type={type} className={cn('flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50', className)} {...props} />; }
