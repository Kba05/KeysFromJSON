import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) { return <CheckboxPrimitive.Root className={cn('peer size-4 shrink-0 rounded border border-primary shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary data-[state=checked]:text-primary-foreground', className)} {...props}><CheckboxPrimitive.Indicator className="flex items-center justify-center"><Check className="size-3.5 data-[state=indeterminate]:hidden" /><Minus className="hidden size-3.5 data-[state=indeterminate]:block" /></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root>; }
