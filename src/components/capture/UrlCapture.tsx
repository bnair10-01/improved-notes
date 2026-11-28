import { Working } from "@/components/fun/Doodle";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SplitPreview } from "@/components/split/SplitPreview";
import { importFromUrl, type UrlImport } from "@/lib/ai/tasks";
import { sourceLink } from "@/lib/video";

/** Paste a website or YouTube link: it's read, divided into notes by idea, and you choose the topic before anything is saved. */
export function UrlCapture({ kind, folderId, folderName }: { kind: "website" | "youtube" | "link"; folderId: string | null; folderName?: string }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState<UrlImport | null>(null);
  const label = kind === "youtube" ? "YouTube video" : kind === "link" ? "website or YouTube video" : "web page";

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
          className="w-full rounded-lg border bg-background px-3 py-2.5 text-base outline-none sm:text-sm focus-visible:ring-2 focus-visible:ring-ring" />
        <p className="text-xs text-muted-foreground">
          Gemini reads the {label} and divides it into separate notes, one per idea. You'll see them and name the topic before anything is saved. This runs in the cloud, so the link's contents are sent to Google.
        </p>
        {busy && <Working kind={kind === "youtube" ? "video" : "globe"} quips="link" steps={kind === "youtube" ? ["Opening the video…", "Reading what is said…", "Dividing it into ideas…"] : ["Opening the page…", "Reading it…", "Dividing it into ideas…"]} />}
        <Button type="submit" disabled={busy || !url.trim()}>{busy ? <><Loader2 className="animate-spin" /> Reading…</> : <><Sparkles /> Read and divide</>}</Button>
      </form>
      <SplitPreview open={!!item} onOpenChange={(o) => !o && setItem(null)} material={item ? { ...item, source: sourceLink(item.kind, item.title, item.url), tags: [item.kind] } : null}
        initialTopic={item?.title ?? ""} folderId={folderId} {...(folderName ? { folderName } : {})}
        onSaved={(id) => navigate({ to: "/vault/$noteId", params: { noteId: id } })} />
    </>
  );
}
