import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MenuAction = { label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void | Promise<void> };

/**
 * The "⋯" menu for a note or a topic. It opens on tap (not on pointer-down, which misfires on phones) with rows big enough for a
 * thumb, and the button is always visible rather than hidden until hover, so it works the same on a laptop, an iPhone and Android.
 */
export function ItemMenu({ label, actions, className = "" }: { label: string; actions: MenuAction[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} data-item-menu onClick={(e) => e.stopPropagation()}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground sm:h-8 sm:w-8 ${className}`}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1.5" onClick={(e) => e.stopPropagation()}>
        {actions.map((a) => (
          <button key={a.label} type="button" role="menuitem"
            onClick={() => { setOpen(false); void a.onSelect(); }}
            className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary active:bg-secondary ${a.danger ? "text-destructive" : ""}`}>
            {a.icon}{a.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
