import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importFromUrl } from "@/lib/ai/tasks";
import { createNote, updateNote, useRefreshVault } from "@/lib/vault";

/** Paste a website or YouTube link and get notes from it. */
export function UrlCapture({ kind, folderId }: { kind: "website" | "youtube"; folderId: string | null }) {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const label = kind === "youtube" ? "YouTube video" : "web page";

  async function run() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const r = await importFromUrl({ url });
      if (!r.ok) { toast.error(r.error); return; }
      const id = await createNote({ kind: "text", title: r.item.title, markdown: r.item.markdown, folder_id: folderId });
      await updateNote(id, { tags: [r.item.kind] });
      await refresh();
      toast.success("Notes saved");
      navigate({ to: "/vault/$noteId", params: { noteId: id } });
    } catch { toast.error("Couldn't import that. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <form className="paper-sheet mt-5 space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void run(); }}>
      <label className="block text-sm font-medium" htmlFor="capture-url">Paste a {label} link</label>
      <input id="capture-url" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="off"
        placeholder={kind === "youtube" ? "https://www.youtube.com/watch?v=…" : "https://…"}
        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <p className="text-xs text-muted-foreground">
        Gemini reads the {label} and writes notes from what it actually contains. This runs in the cloud, so the link's contents are sent to Google.
      </p>
      <Button type="submit" disabled={busy || !url.trim()}>{busy ? <><Loader2 className="animate-spin" /> Reading…</> : <><Sparkles /> Make notes</>}</Button>
    </form>
  );
}
