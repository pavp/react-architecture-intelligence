import { Popover as PopoverPrimitive } from "@radix-ui/react-popover";

function Trigger({ children }: { children: React.ReactNode }) { return <PopoverPrimitive.Trigger>{children}</PopoverPrimitive.Trigger>; }
function Content({ children }: { children: React.ReactNode }) { return <PopoverPrimitive.Content>{children}</PopoverPrimitive.Content>; }

export const Popover = PopoverPrimitive.Root;
Popover.Trigger = Trigger;
Popover.Content = Content;
export { Popover as FloatingPopover };

export function PopoverExample() {
  return <Popover><Popover.Trigger>More</Popover.Trigger><Popover.Content>Menu</Popover.Content></Popover>;
}
