"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

/**
 * The menu used for Share, Export and similar. It keeps the familiar DropdownMenu names, but opens on tap (a Popover) rather than on
 * pointer-down, which misfires inside phone web views, and its rows are thumb-sized. Choosing an item closes the menu.
 */
const Ctx = React.createContext<{ close: () => void }>({ close: () => undefined });

function DropdownMenu({ children, open: controlled, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const [inner, setInner] = React.useState(false);
  const open = controlled ?? inner;
  const set = (o: boolean) => { setInner(o); onOpenChange?.(o); };
  return (
    <Ctx.Provider value={{ close: () => set(false) }}>
      <PopoverPrimitive.Root open={open} onOpenChange={set}>{children}</PopoverPrimitive.Root>
    </Ctx.Provider>
  );
}

const DropdownMenuTrigger = PopoverPrimitive.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, sideOffset = 6, align = "end", ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref} role="menu" sideOffset={sideOffset} align={align}
      className={cn(
        "z-50 min-w-[10rem] max-w-[92vw] overflow-hidden rounded-md border bg-popover p-1.5 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

type ItemProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> & { inset?: boolean; onSelect?: (e: React.MouseEvent<HTMLButtonElement>) => void };
const DropdownMenuItem = React.forwardRef<HTMLButtonElement, ItemProps>(({ className, inset, onClick, onSelect, disabled, ...props }, ref) => {
  const { close } = React.useContext(Ctx);
  return (
    <button
      ref={ref} type="button" role="menuitem" disabled={disabled}
      onClick={(e) => { onClick?.(e); onSelect?.(e); close(); }}
      className={cn(
        "flex min-h-11 w-full cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent active:bg-accent disabled:pointer-events-none disabled:opacity-50 sm:min-h-9 sm:px-2 sm:py-1.5 [&>svg]:size-4 [&>svg]:shrink-0",
        inset && "pl-8", className,
      )}
      {...props}
    />
  );
});
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuLabel = ({ className, inset, ...props }: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) => (
  <div className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)} {...props} />
);

const DropdownMenuSeparator = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div role="separator" className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
);

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator };
