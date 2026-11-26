import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadBlob, sanitizeFilename } from "@/lib/export";
import { exportPdf } from "@/lib/pdf";
import { createShareLink, setShareEnabled, useShareLinks } from "@/lib/sharing";

export function NoteShareMenu({ noteId, title, markdown }: { noteId: string; title: string; markdown: string }) {
  const links = useShareLinks();
  const link = links.data?.find((item) => item.note_id === noteId);
  const client = useQueryClient();
  const content = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const setMessage = (m: string) => { if (m) toast(m); };
  const [copyUrl, setCopyUrl] = useState("");
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await action(); }
    catch { setMessage("That didn't work. Please try again."); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    const token = link?.enabled ? link.token : await createShareLink(noteId);
    const url = `${window.location.origin}/s/${encodeURIComponent(token)}`;
    setCopyUrl(url);
    await client.invalidateQueries({ queryKey: ["share-links"] });
    try { await navigator.clipboard.writeText(url); setMessage("Link copied. Anyone with it can read this note."); }
    catch { setMessage(`Link ready: ${url}`); }
  };
  return <div className="shrink-0">
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Share and export" disabled={busy}><Share2 /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Share links are unlisted: anyone with the link can read this note.</p>
        <DropdownMenuItem onSelect={() => downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${sanitizeFilename(title)}.md`)}>Download .md</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { if (!exportPdf(title, content.current?.innerHTML ?? "")) setMessage("Please allow pop-ups to print or save a PDF."); }}>Download PDF</DropdownMenuItem>
        <DropdownMenuItem disabled={!links.isSuccess || busy} onSelect={() => void run(copy)}>{link?.enabled ? "Copy read-only share link" : "Create / enable share link"}</DropdownMenuItem>
        {link && <DropdownMenuItem disabled={busy} onSelect={() => void run(async () => {
          await setShareEnabled(link.token, !link.enabled);
          await client.invalidateQueries({ queryKey: ["share-links"] });
          setMessage(link.enabled ? "Share link is off." : "Share link is on.");
          if (link.enabled) setCopyUrl("");
        })}>{link.enabled ? "Turn link off" : "Turn link on"}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    <div hidden aria-hidden="true" ref={content}><Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown></div>
  </div>;
}
