import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SplitPreview } from "@/components/split/SplitPreview";
import { importFromUrl, type UrlImport } from "@/lib/ai/tasks";

/** Paste a website or YouTube link: it's read, divided into notes by idea, and you choose the topic before anything is saved. */
export function UrlCapture({ kind, folderId, folderName }: { kind: "website" | "youtube"; folderId: string | null; folderName?: string }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState<UrlImport | null>(null);
  const label = kind === "youtube" ? "YouTube video" : "web page";

  async function read() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const r = await importFromUrl({ url });
      if (!r.ok) { toast.error(r.error); return; }
      setItem(r.item);
    } catch { toast.error("Couldn't read that. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <form className="paper-sheet mt-5 space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void read(); }}>
        <label className="block text-sm font-medium" htmlFor="capture-url">Paste a {label} link</label>
        <input id="capture-url" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="off"
          placeholder={kind === "youtube" ? "https://www.youtube.com/watch?v=…" : "https://…"}
          className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <p className="text-xs text-muted-foreground">
          Gemini reads the {label} and divides it into separate notes, one per idea. You'll see them and name the topic before anything is saved. This runs in the cloud, so the link's contents are sent to Google.
        </p>
        <Button type="submit" disabled={busy || !url.trim()}>{busy ? <><Loader2 className="animate-spin" /> Reading…</> : <><Sparkles /> Read and divide</>}</Button>
      </form>
      <SplitPreview open={!!item} onOpenChange={(o) => !o && setItem(null)} material={item ? { ...item, source: `[${new URL(item.url).hostname}](${item.url})`, tags: [item.kind] } : null}
        initialTopic={item?.title ?? ""} folderId={folderId} {...(folderName ? { folderName } : {})}
        onSaved={(id) => navigate({ to: "/vault/$noteId", params: { noteId: id } })} />
    </>
  );
}
