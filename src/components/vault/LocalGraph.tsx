import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly, Link, useNavigate } from "@tanstack/react-router";
import { Folder, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addLink, deleteLink, neighborhood, openTarget, useRefreshVault, useVault } from "@/lib/vault";

const VaultGraph = lazy(() => import("./VaultGraph3D"));

/**
 * One note's neighbourhood, for any kind of note (written, scanned, slides, audio, a model). It joins the notes it links to and
 * the ones it connects with automatically, and leads on to the whole-vault graph and to the note's topic map, so there are
 * three sizes of the same picture: the note's own, its topic's, and everything.
 */
export function LocalGraph({ noteId }: { noteId: string }) {
  const { data: vault } = useVault();
  const refresh = useRefreshVault();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [depth, setDepth] = useState(1);
  const near = useMemo(() => (vault ? neighborhood(vault, noteId, depth) : new Set<string>()), [vault, noteId, depth]);
  const direct = useMemo(() => (vault ? neighborhood(vault, noteId, 1).size - 1 : 0), [vault, noteId]);
  if (!vault) return null;
  const live = vault.notes.filter((n) => !n.deleted_at);
  const folder = vault.folders.find((f) => f.id === live.find((n) => n.id === noteId)?.folder_id);
  return (
    <section data-distraction data-local-graph className="mt-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShow(!show)}><Network /> {show ? "Hide" : "Show"} local graph{direct > 0 ? ` · ${direct} connected` : ""}</Button>
        {show && <div className="flex items-center gap-1 text-xs text-muted-foreground">Depth {[1, 2, 3].map((d) => <button key={d} onClick={() => setDepth(d)} className={`h-6 w-6 rounded-md border ${depth === d ? "border-primary bg-primary text-primary-foreground" : ""}`}>{d}</button>)}</div>}
        <Link to="/vault/graph" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Whole vault graph</Link>
        {folder && <Link to="/topics/$folderId" params={{ folderId: folder.id }} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"><Folder className="h-3 w-3" /> {folder.name} topic map</Link>}
      </div>
      {show && (
        <div className="paper-sheet h-80 overflow-hidden">
          <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
              <VaultGraph notes={live.filter((n) => near.has(n.id))} links={vault.links} folders={vault.folders} focusId={noteId}
                onOpen={(n) => navigate(openTarget(n))}
                onAddLink={async (a, b, why) => { await addLink(a, b, "auto", why.slice(0, 60)); await refresh(); }}
                onRemoveLink={async (id) => { await deleteLink(id); await refresh(); }} />
            </Suspense>
          </ClientOnly>
        </div>
      )}
    </section>
  );
}
