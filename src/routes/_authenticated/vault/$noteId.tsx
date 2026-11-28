import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Folder, Loader2, Network, Pin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MarkdownEditor } from "@/components/vault/MarkdownEditor";
import { remarkUncertain } from "@/lib/remark-uncertain";
import { remarkHighlight } from "@/lib/remark-highlight";
import { mentionsTitle, wikilinksToMarkdown } from "@/lib/wikilinks";
import { addLink, createNote, purgeNote, deleteLink, findByTitle, linkMention, neighborhood, openTarget, renameNote, syncWikilinks, updateNote, useRefreshVault, useVault, vaultQuery } from "@/lib/vault";
import { useQueryClient } from "@tanstack/react-query";
import { GenerateDialog } from "@/components/study/GenerateDialog";
import { StudyPanel } from "@/components/study/StudyPanel";
import { ReadAloud } from "@/components/shell/ReadAloud";
import { VersionHistory } from "@/components/vault/VersionHistory";
import { classifyRemote, conflictCopyTitle } from "@/lib/conflict";
import { NoteShareMenu } from "@/components/learner/NoteShareMenu";
import { InsightColumn } from "@/components/vault/InsightColumn";
import { NoteTools } from "@/components/vault/NoteTools";
import { NoteVideo, seekVideo } from "@/components/vault/NoteVideo";
import { Hint } from "@/components/shell/Hint";
import { LocalGraph } from "@/components/vault/LocalGraph";
import { NoteMindMap } from "@/components/vault/NoteMindMap";
import { appendMyNote, linkSeconds, sourceVideos, videoId } from "@/lib/video";
import { TopicSuggestion } from "@/components/vault/TopicSuggestion";
import { ResizableInsight } from "@/components/vault/ResizableInsight";
import { useIsMobile } from "@/hooks/use-mobile";
import { InferenceBadge } from "@/components/shell/InferenceBadge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ModelNotePanel } from "@/components/model3d/ModelNotePanel";
import { NewModelDialog } from "@/components/model3d/NewModelDialog";
import { parseModelEmbeds } from "@/lib/model3d";

const SlidesView = lazy(() => import("@/components/slides/SlidesView"));
const AudioView = lazy(() => import("@/components/audio/AudioView"));
const ModelEmbed = lazy(() => import("@/components/model3d/ModelEmbed"));

export const Route = createFileRoute("/_authenticated/vault/$noteId")({
  head: () => ({
    meta: [
      { title: "Note — Improved Notes" },
      { name: "description", content: "Write and link a note in your Improved Notes vault." },
      { property: "og:title", content: "Note — Improved Notes" },
      { property: "og:description", content: "Write and link a note in your Improved Notes vault." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotePage,
});

function NotePage() {
  const { noteId } = Route.useParams();
  return <NoteEditor key={noteId} noteId={noteId} />;
}

function NoteEditor({ noteId }: { noteId: string }) {
  const { data: vault } = useVault();
  const qc = useQueryClient();
  const refresh = useRefreshVault();
  const navigate = useNavigate();
  const note = vault?.notes.find((n) => n.id === noteId);
  const [title, setTitle] = useState(note?.title ?? "");
  const [md, setMd] = useState(note?.markdown ?? "");
  const [tab, setTab] = useState(note && !note.markdown ? "edit" : "preview");
  const [status, setStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const [mapSignal, setMapSignal] = useState(0);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [focusEnd, setFocusEnd] = useState(false);
  const isMobile = useIsMobile();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTitle = useRef(note?.title ?? "");
  const baseRev = useRef(note?.rev ?? 0);
  const seeded = useRef(!!note);
  const conflictRef = useRef(false);
  const [conflict, setConflict] = useState<{ title: string; markdown: string; rev: number } | null>(null);

  // Changes made on another device arrive live. Apply them if there's nothing unsaved,
  // otherwise ask, so nobody's writing is silently overwritten.
  useEffect(() => {
    if (!note) return;
    if (!seeded.current) {
      seeded.current = true; baseRev.current = note.rev ?? 0;
      setMd(note.markdown); setTitle(note.title); savedTitle.current = note.title; setTab(note.markdown ? "preview" : "edit");
      return;
    }
    const kind = classifyRemote({ remoteRev: note.rev ?? 0, remoteEditor: note.last_editor, baseRev: baseRev.current, dirty: status !== "saved" });
    if (kind === "own") baseRev.current = note.rev ?? 0;
    else if (kind === "apply") {
      baseRev.current = note.rev ?? 0;
      setMd(note.markdown); setTitle(note.title); savedTitle.current = note.title;
    } else if (kind === "conflict") { conflictRef.current = true; setConflict({ title: note.title, markdown: note.markdown, rev: note.rev ?? 0 }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.rev, note?.last_editor]);

  function takeTheirs() {
    if (!conflict) return;
    if (timer.current) clearTimeout(timer.current);
    baseRev.current = conflict.rev; conflictRef.current = false;
    setMd(conflict.markdown); setTitle(conflict.title); savedTitle.current = conflict.title; setStatus("saved"); setConflict(null);
  }
  function keepMine() {
    if (!conflict) return;
    baseRev.current = conflict.rev; conflictRef.current = false; setConflict(null); scheduleSave(md);
  }
  async function keepBoth() {
    try { await createNote({ title: conflictCopyTitle(title), markdown: md }); toast.success("Your version was saved as a separate note."); takeTheirs(); }
    catch { toast.error("Couldn't save a copy. Nothing was changed."); }
  }

  useEffect(() => { if (note && note.kind === "handwritten") navigate({ ...openTarget(note), replace: true }); }, [note, navigate]);

  function scheduleSave(nextMd: string) {
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (conflictRef.current) return; // wait for the person to choose
      setStatus("saving");
      try {
        await updateNote(noteId, { markdown: nextMd });
        const fresh = await qc.fetchQuery({ ...vaultQuery, staleTime: 0 });
        await syncWikilinks(fresh, noteId, nextMd);
        await refresh();
        setStatus("saved");
      } catch { setStatus("dirty"); toast.error("Couldn't save. Your text is kept — keep typing to retry."); }
    }, 900);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Leaving a page you never wrote on, titled or filed shouldn't leave an empty "Untitled" behind.
  const draft = useRef({ note, md, title });
  draft.current = { note, md, title };
  useEffect(() => () => {
    const { note: n, md: text, title: t } = draft.current;
    if (!n || n.kind !== "text" || text.trim() || t.trim() !== "Untitled" || n.folder_id || n.tags.length || n.source_note_ids.length || n.pinned) return;
    void updateNote(noteId, { deleted_at: new Date().toISOString() }).then(() => purgeNote(noteId)).catch(() => undefined);
  }, [noteId]);

  async function commitTitle() {
    const t = title.trim() || "Untitled";
    if (!vault || t === savedTitle.current) return;
    const clash = findByTitle(vault, t);
    if (clash && clash.id !== noteId) { toast.error("Another note already has that title."); setTitle(savedTitle.current); return; }
    await renameNote(vault, noteId, savedTitle.current, t);
    savedTitle.current = t;
    await refresh();
  }

  if (!vault) return null;
  if (!note) return <p className="p-8 text-muted-foreground">This note doesn't exist or was deleted.</p>;

  const live = vault.notes.filter((n) => !n.deleted_at);
  const backlinks = vault.links.filter((l) => l.to_note_id === noteId).map((l) => ({ l, n: live.find((x) => x.id === l.from_note_id) })).filter((x) => x.n);
  const linkedIds = new Set(vault.links.flatMap((l) => (l.to_note_id === noteId ? [l.from_note_id] : l.from_note_id === noteId ? [l.to_note_id] : [])));
  const mentions = live.filter((n) => n.id !== noteId && !linkedIds.has(n.id) && mentionsTitle(n.markdown, note.title));
  const folder = vault.folders.find((f) => f.id === note.folder_id);

  async function openWiki(t: string) {
    const hit = findByTitle(vault!, t);
    const id = hit ? hit.id : await createNote({ title: t });
    if (!hit) await refresh();
    navigate(hit ? openTarget(hit) : { to: "/vault/$noteId", params: { noteId: id } });
  }

  const videos = sourceVideos(md);
  const addVideoNote = (id: string, seconds: number) => { const next = appendMyNote(md, id, seconds); setMd(next); scheduleSave(next); setTab("edit"); setFocusEnd(true); };

  const words = md.trim() ? md.trim().split(/\s+/).length : 0;
  const insight = <InsightColumn note={note} vault={vault} markdown={md} onOpenGraph={() => { setMapSignal((n) => n + 1); setInsightOpen(false); }} />;

  return (
    <div className="fold-split flex min-h-0 min-w-0 flex-1">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-5 sm:py-5">
        {conflict && (
          <div role="alert" className="mb-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">This note was changed on another device while you were editing.</p>
            <p className="mt-0.5 text-muted-foreground">Nothing has been overwritten. Choose what to keep.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={keepMine}>Keep mine</Button>
              <Button size="sm" variant="outline" onClick={takeTheirs}>Take theirs</Button>
              <Button size="sm" variant="outline" onClick={keepBoth}>Keep both</Button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Title"
            className="h-auto min-w-0 flex-1 border-transparent bg-transparent px-0 font-serif text-2xl font-semibold shadow-none focus-visible:border-input focus-visible:px-2 md:text-2xl" />
          <span className="whitespace-nowrap text-xs text-muted-foreground" aria-live="polite">{status === "saving" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : status === "saved" ? <><Check className="inline h-3 w-3" /> Saved</> : "Editing…"}</span>
          <Button variant="ghost" size="icon" aria-label={note.pinned ? "Unpin" : "Pin"} onClick={async () => { await updateNote(noteId, { pinned: !note.pinned }); await refresh(); }}><Pin className={note.pinned ? "fill-current text-primary" : ""} /></Button>
          <VersionHistory noteId={noteId} title={title} markdown={md} onRestored={(v) => { setMd(v.markdown); setTitle(v.title); savedTitle.current = v.title; setStatus("saved"); }} />
          <NoteShareMenu noteId={noteId} title={title} markdown={md} />
          <Button variant="ghost" size="icon" aria-label="Move to Trash" onClick={() => setConfirmTrash(true)}><Trash2 /></Button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border px-2 py-0.5 capitalize">{note.kind}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="flex items-center gap-1 rounded-full border px-2 py-0.5"><Folder className="h-3 w-3" />{folder?.name ?? "No folder"}</button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={async () => { await updateNote(noteId, { folder_id: null }); await refresh(); }}>No folder</DropdownMenuItem>
              {vault.folders.map((f) => <DropdownMenuItem key={f.id} onClick={async () => { await updateNote(noteId, { folder_id: f.id }); await refresh(); }}>{f.name}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <GenerateDialog noteIds={[noteId]} trigger={<button className="flex items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-primary">✦ Generate</button>} />
          {note.kind !== "model3d" && <button onClick={() => setModelOpen(true)} className="flex items-center gap-1 rounded-full border px-2 py-0.5">◇ 3D model</button>}
          <Input defaultValue={note.tags.join(", ")} placeholder="Add tags, comma separated" aria-label="Tags" className="h-6 w-full min-w-0 rounded-full sm:w-56 px-2 text-xs"
            onBlur={async (e) => { const tags = [...new Set(e.target.value.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean))]; if (tags.join() !== note.tags.join()) { await updateNote(noteId, { tags }); await refresh(); } }} />
        </div>

        <NoteTools note={note} markdown={md} />
        <TopicSuggestion note={note} vault={vault} markdown={md} />
        {videos.length > 0 && <><NoteVideo videos={videos} onAddNote={addVideoNote} /><div className="mt-2"><Hint id="video">Pause the video and press “Add my note at this moment” to stamp your own note with the time. A timestamp link in the note jumps back to it.</Hint></div></>}
        {note.kind === "model3d" && <div className="mt-4"><ModelNotePanel noteId={noteId} /></div>}
        {(note.kind === "slides" || note.kind === "audio") && (
          <div className="mt-4">
            <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                {note.kind === "slides"
                  ? <SlidesView noteId={noteId} markdown={md} onMarkdownChange={(v) => { setMd(v); scheduleSave(v); }} />
                  : <AudioView noteId={noteId} markdown={md} onMarkdownChange={(v) => { setMd(v); scheduleSave(v); }} />}
              </Suspense>
            </ClientOnly>
          </div>
        )}
        <div className="paper-sheet mt-4 overflow-hidden">
          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <div className="border-b px-2 py-1.5"><TabsList><TabsTrigger value="preview">Read</TabsTrigger><TabsTrigger value="edit">Edit</TabsTrigger></TabsList></div>
            <TabsContent value="preview" className={`m-0 px-5 py-4 ${note.kind === "generated" ? "" : "min-h-[45vh]"}`}>
              <div className="mb-3"><ReadAloud text={md} /></div>
              <article className="transcript">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkUncertain, remarkHighlight]}
                  components={{ a: ({ href, children }) => href?.startsWith("#wl:")
                    ? <a href={href} className="wikilink" onClick={(e) => { e.preventDefault(); void openWiki(decodeURIComponent(href.slice(4))); }}>{children}</a>
                    : videos.some((v) => v.id === videoId(href ?? ""))
                      ? <a href={href} onClick={(e) => { e.preventDefault(); seekVideo(videoId(href!)!, linkSeconds(href!)); }} title="Play from here">{children}</a>
                      : <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>
                  {wikilinksToMarkdown(md)}
                </ReactMarkdown>
                {parseModelEmbeds(md).map((m) => (
                  <ClientOnly key={m.start}><Suspense fallback={null}><div className="not-prose my-4"><ModelEmbed title={m.title} /></div></Suspense></ClientOnly>
                ))}
                {!md.trim() && <p className="text-muted-foreground">Empty — switch to Edit to start writing.</p>}
              </article>
            </TabsContent>
            <TabsContent value="edit" className="m-0 h-[55vh]">
              <MarkdownEditor value={md} notes={live} focusEnd={focusEnd} onFocusedEnd={() => setFocusEnd(false)} ink={note.ink} onInkChange={(v) => { void updateNote(noteId, { ink: v }); }} onChange={(v) => { setMd(v); scheduleSave(v); }} />
            </TabsContent>
          </Tabs>
        </div>

        {note.kind === "generated" && <StudyPanel noteId={noteId} sourceIds={note.source_note_ids} />}

        <div data-distraction className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className="min-w-0">
            <h2 className="mb-1.5 text-sm font-semibold">Backlinks ({backlinks.length})</h2>
            {backlinks.map(({ l, n }) => <button key={l.id} onClick={() => navigate(openTarget(n!))} className="block w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-secondary">← {n!.title}</button>)}
            {!backlinks.length && <p className="text-sm text-muted-foreground">No notes link here yet.</p>}
          </section>
          <section className="min-w-0">
            <h2 className="mb-1.5 text-sm font-semibold">Unlinked mentions ({mentions.length})</h2>
            {mentions.map((n) => (
              <div key={n.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
                <button className="flex-1 truncate text-left hover:underline" onClick={() => navigate(openTarget(n))}>{n.title}</button>
                <Button size="sm" variant="outline" className="h-7" onClick={async () => { await linkMention(n, note.title); const fresh = await qc.fetchQuery({ ...vaultQuery, staleTime: 0 }); const nn = fresh.notes.find((x) => x.id === n.id); if (nn) await syncWikilinks(fresh, n.id, nn.markdown); await refresh(); toast.success("Linked"); }}>Link</Button>
              </div>
            ))}
            {!mentions.length && <p className="text-sm text-muted-foreground">No other note mentions "{note.title}".</p>}
          </section>
        </div>

        <NoteMindMap noteId={noteId} title={note.title} markdown={md} signal={mapSignal} />
        <LocalGraph noteId={noteId} />
      </div>

      <NewModelDialog open={modelOpen} onOpenChange={setModelOpen} sourceNote={{ id: noteId, title, markdown: md, folderId: note.folder_id }} />
      <AlertDialog open={confirmTrash} onOpenChange={setConfirmTrash}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Move "{note.title}" to Trash?</AlertDialogTitle><AlertDialogDescription>You can restore it from Trash for 30 days.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={async () => { await updateNote(noteId, { deleted_at: new Date().toISOString() }); await refresh(); navigate({ to: "/vault" }); toast("Moved to Trash"); }}>Move to Trash</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    <div data-distraction className="flex h-7 shrink-0 items-center gap-4 border-t px-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" role="status">
      <span>{status === "saved" ? "✓ Saved" : status === "saving" ? "Saving…" : "Editing…"}</span>
      <span>{backlinks.length} {backlinks.length === 1 ? "backlink" : "backlinks"}</span>
      <span>{words} {words === 1 ? "word" : "words"}</span>
      <InferenceBadge className="ml-auto" />
    </div>
    </div>
    <ResizableInsight>{insight}</ResizableInsight>
    <button onClick={() => setInsightOpen(true)} aria-label="Ask or open Insight" data-distraction
      className="fixed bottom-[calc(var(--tabbar)+0.75rem)] right-4 z-20 flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg md:hidden">✦ Ask</button>
    <Sheet open={insightOpen} onOpenChange={setInsightOpen}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={isMobile ? "max-h-[85dvh] overflow-y-auto rounded-t-2xl p-0" : "w-[min(92vw,380px)] overflow-y-auto p-0"}><SheetTitle className="sr-only">Insight</SheetTitle>{insight}</SheetContent>
    </Sheet>
    </div>
  );
}
