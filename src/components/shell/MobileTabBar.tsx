import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NAV, isActive } from "@/lib/nav";
import { AddItems } from "./AddMenu";
import { NavIcon, navKind } from "./NavIcon";

export function MobileTabBar() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const by = (to: string) => NAV.find((n) => n.to === to)!;
  // Home, Notes and the graph of all of them, then Add, then Topics and Study.
  const items = [by("/"), by("/vault"), by("/vault/graph"), null, by("/topics"), by("/study")];
  return (
    <>
      <nav data-tabbar aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t bg-background/95 backdrop-blur-md md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {items.map((n) => n ? (
          // The app's own section logic decides which tab is open: the graph lives under /vault but is its own tab, not Notes.
          <Link key={n.to} to={n.to} activeOptions={{ exact: true }} data-on={isActive(n, pathname) ? "" : undefined} aria-current={isActive(n, pathname) ? "page" : undefined}
            className={`flex h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[11px] ${isActive(n, pathname) ? "font-semibold text-primary" : "text-muted-foreground"}`}>
            <NavIcon kind={navKind(n.to)} className="h-6 w-6" />{n.label}
          </Link>
        ) : (
          <button key="new" onClick={() => setOpen(true)} aria-label="Add" className="flex items-center justify-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-md"><Plus className={`ni-plus transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${open ? "rotate-[135deg]" : ""}`} /></span>
          </button>
        ))}
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetTitle className="mb-2">Add</SheetTitle>
          <AddItems onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
