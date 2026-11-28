import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDoc } from "firebase/firestore";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Working } from "@/components/fun/Doodle";
import { generateMindmap } from "@/lib/ai/tasks";
import { userDoc } from "@/lib/db";
import { isMindMap, type MindMap } from "@/lib/mindmap-types";
import { saveMindmap } from "@/lib/notes";

const MindMapView = lazy(() => import("@/components/mindmap/MindMapView"));

/**
 * A mind map for any note, whatever its kind: written, generated, slides, audio, a model. One tap makes it from the note's text and
 * keeps it on the note; after that it opens straight away, is editable, and can be redrawn if the note changes.
 * `signal` opens it from elsewhere on the page (the Insight column's Map button).
 */
export function NoteMindMap({ noteId, title, markdown, signal = 0 }: { noteId: string; title: string; markdown: string; signal?: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLElement>(null);
  const saved = useQuery({
    queryKey: ["note-map", noteId],
    queryFn: async () => { const s = (await getDoc(userDoc("notes", noteId))).get("structure"); return isMindMap(s) ? (s as unknown as MindMap) : null; },
  });
  const map = saved.data ?? null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const set = (m: MindMap | null) => qc.setQueryData(["note-map", noteId], m);

  async function make() {
    if (!markdown.trim()) { toast("Write something in the note first, then make its map."); return; }
    setBusy(true);
    try {
      const r = await generateMindmap({ markdown });
      if (!r.ok) { toast.error(r.error); return; }
      set(r.mindmap);
      await saveMindmap(noteId, r.mindmap, false);
    } catch { toast.error("Couldn't build the mind map. Please try again."); } finally { setBusy(false); }
  }
  function edited(m: MindMap) {
    set(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveMindmap(noteId, m, false).catch(() => toast.error("Couldn't save the mind map.")); }, 800);
  }
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !map && !busy && !saved.isPending) await make();
  }
  // Opened from elsewhere on the page.
  useEffect(() => {
    if (!signal) return;
    setOpen(true);
    wrap.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!map && !busy && !saved.isPending) void make();
  }, [signal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section ref={wrap} data-distraction data-note-mindmap className="mt-5 scroll-mt-20">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void toggle()} disabled={busy}><Network /> {open ? "Hide" : map ? "Show" : "Make"} mind map</Button>
        {!map && !open && <span className="text-xs text-muted-foreground">Turns this note into a map of its ideas, in 2D or 3D.</span>}
      </div>
      {open && busy && <div className="paper-sheet p-4"><Working kind="mind" quips="map" steps={["Reading your note…", "Finding the main ideas…", "Connecting them…", "Laying out the map…"]} /></div>}
      {open && !busy && map && (
        <div className="paper-sheet flex h-[30rem] min-h-0 flex-col overflow-hidden">
          <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
              <MindMapView value={map} onChange={edited} onShowSource={(s) => toast(`From your note: “${s}”`)} onRegenerate={() => void make()}
                fileBase={(title || "note").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "note"} sourceNoteId={noteId} sourceNoteTitle={title || null} />
            </Suspense>
          </ClientOnly>
        </div>
      )}
    </section>
  );
}
