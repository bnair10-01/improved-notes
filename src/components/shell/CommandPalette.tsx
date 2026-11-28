import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { NAV } from "@/lib/nav";
import { openTarget, useVault } from "@/lib/vault";

const EVENT = "open-palette";
/** True on phones and tablets, where there's no keyboard shortcut and search opens with a pull down instead. */
export const touchFirst = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

/** Open the search / jump palette from anywhere. */
export const openPalette = () => window.dispatchEvent(new Event(EVENT));

const SKIP = "input,textarea,select,[contenteditable=true],canvas,.react-flow,[data-scene],[role=dialog],[role=alertdialog],[data-radix-popper-content-wrapper]";
const PULL_AT = 80;

/** Is something between this touch and the page scrolled down already? Then a downward drag is just scrolling back up. */
function scrolledDown(from: EventTarget | null) {
  for (let e = from instanceof Element ? from : null; e && e !== document.body; e = e.parentElement) {
    const o = getComputedStyle(e).overflowY;
    if ((o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight && e.scrollTop > 0) return true;
  }
  return false;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [pull, setPull] = useState(0);
  const openRef = useRef(false);
  openRef.current = open;
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { data: vault } = useVault();
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); } };
    const evt = () => setOpen(true);
    window.addEventListener("keydown", key);
    window.addEventListener(EVENT, evt);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener(EVENT, evt); };
  }, []);
  // On a phone there's no keyboard shortcut: drag down from the top of any screen to search and jump.
  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches) return;
    let x0 = 0, y0 = 0, on = false, amount = 0;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      on = e.touches.length === 1 && !!t && !openRef.current && window.scrollY <= 0 && !(e.target instanceof Element && e.target.closest(SKIP)) && !scrolledDown(e.target);
      if (on && t) { x0 = t.clientX; y0 = t.clientY; amount = 0; }
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!on || !t) return;
      const dy = t.clientY - y0, dx = t.clientX - x0;
      if (dy < -8 || Math.abs(dx) > Math.abs(dy) + 10) { on = false; amount = 0; setPull(0); return; }
      amount = Math.max(0, dy);
      setPull(Math.min(amount, 120));
    };
    const end = () => {
      if (on && amount >= PULL_AT) setOpen(true);
      on = false; amount = 0; setPull(0);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    window.addEventListener("touchcancel", end, { passive: true });
    return () => { window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", end); window.removeEventListener("touchcancel", end); };
  }, []);
  const notes = (vault?.notes ?? []).filter((n) => !n.deleted_at);
  const folders = vault?.folders ?? [];
  const close = (o: boolean) => { setOpen(o); if (!o) setQuery(""); };
  const go = (fn: () => void) => { close(false); fn(); };
  return (
    <>
    {pull > 8 && (
      <div aria-hidden data-pull-search className="pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 rounded-full border bg-background/95 px-3.5 py-1.5 text-xs shadow-lg backdrop-blur"
        style={{ top: `calc(env(safe-area-inset-top) + ${Math.min(pull, 110) * 0.55}px)`, opacity: Math.min(1, pull / PULL_AT) }}>
        {pull >= PULL_AT ? "Release to search" : "Pull down to search"}
      </div>
    )}
    <CommandDialog open={open} onOpenChange={close}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search notes, topics and pages…" />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {NAV.map((n) => <CommandItem key={n.to} value={`go ${n.label}`} onSelect={() => go(() => navigate({ to: n.to }))}>{n.label}</CommandItem>)}
          <CommandItem value="scan handwriting photo" onSelect={() => go(() => navigate({ to: "/scan" }))}>Scan handwriting</CommandItem>
        </CommandGroup>
        {folders.length > 0 && (
          <CommandGroup heading="Topics">
            {folders.map((f) => <CommandItem key={f.id} value={`topic ${f.name} ${f.id}`} onSelect={() => go(() => navigate({ to: "/topics/$folderId", params: { folderId: f.id } }))}>{f.name}</CommandItem>)}
          </CommandGroup>
        )}
        {notes.length > 0 && (
          <CommandGroup heading="Notes">
            {notes.map((n) => <CommandItem key={n.id} value={`${n.title} ${n.id}`} onSelect={() => go(() => navigate(openTarget(n)))}>{n.title || "Untitled"}</CommandItem>)}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
    </>
  );
}
