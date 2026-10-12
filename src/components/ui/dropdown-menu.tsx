import * as React from 'react';
import { DropdownMenu as DropdownPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export function DropdownMenuContent({ className, sideOffset = 4, ...props }: React.ComponentProps<typeof DropdownPrimitive.Content>) { return <DropdownPrimitive.Portal><DropdownPrimitive.Content sideOffset={sideOffset} className={cn('z-50 min-w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md', className)} {...props} /></DropdownPrimitive.Portal>; }
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Item>) { return <DropdownPrimitive.Item className={cn('relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[disabled]:opacity-50', className)} {...props} />; }
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Label>) { return <DropdownPrimitive.Label className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />; }
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Separator>) { return <DropdownPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />; }
