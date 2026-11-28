import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Rename a note or a topic. 16px text so a phone doesn't zoom in, Enter to save, and nothing changes if the name is empty. */
export function RenameDialog({ open, what, initial, onSave, onClose }: { open: boolean; what: "note" | "topic"; initial: string; onSave: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setName(initial); }, [open, initial]);
  const clean = name.trim().slice(0, 200);
  const unchanged = clean === initial.trim();
  async function save() {
    if (!clean || unchanged || busy) return;
    setBusy(true);
    try { await onSave(clean); onClose(); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-sm" data-rename-dialog>
        <DialogHeader>
          <DialogTitle>Rename {what}</DialogTitle>
          <DialogDescription>{what === "note" ? "Links to this note in your other notes are updated to match." : "Notes inside keep their place."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-3">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label={`New ${what} name`} maxLength={200} className="text-base sm:text-sm" />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-0" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" className="min-h-11 sm:min-h-0" disabled={!clean || unchanged || busy}>{busy ? <Loader2 className="animate-spin" /> : null} Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
