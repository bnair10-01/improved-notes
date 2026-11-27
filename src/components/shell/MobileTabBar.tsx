import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NAV } from "@/lib/nav";
import { AddItems } from "./AddMenu";

export function MobileTabBar() {
  const [open, setOpen] = useState(false);
  const by = (to: string) => NAV.find((n) => n.to === to)!;
  const items = [by("/"), by("/vault"), null, by("/study"), by("/topics")];
  return (
    <>
      <nav data-tabbar aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 backdrop-blur-md md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {items.map((n) => n ? (
          <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }} className="flex h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground" activeProps={{ className: "text-primary font-semibold" }}>
            <n.icon className="h-5 w-5" aria-hidden />{n.label}
          </Link>
        ) : (
          <button key="new" onClick={() => setOpen(true)} aria-label="Add" className="flex items-center justify-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-md"><Plus /></span>
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
