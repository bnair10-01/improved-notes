import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { NewTopicDialog } from "@/components/topics/NewTopicDialog";
import { ItemMenu } from "@/components/shell/ItemMenu";
import { useTopicActions } from "@/components/vault/itemActions";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/_authenticated/topics/")({
  head: () => ({ meta: [{ title: "Topics — Improved Notes" }] }),
  component: TopicsPage,
});

function TopicsPage() {
  const { data: vault, isLoading } = useVault();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const topic = useTopicActions();
  const live = (vault?.notes ?? []).filter((n) => !n.deleted_at);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="stagger mx-auto min-w-0 max-w-5xl px-4 pb-28 pt-6 sm:px-8 sm:pb-24 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-3xl font-normal tracking-tight sm:text-5xl">Topics</h1>
            <p className="mt-1 text-sm text-muted-foreground">A topic gathers everything on one subject: scans, notes, websites, lectures and slides.</p>
          </div>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"><Plus className="h-4 w-4" /> New topic</button>
        </div>
        {isLoading || !vault ? <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : !vault.folders.length ? (
            <div className="mt-10 rounded-xl border border-dashed p-10 text-center">
              <p className="font-serif text-xl">No topics yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Topics are optional. Make one when a subject starts to grow.</p>
            </div>
          ) : (
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vault.folders.map((f) => {
                const items = live.filter((n) => n.folder_id === f.id);
                return (
                  <li key={f.id} className="relative min-w-0">
                    <Link to="/topics/$folderId" params={{ folderId: f.id }} className="flex min-h-32 min-w-0 flex-col gap-2 rounded-xl border p-4 pr-12 transition-colors hover:bg-card/70">
                      <span className="break-words font-serif text-xl leading-snug [overflow-wrap:anywhere]">{f.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
                      <span className="mt-auto line-clamp-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{items.slice(0, 3).map((n) => n.title || "Untitled").join(" · ") || "Empty"}</span>
                    </Link>
                    <ItemMenu label={`Topic ${f.name} options`} actions={topic.actions(f)} className="absolute right-1.5 top-1.5" />
                  </li>
                );
              })}
            </ul>
          )}
      </main>
      {topic.dialogs}
      <NewTopicDialog open={creating} onOpenChange={setCreating} onCreated={(id) => navigate({ to: "/topics/$folderId", params: { folderId: id } })} />
    </div>
  );
}
