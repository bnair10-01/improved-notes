import { useEffect, useRef, useState } from "react";
import { Folder, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { suggestTopicName } from "@/lib/ai/tasks";
import { bestExistingTopic, dismissSuggestion, hasEnoughToSuggest, isDismissed } from "@/lib/topic-suggest";
import { createFolder, updateNote, useRefreshVault, type Vault, type VNote } from "@/lib/vault";

type Suggestion = { name: string; folderId: string | null };

/**
 * A note with no topic gets a quiet suggestion, based on what it says: an existing topic it fits, or a new one named
 * from its content. Nothing is filed until the person says yes.
 */
export function TopicSuggestion({ note, vault, markdown }: { note: VNote; vault: Vault; markdown: string }) {
  const refresh = useRefreshVault();
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const asked = useRef(new Set<string>());
  const latest = useRef({ note, vault, markdown });
  latest.current = { note, vault, markdown };

  const eligible = !note.folder_id && !gone && !isDismissed(note.id) && hasEnoughToSuggest({ markdown });
  useEffect(() => {
    if (!eligible) { setSug(null); return; }
    const t = setTimeout(async () => {
      const { note: n, vault: v, markdown: md } = latest.current;
      const live = v.notes.filter((x) => !x.deleted_at);
      const local = bestExistingTopic({ ...n, markdown: md }, live, v.folders);
      if (local) { setSug({ name: local.name, folderId: local.folderId }); return; }
      if (asked.current.has(n.id) || (typeof navigator !== "undefined" && !navigator.onLine)) return;
      asked.current.add(n.id);
      const r = await suggestTopicName({ title: n.title, markdown: md, topics: v.folders.filter((f) => !f.parent_id).map((f) => f.name) });
      if (r.ok) setSug({ name: r.topic, folderId: r.existing ? v.folders.find((f) => f.name.toLowerCase() === r.topic.toLowerCase())?.id ?? null : null });
    }, 2500);
    return () => clearTimeout(t);
  }, [eligible, note.id, markdown.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!eligible || !sug) return null;

  async function accept() {
    if (!sug) return;
    setBusy(true);
    try {
      const id = sug.folderId ?? (await createFolder(sug.name));
      await updateNote(note.id, { folder_id: id });
      await refresh();
      toast.success(`Added to “${sug.name}”`);
      setGone(true);
    } catch { toast.error("Couldn't file that. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div role="status" data-topic-suggestion className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
      <Folder className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground">Looks like it belongs in</span>
      <strong className="font-medium">{sug.name}</strong>
      {!sug.folderId && <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">new topic</span>}
      <span className="ml-auto flex gap-1.5">
        <button onClick={() => void accept()} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background disabled:opacity-60">{busy && <Loader2 className="h-3 w-3 animate-spin" />}{sug.folderId ? "Add to topic" : "Create topic and add"}</button>
        <button onClick={() => { dismissSuggestion(note.id); setGone(true); }} className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary">Not now</button>
      </span>
    </div>
  );
}
