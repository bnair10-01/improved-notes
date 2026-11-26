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
import { mentionsTitle, wikilinksToMarkdown } from "@/lib/wikilinks";
import { addLink, createNote, deleteLink, findByTitle, linkMention, neighborhood, openTarget, renameNote, syncWikilinks, updateNote, useRefreshVault, useVault, vaultQuery } from "@/lib/vault";
import { useQueryClient } from "@tanstack/react-query";
import { GenerateDialog } from "@/components/study/GenerateDialog";
import { StudyPanel } from "@/components/study/StudyPanel";
import { ReadAloud } from "@/components/shell/ReadAloud";
import { NoteShareMenu } from "@/components/learner/NoteShareMenu";
import { ModelNotePanel } from "@/components/model3d/ModelNotePanel";
import { NewModelDialog } from "@/components/model3d/NewModelDialog";
import { parseModelEmbeds } from "@/lib/model3d";

const VaultGraph = lazy(() => import("@/components/vault/VaultGraph"));
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
  const [depth, setDepth] = useState(1);
  const [showGraph, setShowGraph] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTitle = useRef(note?.title ?? "");

  useEffect(() => { if (note && note.kind === "handwritten") navigate({ ...openTarget(note), replace: true }); }, [note, navigate]);

  function scheduleSave(nextMd: string) {
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
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
  const near = neighborhood(vault, noteId, depth);
  const folder = vault.folders.find((f) => f.id === note.folder_id);

  async function openWiki(t: string) {
    const hit = findByTitle(vault!, t);
    const id = hit ? hit.id : await createNote({ title: t });
    if (!hit) await refresh();
    navigate(hit ? openTarget(hit) : { to: "/vault/$noteId", params: { noteId: id } });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-5 sm:py-5">
        <div className="flex items-center gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Title"
            className="h-auto min-w-0 flex-1 border-transparent bg-transparent px-0 font-serif text-2xl font-semibold shadow-none focus-visible:border-input focus-visible:px-2 md:text-2xl" />
          <span className="whitespace-nowrap text-xs text-muted-foreground" aria-live="polite">{status === "saving" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : status === "saved" ? <><Check className="inline h-3 w-3" /> Saved</> : "Editing…"}</span>
          <Button variant="ghost" size="icon" aria-label={note.pinned ? "Unpin" : "Pin"} onClick={async () => { await updateNote(noteId, { pinned: !note.pinned }); await refresh(); }}><Pin className={note.pinned ? "fill-current text-primary" : ""} /></Button>
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
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkUncertain]}
                  components={{ a: ({ href, children }) => href?.startsWith("#wl:")
                    ? <a href={href} className="wikilink" onClick={(e) => { e.preventDefault(); void openWiki(decodeURIComponent(href.slice(4))); }}>{children}</a>
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
              <MarkdownEditor value={md} notes={live} onChange={(v) => { setMd(v); scheduleSave(v); }} />
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

        <section data-distraction className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowGraph(!showGraph)}><Network /> {showGraph ? "Hide" : "Show"} local graph</Button>
            {showGraph && <div className="flex items-center gap-1 text-xs text-muted-foreground">Depth {[1, 2, 3].map((d) => <button key={d} onClick={() => setDepth(d)} className={`h-6 w-6 rounded-md border ${depth === d ? "border-primary bg-primary text-primary-foreground" : ""}`}>{d}</button>)}</div>}
          </div>
          {showGraph && (
            <div className="paper-sheet h-80 overflow-hidden">
              <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <VaultGraph notes={live.filter((n) => near.has(n.id))} links={vault.links} focusId={noteId}
                    onOpen={(n) => navigate(openTarget(n))}
                    onConnect={async (a, b) => { await addLink(a, b); await refresh(); }}
                    onDeleteLink={async (id) => { await deleteLink(id); await refresh(); }}
                    onDeleteNote={async (n) => { await updateNote(n.id, { deleted_at: new Date().toISOString() }); await refresh(); }} />
                </Suspense>
              </ClientOnly>
            </div>
          )}
        </section>
      </div>

      <NewModelDialog open={modelOpen} onOpenChange={setModelOpen} sourceNote={{ id: noteId, title, markdown: md }} />
      <AlertDialog open={confirmTrash} onOpenChange={setConfirmTrash}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Move "{note.title}" to Trash?</AlertDialogTitle><AlertDialogDescription>You can restore it from Trash for 30 days.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={async () => { await updateNote(noteId, { deleted_at: new Date().toISOString() }); await refresh(); navigate({ to: "/vault" }); toast("Moved to Trash"); }}>Move to Trash</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
