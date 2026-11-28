import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Search } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AddPopover } from "@/components/shell/AddMenu";
import { ItemMenu } from "@/components/shell/ItemMenu";
import { useNoteActions, useTopicActions } from "@/components/vault/itemActions";
import { openResearch } from "@/lib/dialogs";
import { TopicInsight } from "@/components/topics/TopicInsight";
import { excerpt, itemKind, type ItemKind } from "@/lib/topics";
import { openTarget, useVault } from "@/lib/vault";

export const Route = createFileRoute("/_authenticated/topics/$folderId/")({
  head: () => ({ meta: [{ title: "Topic — Improved Notes" }] }),
  component: TopicPage,
});

const mono = "font-mono text-[10px] tracking-[0.08em] text-muted-foreground";

function TopicPage() {
  const { folderId } = Route.useParams();
  const { data: vault, isLoading } = useVault();
  const [filter, setFilter] = useState<ItemKind | "ALL">("ALL");
  const navigate = useNavigate();
  const item = useNoteActions();
  const topic = useTopicActions({ onDeleted: () => navigate({ to: "/topics" }) });
  const folder = vault?.folders.find((f) => f.id === folderId);
  const notes = useMemo(() => (vault?.notes ?? []).filter((n) => !n.deleted_at && n.folder_id === folderId).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [vault, folderId]);
  const counts = useMemo(() => { const c = new Map<ItemKind, number>(); for (const n of notes) { const k = itemKind(n); c.set(k, (c.get(k) ?? 0) + 1); } return c; }, [notes]);

  if (isLoading || !vault) return <div className="min-h-screen"><AppHeader /><div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></div>;
  if (!folder) return <div className="min-h-screen"><AppHeader /><p className="p-8 text-muted-foreground">This topic doesn't exist. <Link to="/topics" className="underline">See all topics</Link></p></div>;
  const shown = filter === "ALL" ? notes : notes.filter((n) => itemKind(n) === filter);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto grid max-w-[1400px] gap-0 lg:grid-cols-[minmax(0,1fr)_368px]">
        <main className="min-w-0 px-4 pb-28 pt-5 sm:px-8 sm:pb-24 lg:px-12 lg:pt-10">
          <Link to="/topics" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Topics</Link>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <h1 className="min-w-0 break-words font-serif text-3xl font-normal leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-5xl">{folder.name}</h1>
            <div className="flex shrink-0 items-center gap-1.5">
              <AddPopover folderId={folderId}><button className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"><Plus className="h-4 w-4" /> Add<span className="hidden min-[400px]:inline"> to topic</span></button></AddPopover>
              <button type="button" onClick={() => openResearch({ subject: folder.name, folderId })} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-secondary" data-research-topic><Search className="h-4 w-4" /> <span className="hidden min-[400px]:inline">Research more</span></button>
              <ItemMenu label={`Topic ${folder.name} options`} actions={topic.actions(folder)} />
            </div>
          </div>
          <div role="tablist" aria-label="Filter by type" className="mt-5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {(["ALL", ...counts.keys()] as (ItemKind | "ALL")[]).map((k) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${filter === k ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {k === "ALL" ? `All ${notes.length}` : `${k.charAt(0)}${k.slice(1).toLowerCase()} ${counts.get(k)}`}
              </button>
            ))}
          </div>
          {!notes.length ? (
            <div className="mt-8 rounded-xl border border-dashed p-10 text-center">
              <p className="font-serif text-xl">Nothing in this topic yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Scans, notes, websites, lectures and slides you add here end up in one place.</p>
              <AddPopover folderId={folderId} align="center"><button className="mt-4 inline-block rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background">Add something</button></AddPopover>
            </div>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((n) => (
                <li key={n.id} className="relative min-w-0">
                  <Link {...openTarget(n)} className="flex h-full min-h-36 min-w-0 flex-col gap-2 rounded-xl border p-3.5 pr-12 transition-colors hover:bg-card/70">
                    <span className={mono}>{itemKind(n)}</span>
                    <span className="break-words font-serif text-lg leading-snug [overflow-wrap:anywhere]">{n.title || "Untitled"}</span>
                    <span className="line-clamp-3 text-[13px] leading-snug text-muted-foreground">{excerpt(n.markdown) || "Empty"}</span>
                    <span className={`${mono} mt-auto`}>{new Date(n.updated_at).toLocaleDateString()}</span>
                  </Link>
                  <ItemMenu label={`${n.title || "Untitled"} options`} actions={item.actions(n)} className="absolute right-1.5 top-1.5" />
                </li>
              ))}
            </ul>
          )}
        </main>
        {item.dialogs}{topic.dialogs}
        <aside className="min-w-0 border-t lg:sticky lg:top-16 lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:overflow-y-auto lg:border-l lg:border-t-0"><TopicInsight folder={folder} notes={notes} /></aside>
      </div>
    </div>
  );
}
