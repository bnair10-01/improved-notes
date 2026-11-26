import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NAV } from "@/lib/nav";
import { NewActionGrid } from "./NewActions";

export function MobileTabBar() {
  const [open, setOpen] = useState(false);
  const items = [NAV[0], NAV[1], null, NAV[2], NAV[3]];
  return (
    <>
      <nav data-tabbar aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 backdrop-blur-md md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {items.map((n) => n ? (
          <Link key={n.to} to={n.to} activeOptions={{ exact: n.exact }} className="flex h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground" activeProps={{ className: "text-primary font-semibold" }}>
            <n.icon className="h-5 w-5" aria-hidden />{n.label}
          </Link>
        ) : (
          <button key="new" onClick={() => setOpen(true)} aria-label="New" className="flex items-center justify-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-md"><Plus /></span>
          </button>
        ))}
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetTitle className="mb-3">Create</SheetTitle>
          <NewActionGrid compact onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
