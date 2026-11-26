import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SplitPreview, type SplitMaterial } from "./SplitPreview";
import { sectioniseNote } from "@/lib/ai/tasks";
import { SPLIT_EVENT } from "@/lib/split-events";
import { useVault } from "@/lib/vault";

/** Listens for "split this note", reads it with the AI, and shows the preview. Mounted once for the whole app. */
export function SplitHost() {
  const { data: vault } = useVault();
  const navigate = useNavigate();
  const latest = useRef(vault);
  latest.current = vault;
  const [job, setJob] = useState<{ noteId: string; title: string; folderId: string | null; material: SplitMaterial } | null>(null);

  useEffect(() => {
    const on = async (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const note = latest.current?.notes.find((n) => n.id === id);
      if (!note) { toast.error("Couldn't find that note."); return; }
      const t = toast.loading("Reading your note to find its separate ideas…");
      try {
        const r = await sectioniseNote({ title: note.title, markdown: note.markdown });
        toast.dismiss(t);
        if (!r.ok) { toast.error(r.error); return; }
        setJob({ noteId: id, title: note.title, folderId: note.folder_id, material: { ...r.result, source: `[[${note.title}]]` } });
      } catch { toast.dismiss(t); toast.error("Couldn't split that note. Please try again."); }
    };
    window.addEventListener(SPLIT_EVENT, on);
    return () => window.removeEventListener(SPLIT_EVENT, on);
  }, []);

  const folderName = job?.folderId ? vault?.folders.find((f) => f.id === job.folderId)?.name : undefined;
  return (
    <SplitPreview open={!!job} onOpenChange={(o) => !o && setJob(null)} material={job?.material ?? null} initialTopic={job?.title ?? ""}
      folderId={job?.folderId ?? null} {...(folderName ? { folderName } : {})}
      onSaved={(id) => navigate({ to: "/vault/$noteId", params: { noteId: id } })} />
  );
}
