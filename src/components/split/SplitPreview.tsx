import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveSplit } from "@/lib/split-save";
import { excerpt } from "@/lib/topics";
import type { ParsedMaterial } from "@/lib/split";
import { useRefreshVault } from "@/lib/vault";

export type SplitMaterial = ParsedMaterial & { source?: string; tags?: string[] };

/** Shows how a piece of material will be divided, lets the person name the topic and drop parts, then saves the notes. */
export function SplitPreview({ open, onOpenChange, material, initialTopic, folderId, folderName, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; material: SplitMaterial | null; initialTopic: string;
  folderId?: string | null; folderName?: string; onSaved: (overviewId: string) => void;
}) {
  const refresh = useRefreshVault();
  const [topic, setTopic] = useState("");
  const [keep, setKeep] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && material) { setTopic(folderId && folderName ? folderName : initialTopic); setKeep(material.sections.map(() => true)); } }, [open, material, initialTopic, folderId, folderName]);

  if (!material) return null;
  const chosen = material.sections.filter((_, i) => keep[i]);
  // Keeping the topic's own name adds to that topic; typing a different name starts a new one.
  const useExisting = !!folderId && topic.trim() === folderName;

  async function save() {
    if (!material || !chosen.length || !topic.trim() || busy) return;
    setBusy(true);
    try {
      const r = await saveSplit({ topicName: topic, folderId: useExisting ? folderId! : null, overview: material.overview, sections: chosen, ...(material.source ? { source: material.source } : {}), ...(material.tags ? { tags: material.tags } : {}) });
      await refresh();
      toast.success(`Saved ${r.ids.length} notes in “${topic.trim()}”`);
      onOpenChange(false);
      onSaved(r.overviewId);
    } catch { toast.error("Couldn't save the notes. Nothing was lost; please try again."); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split into {material.sections.length} notes</DialogTitle>
          <DialogDescription>Each idea gets its own note, linked together under one topic. Name the topic and untick anything you don't want.</DialogDescription>
        </DialogHeader>
        <label className="block text-sm font-medium">Topic
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} aria-label="Topic name" className="mt-1" />
        </label>
        {material.overview && <p className="rounded-lg border bg-card/50 p-2.5 text-sm text-muted-foreground"><span className="font-mono text-[10px] uppercase tracking-[0.1em]">Overview </span>{material.overview}</p>}
        <ul className="space-y-1.5" aria-label="Notes to create">
          {material.sections.map((s, i) => (
            <li key={`${s.title}-${i}`} className="flex items-start gap-2 rounded-lg border p-2.5">
              <input type="checkbox" className="mt-1" checked={keep[i] ?? false} onChange={(e) => setKeep((k) => k.map((v, j) => (j === i ? e.target.checked : v)))} aria-label={`Include ${s.title}`} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{s.title}</span><span className="line-clamp-2 text-xs text-muted-foreground">{excerpt(s.markdown, 140)}</span></span>
            </li>
          ))}
        </ul>
        <Button onClick={() => void save()} disabled={busy || !chosen.length || !topic.trim()}>{busy ? <><Loader2 className="animate-spin" /> Saving…</> : `Save ${chosen.length + 1} notes (overview + ${chosen.length})`}</Button>
      </DialogContent>
    </Dialog>
  );
}
