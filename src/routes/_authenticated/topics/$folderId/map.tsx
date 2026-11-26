import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { topicMap } from "@/lib/topics";
import { openTarget, useVault } from "@/lib/vault";

const Mind3D = lazy(() => import("@/components/mindmap/Mind3D"));

export const Route = createFileRoute("/_authenticated/topics/$folderId/map")({
  head: () => ({ meta: [{ title: "Topic map — Improved Notes" }] }),
  component: TopicMapPage,
});

/** The topic as a full-screen 3D space: no toolbars, just gestures. */
function TopicMapPage() {
  const { folderId } = Route.useParams();
  const navigate = useNavigate();
  const { data: vault } = useVault();
  const [selected, setSelected] = useState<string | null>(null);
  const folder = vault?.folders.find((f) => f.id === folderId);
  const notes = useMemo(() => (vault?.notes ?? []).filter((n) => !n.deleted_at && n.folder_id === folderId), [vault, folderId]);
  const map = useMemo(() => (folder && vault ? topicMap(folder, notes, vault.links) : null), [folder, notes, vault]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { if (selected) setSelected(null); else navigate({ to: "/topics/$folderId", params: { folderId } }); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [selected, folderId, navigate]);

  if (!vault || !folder || !map) return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#0b0b0c] font-mono text-[11px] tracking-[0.1em] text-muted-foreground">BUILDING MAP…</div>;

  const visible = new Set(map.nodes.map((n) => n.id));
  const neighbours = selected ? new Set(map.edges.flatMap((e) => (e.from === selected ? [e.to] : e.to === selected ? [e.from] : []))) : null;
  const node = selected ? map.nodes.find((n) => n.id === selected) : null;
  const note = node?.note_id ? notes.find((n) => n.id === node.note_id) : null;

  return (
    <div className="fixed inset-0 z-[60] bg-[radial-gradient(ellipse_at_50%_42%,#18181a_0%,#0b0b0c_55%,#060607_100%)] text-[#e8e7e3]">
      <ClientOnly fallback={<Skeleton className="h-full w-full rounded-none" />}>
        <Suspense fallback={<div className="grid h-full place-items-center font-mono text-[11px] tracking-[0.1em] text-muted-foreground">BUILDING MAP…</div>}>
          <Mind3D map={map} visible={visible} selected={selected} neighbours={neighbours} onSelect={setSelected} dark />
        </Suspense>
      </ClientOnly>
      <div className="pointer-events-none absolute left-5 top-4 flex items-baseline gap-3" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Link to="/topics/$folderId" params={{ folderId }} className="pointer-events-auto text-[13px] text-[#8a8984] hover:text-white">‹ {folder.name}</Link>
        <span className="font-mono text-[10px] tracking-[0.1em] text-[#55544f]">3D MAP · {notes.length} ITEM{notes.length === 1 ? "" : "S"}</span>
      </div>
      <Link to="/topics/$folderId" params={{ folderId }} aria-label="Close map" className="absolute right-5 top-4 rounded-md border border-[#1f1f22] px-2 py-0.5 font-mono text-[10.5px] text-[#55544f] hover:text-white" style={{ marginTop: "env(safe-area-inset-top)" }}>ESC</Link>
      {node && node.type !== "topic" && (
        <div className="absolute bottom-6 left-1/2 w-[min(92vw,360px)] -translate-x-1/2 rounded-xl border border-[#26262a] bg-[#111113]/95 p-3.5 backdrop-blur" role="dialog" aria-label={node.label}>
          <p className="font-serif text-lg leading-snug">{node.label}</p>
          {node.summary && <p className="mt-1 line-clamp-3 text-[13px] text-[#a9a8a3]">{node.summary}</p>}
          {note && <button onClick={() => navigate(openTarget(note))} className="mt-3 rounded-md bg-[#e8e7e3] px-3 py-1.5 text-sm font-medium text-[#0b0b0c]">Open</button>}
        </div>
      )}
      {!notes.length && <p className="pointer-events-none absolute inset-x-0 bottom-10 text-center text-sm text-[#6a6964]">Add items to this topic and they appear here.</p>}
    </div>
  );
}
