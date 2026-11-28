import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { Check, Loader2, Search, SlidersHorizontal, Sparkles, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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

// Every kind of note belongs in the graph: written, scanned, concept, generated, slides, audio and pictures.
const KINDS = ["handwritten", "text", "concept", "generated", "slides", "audio", "model3d"];
const KIND_LABEL: Record<string, string> = { handwritten: "scans", text: "notes", concept: "concepts", generated: "generated", slides: "slides", audio: "audio", model3d: "pictures" };

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
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lonelyOpen, setLonelyOpen] = useState(false);
  const [pick, setPick] = useState<{ id: string; n: number } | null>(null);
  // Memoised so the graph isn't handed a brand-new list on every render (that would recompute every connection each time).
  const live = useMemo(() => (vault?.notes ?? []).filter((n) => !n.deleted_at), [vault]);
  const shown = useMemo(() => live.filter((n) => kinds.includes(n.kind) && (!tag || n.tags.includes(tag)) && (!folder || n.folder_id === folder)), [live, kinds, tag, folder]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? new Set(shown.filter((n) => n.title.toLowerCase().includes(q)).map((n) => n.id)) : undefined), [shown, q]);
  if (!vault) return null;

  const tags = [...new Set(live.flatMap((n) => n.tags))].sort();
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
      {/* Top bar: just search and the two things you reach for most. Everything else is under Filters, so a phone isn't crowded. */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a note or concept" aria-label="Find a note or concept" data-graph-search
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:text-sm" />
        </div>
        <Button size="sm" variant="outline" className="h-9 shrink-0 sm:h-8" onClick={() => setLonelyOpen(true)} disabled={!stats?.orphans.length} data-unconnected>
          <Unlink className="h-3.5 w-3.5" /> <span className="hidden min-[400px]:inline">Not connected</span> {stats ? `(${stats.orphans.length})` : ""}
        </Button>
        <Button size="sm" variant="outline" className="h-9 shrink-0 sm:h-8" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}><SlidersHorizontal className="h-3.5 w-3.5" /> <span className="hidden min-[400px]:inline">Filters</span></Button>
      </div>
      {filtersOpen && (
        <div className="enter-pop flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2" data-graph-filters>
          <select aria-label="Filter by tag" className={sel} value={tag} onChange={(e) => setTag(e.target.value)}><option value="">All tags</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>
          <select aria-label="Filter by folder" className={sel} value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">All topics</option>{vault.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <div className="flex w-full flex-wrap gap-1">{KINDS.map((k) => (
            <button key={k} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])} className={`rounded-full border px-2.5 py-1 text-xs ${kinds.includes(k) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{KIND_LABEL[k] ?? k}</button>
          ))}</div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" role="switch" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} /> Connect notes automatically</label>
          <Button size="sm" variant="outline" className="ml-auto" onClick={runSuggest} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Refine with AI</Button>
        </div>
      )}
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
      <p className="px-3 py-1 font-mono text-[11px] text-muted-foreground" data-graph-stats aria-live="polite">{stats ? `${stats.notes} notes · ${stats.links} linked${showAuto ? ` · ${stats.auto} related` : ""} · ${stats.orphans.length} not connected yet` : ""}{matches ? ` · ${matches.size} match${matches.size === 1 ? "" : "es"}` : ""}</p>
      <div className="min-h-0 flex-1">
        <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            <VaultGraph notes={shown} links={vault.links} folders={vault.folders} showAuto={showAuto} onStats={setStats} {...(matches ? { highlight: matches } : {})} select={pick}
              onOpen={(n) => navigate(openTarget(n))}
              onAddLink={async (a, b, why) => { await addLink(a, b, "auto", why.slice(0, 60)); await refresh(); toast.success("Link kept"); }}
              onRemoveLink={async (id) => { await deleteLink(id); await refresh(); }} />
          </Suspense>
        </ClientOnly>
      </div>
      <Sheet open={lonelyOpen} onOpenChange={setLonelyOpen}>
        <SheetContent side="bottom" className="max-h-[75dvh] overflow-y-auto rounded-t-2xl pb-8">
          <SheetTitle>Not connected yet</SheetTitle>
          <p className="mb-2 text-sm text-muted-foreground">Stored, but nothing links to them or shares enough with them yet. Tap one to see it on the map and what it's closest to.</p>
          <ul className="divide-y rounded-lg border" data-unconnected-list>
            {(stats?.orphans ?? []).map((id) => {
              const n = live.find((x) => x.id === id);
              if (!n) return null;
              return (
                <li key={id}>
                  <button className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary" onClick={() => { setPick({ id, n: Date.now() }); setLonelyOpen(false); }}>
                    <span className="min-w-0 flex-1 truncate font-medium">{n.title || "Untitled"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{KIND_LABEL[n.kind] ?? n.kind}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
