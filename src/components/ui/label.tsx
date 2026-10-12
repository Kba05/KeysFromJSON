import * as React from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) { return <LabelPrimitive.Root className={cn('text-sm font-medium leading-none peer-disabled:opacity-70', className)} {...props} />; }
