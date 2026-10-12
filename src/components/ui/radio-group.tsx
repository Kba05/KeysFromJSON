import * as React from 'react';
import { Circle } from 'lucide-react';
import { RadioGroup as RadioPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
export function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioPrimitive.Root>) { return <RadioPrimitive.Root className={cn('grid gap-2', className)} {...props} />; }
export function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioPrimitive.Item>) { return <RadioPrimitive.Item className={cn('aspect-square size-4 rounded-full border border-primary text-primary focus:outline-none focus-visible:ring-2', className)} {...props}><RadioPrimitive.Indicator className="flex items-center justify-center"><Circle className="size-2.5 fill-current" /></RadioPrimitive.Indicator></RadioPrimitive.Item>; }
