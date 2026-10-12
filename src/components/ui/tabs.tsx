import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) { return <TabsPrimitive.List className={cn('inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground', className)} {...props} />; }
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) { return <TabsPrimitive.Trigger className={cn('inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow', className)} {...props} />; }
export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) { return <TabsPrimitive.Content className={cn('mt-3 outline-none focus-visible:ring-2', className)} {...props} />; }
