import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createFolder, useRefreshVault, useVault } from "@/lib/vault";

/** Asks what the topic is about. Nothing is created until the person has typed a name. */
export function NewTopicDialog({ open, onOpenChange, parentId = null, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; parentId?: string | null; onCreated?: (id: string, name: string) => void }) {
  const { data: vault } = useVault();
  const refresh = useRefreshVault();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const inflight = useRef(false);
  useEffect(() => { if (open) { setName(""); setCreated(false); } }, [open]);

  const trimmed = name.trim();
  // Only warn about a name that was already taken before this dialog saved anything; the topic we just made must not trigger it.
  const taken = !busy && !created && !!trimmed && (vault?.folders ?? []).some((f) => f.parent_id === parentId && f.name.trim().toLowerCase() === trimmed.toLowerCase());

  async function create() {
    if (!trimmed || taken || busy || inflight.current) return;
    inflight.current = true; // a second click in the same instant must not create a second topic
    setBusy(true);
    try {
      const id = await createFolder(trimmed, parentId);
      setCreated(true);
      await refresh();
      onOpenChange(false);
      onCreated?.(id, trimmed);
    } catch { toast.error("Couldn't create the topic. Please try again."); }
    finally { setBusy(false); inflight.current = false; }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{parentId ? "New subtopic" : "New topic"}</DialogTitle>
          <DialogDescription>What is it about? Name it after the subject. You can rename it any time.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-3">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Cell biology" aria-label="Topic name" maxLength={80} />
          {taken && <p role="alert" className="text-xs text-destructive">You already have a topic with that name.</p>}
          <Button type="submit" className="w-full" disabled={!trimmed || taken || busy || created}>{busy ? <><Loader2 className="animate-spin" /> Creating…</> : "Create topic"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
