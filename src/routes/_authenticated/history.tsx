import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AppHeader } from "@/components/AppHeader";
import { getDocs } from "firebase/firestore";
import { userCol } from "@/lib/db";
import { signedUrls, trashNote } from "@/lib/notes";
import { branchIndex, isMindMap, rootId, type MindMap } from "@/lib/mindmap-types";

/** Tiny radial sketch of a note's mind map. */
function MindThumb({ map }: { map: MindMap }) {
  const root = rootId(map);
  const branches = map.nodes.filter((n) => n.parent_id === root).slice(0, 7);
  const pts = branches.map((b, i) => {
    const a = (i / Math.max(branches.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { id: b.id, x: 24 + Math.cos(a) * 16, y: 32 + Math.sin(a) * 18, c: branchIndex(map, b.id) };
  });
  return (
    <svg viewBox="0 0 48 64" className="h-16 w-12 shrink-0 rounded-md bg-muted" role="img" aria-label="Mind map preview">
      {pts.map((p) => <line key={`l${p.id}`} x1={24} y1={32} x2={p.x} y2={p.y} stroke="var(--muted-foreground)" strokeWidth={0.8} />)}
      {pts.map((p) => <circle key={p.id} cx={p.x} cy={p.y} r={4} fill={`var(--branch-${p.c % 7})`} />)}
      <circle cx={24} cy={32} r={6} fill="var(--primary)" />
    </svg>
  );
}

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "History — Improved Notes" },
      { name: "description", content: "Your saved handwritten-note transcripts." },
      { property: "og:title", content: "History — Improved Notes" },
      { property: "og:description", content: "Browse and reopen saved transcripts of handwritten notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

type HistoryRow = { id: string; title: string; created_at: string; image_paths: string[]; structure: unknown; deleted_at: string | null };

async function fetchNotes() {
  const snap = await getDocs(userCol("notes"));
  const data = snap.docs
    .map((d) => ({ image_paths: [], structure: null, deleted_at: null, ...d.data(), id: d.id }) as unknown as HistoryRow)
    .filter((n) => !n.deleted_at && n.image_paths.length > 0)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const thumbs = await signedUrls(data.map((n) => n.image_paths[0]).filter((p): p is string => !!p));
  let k = 0;
  return data.map((n) => ({ ...n, thumb: n.image_paths[0] ? thumbs[k++] : undefined }));
}

function HistoryPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["notes"], queryFn: fetchNotes });

  async function remove(id: string) {
    try {
      await trashNote(id);
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast.success("Moved to Trash. You can restore it any time.");
    } catch {
      toast.error("Couldn't delete that note.");
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-serif text-3xl font-semibold">History</h1>
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !data?.length ? (
          <div className="paper-sheet mt-6 px-6 py-12 text-center text-muted-foreground">
            No saved notes yet. <Link to="/scan" className="text-primary underline underline-offset-4">Scan your first page</Link>.
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {data.map((n) => (
              <li key={n.id} className="paper-sheet flex items-center gap-4 p-3">
                <Link to="/review" search={{ id: n.id }} className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    {n.thumb ? <img src={n.thumb} alt="" className="h-full w-full object-cover" /> : <FileText className="m-auto mt-5 h-5 w-5 text-muted-foreground" />}
                  </div>
                  {isMindMap(n.structure) && <MindThumb map={n.structure as unknown as MindMap} />}
                  <div className="min-w-0">
                    <p className="truncate font-serif text-lg font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(n.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {n.image_paths.length} page{n.image_paths.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Delete note"><Trash2 /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Move “{n.title}” to Trash?</AlertDialogTitle>
                      <AlertDialogDescription>It moves to Trash and stays there until you empty it. Nothing is deleted for good unless you choose to.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(n.id)}>Move to Trash</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
