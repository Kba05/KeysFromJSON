import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({ className, sideOffset = 4, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) { return <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={sideOffset} className={cn('z-50 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow', className)} {...props} /></TooltipPrimitive.Portal>; }
