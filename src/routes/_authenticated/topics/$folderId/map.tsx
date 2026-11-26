import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { outsideLinked } from "@/lib/topics";
import { addLink, deleteLink, openTarget, useRefreshVault, useVault } from "@/lib/vault";

const VaultGraph3D = lazy(() => import("@/components/vault/VaultGraph3D"));

export const Route = createFileRoute("/_authenticated/topics/$folderId/map")({
  head: () => ({ meta: [{ title: "Topic map — Improved Notes" }] }),
  component: TopicMapPage,
});

/** The topic as a full-screen 3D space: its notes, how they connect, and notes from other topics that link in. */
function TopicMapPage() {
  const { folderId } = Route.useParams();
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const { data: vault } = useVault();
  const folder = vault?.folders.find((f) => f.id === folderId);
  const inside = useMemo(() => (vault?.notes ?? []).filter((n) => !n.deleted_at && n.folder_id === folderId), [vault, folderId]);
  const outside = useMemo(() => (vault ? outsideLinked(inside, vault.notes, vault.links) : []), [vault, inside]);
  const shown = useMemo(() => [...inside, ...outside], [inside, outside]);
  const inTopic = useMemo(() => new Set(inside.map((n) => n.id)), [inside]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") navigate({ to: "/topics/$folderId", params: { folderId } }); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [folderId, navigate]);

  if (!vault || !folder) return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#0b0b0c] font-mono text-[11px] tracking-[0.1em] text-muted-foreground">BUILDING MAP…</div>;

  return (
    <div className="fixed inset-0 z-[60] bg-[#0b0b0c] text-[#e8e7e3]">
      <ClientOnly fallback={<Skeleton className="h-full w-full rounded-none" />}>
        <Suspense fallback={<div className="grid h-full place-items-center font-mono text-[11px] tracking-[0.1em] text-muted-foreground">BUILDING MAP…</div>}>
          <VaultGraph3D notes={shown} links={vault.links} folders={vault.folders} inTopic={inTopic}
            onOpen={(n) => navigate(openTarget(n))}
            onAddLink={async (a, b, why) => { await addLink(a, b, "auto", why.slice(0, 60)); await refresh(); toast.success("Link kept"); }}
            onRemoveLink={async (id) => { await deleteLink(id); await refresh(); }} />
        </Suspense>
      </ClientOnly>
      <div className="pointer-events-none absolute right-5 top-3 flex items-baseline gap-3 text-right" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <span className="font-mono text-[10px] tracking-[0.1em] text-[#55544f]">3D MAP · {inside.length} ITEM{inside.length === 1 ? "" : "S"}{outside.length ? ` · ${outside.length} FROM OTHER TOPICS` : ""}</span>
      </div>
      <Link to="/topics/$folderId" params={{ folderId }} data-map-back className="absolute right-5 top-9 rounded-md border border-[#1f1f22] px-2 py-0.5 font-mono text-[10.5px] text-[#55544f] hover:text-white" style={{ marginTop: "env(safe-area-inset-top)" }}>ESC · back to {folder.name}</Link>
    </div>
  );
}
