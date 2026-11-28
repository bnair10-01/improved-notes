import { useState } from "react";
import { Pencil, Pin, PinOff, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RenameDialog } from "@/components/shell/RenameDialog";
import type { MenuAction } from "@/components/shell/ItemMenu";
import { openResearch } from "@/lib/dialogs";
import { removeTopic, renameFolder, renameNote, updateNote, useRefreshVault, useVault, type VFolder, type VNote } from "@/lib/vault";

/**
 * What you can do to a note from any list: rename it (links in other notes follow), pin it, research more about it, or move it
 * to Trash, with an Undo. The same set appears on the Notes list, in a topic, and in the sidebar, in every build.
 */
export function useNoteActions() {
  const { data: vault } = useVault();
  const refresh = useRefreshVault();
  const [renaming, setRenaming] = useState<VNote | null>(null);

  async function trash(n: VNote) {
    try {
      await updateNote(n.id, { deleted_at: new Date().toISOString() });
      await refresh();
      toast("Moved to Trash", { action: { label: "Undo", onClick: () => void updateNote(n.id, { deleted_at: null }).then(refresh) } });
    } catch { toast.error("Couldn't delete that. Please try again."); }
  }
  const actions = (n: VNote): MenuAction[] => [
    { label: "Rename", icon: <Pencil className="h-4 w-4" />, onSelect: () => setRenaming(n) },
    { label: n.pinned ? "Unpin" : "Pin", icon: n.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />, onSelect: async () => { await updateNote(n.id, { pinned: !n.pinned }); await refresh(); } },
    { label: "Research more", icon: <Search className="h-4 w-4" />, onSelect: () => openResearch({ subject: n.title || "", folderId: n.folder_id }) },
    { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => trash(n) },
  ];
  const dialogs = (
    <RenameDialog open={!!renaming} what="note" initial={renaming?.title ?? ""} onClose={() => setRenaming(null)}
      onSave={async (name) => { if (!vault || !renaming) return; try { await renameNote(vault, renaming.id, renaming.title, name); await refresh(); toast.success("Renamed"); } catch { toast.error("Couldn't rename that."); throw new Error("rename failed"); } }} />
  );
  return { actions, trash, rename: setRenaming, dialogs };
}

/** What you can do to a topic: rename, research it, or delete it, choosing whether its notes stay or go to Trash. */
export function useTopicActions(opts: { onDeleted?: () => void } = {}) {
  const { data: vault } = useVault();
  const refresh = useRefreshVault();
  const [renaming, setRenaming] = useState<VFolder | null>(null);
  const [deleting, setDeleting] = useState<VFolder | null>(null);
  const count = (f: VFolder) => (vault?.notes ?? []).filter((n) => !n.deleted_at && n.folder_id === f.id).length;

  async function remove(f: VFolder, withNotes: boolean) {
    setDeleting(null);
    try { await removeTopic(f.id, withNotes); await refresh(); toast.success(withNotes ? "Topic deleted. Its notes are in Trash." : "Topic deleted. Its notes were kept."); opts.onDeleted?.(); }
    catch { toast.error("Couldn't delete that topic. Please try again."); }
  }
  const actions = (f: VFolder): MenuAction[] => [
    { label: "Rename", icon: <Pencil className="h-4 w-4" />, onSelect: () => setRenaming(f) },
    { label: "Research this topic", icon: <Search className="h-4 w-4" />, onSelect: () => openResearch({ subject: f.name, folderId: f.id }) },
    { label: "Delete topic", icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => setDeleting(f) },
  ];
  const n = deleting ? count(deleting) : 0;
  const dialogs = (
    <>
      <RenameDialog open={!!renaming} what="topic" initial={renaming?.name ?? ""} onClose={() => setRenaming(null)}
        onSave={async (name) => { if (!renaming) return; try { await renameFolder(renaming.id, name); await refresh(); toast.success("Renamed"); } catch { toast.error("Couldn't rename that."); throw new Error("rename failed"); } }} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the topic “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>{n ? `It has ${n} note${n === 1 ? "" : "s"}. Choose what happens to ${n === 1 ? "it" : "them"}.` : "It's empty, so nothing else changes."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2.5 sm:flex-row sm:justify-end sm:space-x-0">
            <AlertDialogAction className="mt-0 min-h-11 w-full sm:w-auto" onClick={() => deleting && void remove(deleting, false)}>{n ? "Delete topic, keep notes" : "Delete topic"}</AlertDialogAction>
            {n > 0 && <AlertDialogAction className="mt-0 min-h-11 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto" onClick={() => deleting && void remove(deleting, true)}>Delete topic and its notes</AlertDialogAction>}
            <AlertDialogCancel className="mt-0 min-h-11 w-full sm:w-auto">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
  return { actions, dialogs, rename: setRenaming };
}
