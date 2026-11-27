import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AddPopover } from "@/components/shell/AddMenu";
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
        <main className="min-w-0 px-5 pb-24 pt-6 sm:px-8 lg:px-12 lg:pt-10">
          <Link to="/topics" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Topics</Link>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <h1 className="font-serif text-4xl font-normal leading-tight tracking-tight sm:text-5xl">{folder.name}</h1>
            <AddPopover folderId={folderId}><button className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"><Plus className="h-4 w-4" /> Add to topic</button></AddPopover>
          </div>
          <div role="tablist" aria-label="Filter by type" className="mt-5 flex flex-wrap gap-1.5">
            {(["ALL", ...counts.keys()] as (ItemKind | "ALL")[]).map((k) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                className={`rounded-full border px-3 py-1 text-xs ${filter === k ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
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
                <li key={n.id}>
                  <Link {...openTarget(n)} className="flex h-full min-h-36 flex-col gap-2 rounded-xl border p-3.5 transition-colors hover:bg-card/70">
                    <span className={mono}>{itemKind(n)}</span>
                    <span className="font-serif text-lg leading-snug">{n.title || "Untitled"}</span>
                    <span className="line-clamp-3 text-[13px] leading-snug text-muted-foreground">{excerpt(n.markdown) || "Empty"}</span>
                    <span className={`${mono} mt-auto`}>{new Date(n.updated_at).toLocaleDateString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </main>
        <aside className="border-t lg:sticky lg:top-16 lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:overflow-y-auto lg:border-l lg:border-t-0"><TopicInsight folder={folder} notes={notes} /></aside>
      </div>
    </div>
  );
}
