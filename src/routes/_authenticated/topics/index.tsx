import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { NewTopicDialog } from "@/components/topics/NewTopicDialog";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/_authenticated/topics/")({
  head: () => ({ meta: [{ title: "Topics — Improved Notes" }] }),
  component: TopicsPage,
});

function TopicsPage() {
  const { data: vault, isLoading } = useVault();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const live = (vault?.notes ?? []).filter((n) => !n.deleted_at);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-4xl font-normal tracking-tight sm:text-5xl">Topics</h1>
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
                  <li key={f.id}>
                    <Link to="/topics/$folderId" params={{ folderId: f.id }} className="flex min-h-32 flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-card/70">
                      <span className="font-serif text-xl leading-snug">{f.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
                      <span className="mt-auto truncate text-xs text-muted-foreground">{items.slice(0, 3).map((n) => n.title || "Untitled").join(" · ") || "Empty"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
      </main>
      <NewTopicDialog open={creating} onOpenChange={setCreating} onCreated={(id) => navigate({ to: "/topics/$folderId", params: { folderId: id } })} />
    </div>
  );
}
