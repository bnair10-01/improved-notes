import "@excalidraw/excalidraw/index.css";
import { useEffect, useRef, useState } from "react";
import { Excalidraw, convertToExcalidrawElements, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Check, Loader2, PenLine, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toSkeleton, type AiDiagram, type Diagram } from "@/lib/diagram-types";

type Props = {
  diagrams: Diagram[];
  onChange: (d: Diagram[]) => void;
  onFind: () => void;
  finding: boolean;
  dark: boolean;
  canFind: boolean;
};

type Els = Parameters<typeof exportToSvg>[0]["elements"];

/** Convert AI output into stored Excalidraw diagrams. */
export function fromAi(list: AiDiagram[]): Diagram[] {
  return list.map((d, i) => ({
    id: `d-${Date.now().toString(36)}-${i}`,
    title: d.title || `Drawing ${i + 1}`,
    page: d.page || 1,
    elements: convertToExcalidrawElements(toSkeleton(d.shapes) as never) as unknown[],
  }));
}

function Thumb({ d, dark }: { d: Diagram; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let off = false;
    if (!d.elements.length) return;
    exportToSvg({ elements: d.elements as Els, appState: { exportBackground: false, exportWithDarkMode: dark }, files: null, exportPadding: 12 })
      .then((svg: SVGSVGElement) => {
        if (off || !ref.current) return;
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        ref.current.replaceChildren(svg);
      })
      .catch(() => {});
    return () => { off = true; };
  }, [d.elements, dark]);
  return (
    <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-md bg-muted p-2 text-xs text-muted-foreground">
      {d.elements.length ? <div ref={ref} className="h-full w-full" /> : "Empty"}
    </div>
  );
}

function Editor({ d, dark, onClose, onSave }: { d: Diagram; dark: boolean; onClose: () => void; onSave: (els: unknown[], title: string) => void }) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const [title, setTitle] = useState(d.title);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Drawing title" className="min-w-0 flex-1 bg-transparent font-serif text-lg font-semibold outline-none" />
        <Button variant="ghost" size="sm" onClick={onClose}><X /> Cancel</Button>
        <Button size="sm" onClick={() => onSave([...(api.current?.getSceneElements() ?? [])], title.trim() || d.title)}><Check /> Done</Button>
      </div>
      <div className="min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(a) => { api.current = a; }}
          theme={dark ? "dark" : "light"}
          initialData={{ elements: d.elements as Els, scrollToContent: true }}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
        />
      </div>
    </div>
  );
}

export default function DiagramsPanel({ diagrams, onChange, onFind, finding, dark, canFind }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const current = diagrams.find((d) => d.id === editing);

  function addBlank() {
    const d: Diagram = { id: `d-${Date.now().toString(36)}`, title: "New drawing", page: 1, elements: [] };
    onChange([...diagrams, d]);
    setEditing(d.id);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button size="sm" variant="outline" onClick={onFind} disabled={finding || !canFind}>
          {finding ? <Loader2 className="animate-spin" /> : <Sparkles />} {diagrams.length ? "Find drawings again" : "Find drawings in photos"}
        </Button>
        <Button size="sm" variant="ghost" onClick={addBlank}><Plus /> Blank drawing</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {finding ? (
          <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div>
        ) : diagrams.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <PenLine className="h-6 w-6" />
            <p>Redraw the sketches in your photos as clean diagrams you can edit, or start a blank drawing.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {diagrams.map((d) => (
              <li key={d.id} className="rounded-lg border bg-card p-2">
                <button type="button" className="block w-full text-left" onClick={() => setEditing(d.id)} aria-label={`Open ${d.title}`}>
                  <Thumb d={d} dark={dark} />
                </button>
                <div className="mt-2 flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">Page {d.page}</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Edit drawing" onClick={() => setEditing(d.id)}><PenLine /></Button>
                  <Button variant="ghost" size="icon" aria-label="Delete drawing" onClick={() => onChange(diagrams.filter((x) => x.id !== d.id))}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {current && (
        <Editor
          d={current}
          dark={dark}
          onClose={() => { if (!current.elements.length) onChange(diagrams.filter((x) => x.id !== current.id)); setEditing(null); }}
          onSave={(els, title) => { onChange(diagrams.map((x) => (x.id === current.id ? { ...x, elements: els, title } : x))); setEditing(null); }}
        />
      )}
    </div>
  );
}
