import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { NAV } from "@/lib/nav";
import { openTarget, useVault } from "@/lib/vault";

const EVENT = "open-palette";
/** Open the search / jump palette from anywhere. */
export const openPalette = () => window.dispatchEvent(new Event(EVENT));

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: vault } = useVault();
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); } };
    const evt = () => setOpen(true);
    window.addEventListener("keydown", key);
    window.addEventListener(EVENT, evt);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener(EVENT, evt); };
  }, []);
  const notes = (vault?.notes ?? []).filter((n) => !n.deleted_at);
  const folders = vault?.folders ?? [];
  const go = (fn: () => void) => { setOpen(false); fn(); };
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search notes, topics and pages…" />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {NAV.map((n) => <CommandItem key={n.to} value={`go ${n.label}`} onSelect={() => go(() => navigate({ to: n.to }))}>{n.label}</CommandItem>)}
          <CommandItem value="go capture new" onSelect={() => go(() => navigate({ to: "/capture" }))}>Capture</CommandItem>
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
  );
}
