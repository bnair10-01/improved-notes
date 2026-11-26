import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addLink, deleteLink, openTarget, useRefreshVault, useVault } from "@/lib/vault";
import { suggestLinks, type LinkSuggestion } from "@/lib/ai/tasks";
import type { GraphStats } from "@/components/vault/VaultGraph3D";

const VaultGraph = lazy(() => import("@/components/vault/VaultGraph3D"));

export const Route = createFileRoute("/_authenticated/vault/graph")({
  head: () => ({
    meta: [
      { title: "Vault graph — Improved Notes" },
      { name: "description", content: "See how all your notes connect, and link related ones." },
      { property: "og:title", content: "Vault graph — Improved Notes" },
      { property: "og:description", content: "A graph of every note and link in your vault." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GraphPage,
});

const KINDS = ["handwritten", "text", "concept", "generated"];

function GraphPage() {
  const { data: vault } = useVault();
  const refresh = useRefreshVault();
  const navigate = useNavigate();
  const suggest = suggestLinks;
  const [tag, setTag] = useState("");
  const [folder, setFolder] = useState("");
  const [kinds, setKinds] = useState<string[]>(KINDS);
  const [busy, setBusy] = useState(false);
  const [ideas, setIdeas] = useState<LinkSuggestion[] | null>(null);
  const [showAuto, setShowAuto] = useState(true);
  const [stats, setStats] = useState<GraphStats | null>(null);
  if (!vault) return null;

  const live = vault.notes.filter((n) => !n.deleted_at);
  const tags = [...new Set(live.flatMap((n) => n.tags))].sort();
  const shown = live.filter((n) => kinds.includes(n.kind) && (!tag || n.tags.includes(tag)) && (!folder || n.folder_id === folder));
  const title = (id: string) => live.find((n) => n.id === id)?.title ?? "?";
  const sel = "h-8 rounded-md border bg-background px-2 text-sm";

  async function runSuggest() {
    setBusy(true);
    try {
      const r = await suggest();
      if (!r.ok) { toast.error(r.error); return; }
      setIdeas(r.suggestions);
      if (!r.suggestions.length) toast("No clearly related notes found.");
    } catch { toast.error("Couldn't suggest links. Please try again."); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <select aria-label="Filter by tag" className={sel} value={tag} onChange={(e) => setTag(e.target.value)}><option value="">All tags</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>
        <select aria-label="Filter by folder" className={sel} value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">All folders</option>{vault.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <div className="flex gap-1">{KINDS.map((k) => (
          <button key={k} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])} className={`rounded-full border px-2 py-0.5 text-xs capitalize ${kinds.includes(k) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{k}</button>
        ))}</div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" role="switch" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} /> Connect notes automatically</label>
        <Button size="sm" variant="outline" onClick={runSuggest} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Refine with AI</Button>
      </div>
      {ideas && ideas.length > 0 && (
        <div className="max-h-48 space-y-1 overflow-auto border-b bg-muted/50 px-3 py-2">
          {ideas.map((s) => (
            <div key={`${s.from}-${s.to}`} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{title(s.from)} ↔ {title(s.to)}</p><p className="truncate text-xs text-muted-foreground">{s.reason}</p></div>
              <Button size="icon" variant="ghost" aria-label="Accept link" onClick={async () => { await addLink(s.from, s.to, "ai_suggested", s.reason.slice(0, 60)); setIdeas(ideas.filter((x) => x !== s)); await refresh(); }}><Check /></Button>
              <Button size="icon" variant="ghost" aria-label="Reject link" onClick={() => setIdeas(ideas.filter((x) => x !== s))}><X /></Button>
            </div>
          ))}
        </div>
      )}
      <p className="px-3 py-1 font-mono text-[11px] text-muted-foreground" data-graph-stats aria-live="polite">{stats ? `${stats.notes} notes · ${stats.links} written link${stats.links === 1 ? "" : "s"} · ${stats.auto} found automatically` : "Building the graph…"}</p>
      <div className="min-h-0 flex-1">
        <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            <VaultGraph notes={shown} links={vault.links} folders={vault.folders} showAuto={showAuto} onStats={setStats}
              onOpen={(n) => navigate(openTarget(n))}
              onAddLink={async (a, b, why) => { await addLink(a, b, "auto", why.slice(0, 60)); await refresh(); toast.success("Link kept"); }}
              onRemoveLink={async (id) => { await deleteLink(id); await refresh(); }} />
          </Suspense>
        </ClientOnly>
      </div>
    </div>
  );
}
