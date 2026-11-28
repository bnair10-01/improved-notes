import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eraseEverything, restoreNotes, trashAllNotes, useRefreshVault, useVault } from "@/lib/vault";

const WORD = "DELETE";

/**
 * Settings → Your notes: clear the lot. Two steps on purpose: "Move to Trash" keeps everything recoverable, and "Delete for good"
 * wipes the account's stored data and needs the word typed first. Same on web, iPhone and Android.
 */
export function DataSection() {
  const { data: vault } = useVault();
  const refresh = useRefreshVault();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [ask, setAsk] = useState<"trash" | "erase" | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const live = (vault?.notes ?? []).filter((n) => !n.deleted_at).length;
  const trashed = (vault?.notes ?? []).filter((n) => n.deleted_at).length;
  const topics = vault?.folders.length ?? 0;

  async function toTrash() {
    setBusy(true);
    try {
      const ids = await trashAllNotes();
      await refresh();
      toast(`${ids.length} note${ids.length === 1 ? "" : "s"} moved to Trash`, { action: { label: "Undo", onClick: () => void restoreNotes(ids).then(refresh) } });
      setAsk(null);
    } catch { toast.error("Couldn't clear your notes. Please try again."); } finally { setBusy(false); }
  }
  async function erase() {
    if (typed.trim().toUpperCase() !== WORD) return;
    setBusy(true);
    try {
      await eraseEverything();
      qc.clear();
      toast.success("Everything was deleted.");
      setAsk(null);
      void navigate({ to: "/", replace: true });
    } catch { toast.error("Couldn't finish deleting. Some things may remain; try again."); } finally { setBusy(false); }
  }
  const close = (o: boolean) => { if (!o && !busy) { setAsk(null); setTyped(""); } };

  return (
    <section aria-labelledby="data-heading" className="paper-sheet space-y-3 p-4 sm:p-6" data-data-section>
      <h2 id="data-heading" className="text-lg font-semibold">Your notes</h2>
      <p className="text-sm text-muted-foreground">{live} note{live === 1 ? "" : "s"}, {topics} topic{topics === 1 ? "" : "s"}{trashed ? `, ${trashed} in Trash` : ""}. Download a backup below first if you might want any of it back.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="min-h-11 justify-start sm:min-h-0" disabled={!live} onClick={() => setAsk("trash")} data-clear-notes><Trash2 /> Clear all notes (move to Trash)</Button>
        <Button variant="outline" className="min-h-11 justify-start border-destructive/50 text-destructive hover:text-destructive sm:min-h-0" onClick={() => { setTyped(""); setAsk("erase"); }} data-erase-all><Trash2 /> Delete everything for good…</Button>
      </div>

      <AlertDialog open={ask === "trash"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move all {live} notes to Trash?</AlertDialogTitle>
            <AlertDialogDescription>Nothing is deleted yet. They stay in Trash until you empty it, and you can bring any back from the Notes sidebar. Your topics, study cards and settings are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2.5 sm:flex-row sm:justify-end sm:space-x-0">
            <AlertDialogAction className="mt-0 min-h-11 w-full sm:w-auto" disabled={busy} onClick={(e) => { e.preventDefault(); void toTrash(); }}>{busy ? <Loader2 className="animate-spin" /> : null} Move to Trash</AlertDialogAction>
            <AlertDialogCancel className="mt-0 min-h-11 w-full sm:w-auto" disabled={busy}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={ask === "erase"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete everything for good?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes every note (and its history), topic, flashcard, quiz, result, share link and uploaded photo, recording or file from your account. It can't be undone. Your sign-in stays.</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="grid gap-1.5 text-sm">Type <b>{WORD}</b> to confirm
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" aria-label={`Type ${WORD} to confirm`} className="text-base sm:text-sm" disabled={busy} />
          </label>
          <AlertDialogFooter className="flex-col gap-2.5 sm:flex-row sm:justify-end sm:space-x-0">
            <AlertDialogAction className="mt-0 min-h-11 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto" disabled={busy || typed.trim().toUpperCase() !== WORD} onClick={(e) => { e.preventDefault(); void erase(); }}>{busy ? <Loader2 className="animate-spin" /> : null} Delete everything</AlertDialogAction>
            <AlertDialogCancel className="mt-0 min-h-11 w-full sm:w-auto" disabled={busy}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
