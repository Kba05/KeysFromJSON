import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
export const Accordion = AccordionPrimitive.Root;
export function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) { return <AccordionPrimitive.Item className={cn('border-b', className)} {...props} />; }
export function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) { return <AccordionPrimitive.Header className="flex"><AccordionPrimitive.Trigger className={cn('flex flex-1 items-center justify-between py-3 text-sm font-medium hover:underline [&[data-state=open]>svg]:rotate-180', className)} {...props}>{children}<ChevronDown className="size-4 shrink-0 transition-transform" /></AccordionPrimitive.Trigger></AccordionPrimitive.Header>; }
export function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) { return <AccordionPrimitive.Content className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down" {...props}><div className={cn('pb-4 pt-1', className)}>{children}</div></AccordionPrimitive.Content>; }
