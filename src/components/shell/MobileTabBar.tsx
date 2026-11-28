import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { NAV, isActive } from "@/lib/nav";
import { useAuth } from "@/lib/auth";
import { studyDueQuery } from "@/lib/study";
import { AddItems } from "./AddMenu";
import { NavIcon, navKind } from "./NavIcon";

export function MobileTabBar() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { data: study } = useQuery({ ...studyDueQuery, enabled: !!user });
  const due = study?.dueTotal ?? 0;
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const by = (to: string) => NAV.find((n) => n.to === to)!;
  // Notes and the graph of all of them, Add in the middle, then Topics and Study. Home is the logo in the top bar.
  const items = [by("/vault"), by("/vault/graph"), null, by("/topics"), by("/study")];
  return (
    <>
      <nav data-tabbar aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-xl grid-cols-5">
        {items.map((n) => n ? (
          // The app's own section logic decides which tab is open: the graph lives under /vault but is its own tab, not Notes.
          <Link key={n.to} to={n.to} activeOptions={{ exact: true }} data-on={isActive(n, pathname) ? "" : undefined} aria-current={isActive(n, pathname) ? "page" : undefined}
            className={`flex h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[11px] ${isActive(n, pathname) ? "font-semibold text-primary" : "text-muted-foreground"}`}>
            <span className="relative"><NavIcon kind={navKind(n.to)} className="h-6 w-6" />{n.to === "/study" && due > 0 && <span aria-label={`${due} cards due`} className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-primary" />}</span>{n.label}
          </Link>
        ) : (
          <button key="new" onClick={() => setOpen(true)} aria-label="Add" className="flex items-center justify-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-md"><Plus className={`ni-plus transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${open ? "rotate-[135deg]" : ""}`} /></span>
          </button>
        ))}
        </div>
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
