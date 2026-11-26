import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, getNodesBounds, getViewportForBounds,
  useNodesState, useReactFlow, type Connection, type Edge, type NodeMouseHandler,
} from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { Download, LayoutGrid, Plus, Redo2, RefreshCw, Search, Trash2, Undo2, X, FileText, Box, Square, Minus as MinusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { branchIndex, childrenOf, descendants, hiddenIds, rootId, toOutline, withNoteNodes, type MindMap, type MindNode } from "@/lib/mindmap-types";
import { autoLayout } from "./layout";
import { MindActions, MindNodeCard, type MindFlowNode } from "./MindNodeCard";
import Mind3D from "./Mind3D";
import { useVault } from "@/lib/vault";
import { NodeVaultProvider, NodeVaultActions, NoteIcon } from "./NodeVault";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  value: MindMap;
  onChange: (m: MindMap) => void;
  onShowSource: (snippet: string) => void;
  onRegenerate: () => void;
  fileBase: string;
  sourceNoteId?: string | null;
  sourceNoteTitle?: string | null;
};

const nodeTypes = { mind: MindNodeCard };
const colorFor = (i: number) => (i < 0 ? "var(--branch-root)" : `var(--branch-${i % 7})`);

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

function Inner({ value, onChange, onShowSource, onRegenerate, fileBase, sourceNoteId = null, sourceNoteTitle = null }: Props) {
  const vault = useVault();
  const rendered = useMemo(() => withNoteNodes(value, new Map((vault.data?.notes ?? []).filter((n) => !n.deleted_at).map((n) => [n.id, n.title]))), [value, vault.data]);
  const [edit, setEdit] = useState<{ kind: "rename"; id: string } | { kind: "connection"; from: string; to: string } | null>(null);
  const [draft, setDraft] = useState("");
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const [past, setPast] = useState<MindMap[]>([]);
  const [future, setFuture] = useState<MindMap[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"3d" | "flat">("3d");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const set = () => setDark(document.documentElement.classList.contains("dark"));
    set();
    const mo = new MutationObserver(set);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  const commit = useCallback((next: MindMap) => {
    setPast((p) => [...p.slice(-49), value]);
    setFuture([]);
    onChange(next);
  }, [value, onChange]);
  const undo = useCallback(() => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture((f) => [value, ...f]);
    onChange(prev);
  }, [past, value, onChange]);
  const redo = useCallback(() => {
    const [next, ...rest] = future;
    if (!next) return;
    setFuture(rest);
    setPast((p) => [...p, value]);
    onChange(next);
  }, [future, value, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const hidden = useMemo(() => hiddenIds(rendered), [rendered]);
  const visible = useMemo(() => new Set(rendered.nodes.filter((n) => !hidden.has(n.id)).map((n) => n.id)), [rendered, hidden]);
  const layout = useMemo(() => autoLayout(rendered, visible), [rendered, visible]);
  const root = rootId(value);

  const neighbours = useMemo(() => {
    if (!selected) return null;
    const s = new Set([selected]);
    value.edges.forEach((e) => { if (e.from === selected) s.add(e.to); if (e.to === selected) s.add(e.from); });
    return s;
  }, [selected, value.edges]);

  const derived: MindFlowNode[] = useMemo(() => rendered.nodes.filter((n) => visible.has(n.id)).map((n) => ({
    id: n.id,
    type: "mind",
    position: n.position ?? layout[n.id] ?? { x: 0, y: 0 },
    data: { node: n, linkOnly: !value.nodes.some((original) => original.id === n.id), color: colorFor(branchIndex(value, n.id)), childCount: childrenOf(value, n.id).length, isRoot: n.id === root },
    selected: n.id === selected,
    className: neighbours && !neighbours.has(n.id) ? "faded" : "",
  })), [value, rendered, visible, layout, root, selected, neighbours]);

  const [nodes, setNodes, onNodesChange] = useNodesState<MindFlowNode>(derived);
  useEffect(() => setNodes(derived), [derived, setNodes]);

  const edges: Edge[] = useMemo(() => rendered.edges
    .filter((e) => visible.has(e.from) && visible.has(e.to))
    .map((e, i) => {
      const cross = e.kind === "cross_link";
      const stroke = cross ? "var(--muted-foreground)" : `color-mix(in oklch, ${colorFor(branchIndex(value, e.to))} 70%, var(--foreground) 30%)`;
      const faded = neighbours && !(neighbours.has(e.from) && neighbours.has(e.to) && (e.from === selected || e.to === selected));
      return {
        id: e.id ?? `${e.kind}-${e.from}-${e.to}-${i}`,
        source: e.from,
        target: e.to,
        type: "default",
        animated: cross,
        label: cross ? e.label || undefined : undefined,
        labelBgStyle: { fill: "var(--background)" },
        labelStyle: { fill: "var(--foreground)", fontSize: 11 },
        style: { stroke, strokeWidth: cross ? 1.5 : 2, strokeDasharray: cross ? "6 4" : undefined },
        className: faded ? "faded" : "",
      };
    }), [value, rendered, visible, neighbours, selected]);

  const updateNode = useCallback((id: string, patch: Partial<MindNode>) =>
    commit({ ...value, nodes: value.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }), [value, commit]);

  const addChild = useCallback((parent: string) => {
    const p = value.nodes.find((n) => n.id === parent);
    const id = `n-${Date.now().toString(36)}`;
    const node: MindNode = {
      id, label: "New idea", summary: "", type: p?.type === "topic" ? "subtopic" : "detail", parent_id: parent,
      importance: Math.max(1, (p?.importance ?? 2) - 1) as 1 | 2 | 3, source_snippet: "",
    };
    commit({
      ...value,
      nodes: [...value.nodes.map((n) => (n.id === parent ? { ...n, collapsed: false } : n)), node],
      edges: [...value.edges, { id: `h-${parent}-${id}`, from: parent, to: id, label: "", kind: "hierarchy" }],
    });
    setSelected(id);
  }, [value, commit]);

  const actions = useMemo(() => ({
    rename: (id: string, label: string) => updateNode(id, { label }),
    toggle: (id: string) => updateNode(id, { collapsed: !value.nodes.find((n) => n.id === id)?.collapsed }),
    addChild,
  }), [updateNode, addChild, value.nodes]);

  function deleteNode(id: string, withChildren: boolean) {
    if (id === root) return;
    const target = value.nodes.find((n) => n.id === id);
    const gone = new Set([id, ...(withChildren ? descendants(value, id) : [])]);
    const nodes = value.nodes.filter((n) => !gone.has(n.id)).map((n) => (n.parent_id === id ? { ...n, parent_id: target?.parent_id ?? null } : n));
    const edges = value.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
    nodes.forEach((n) => {
      if (n.parent_id && !edges.some((e) => e.kind === "hierarchy" && e.from === n.parent_id && e.to === n.id))
        edges.push({ id: `h-${n.parent_id}-${n.id}`, from: n.parent_id, to: n.id, label: "", kind: "hierarchy" });
    });
    commit({ ...value, nodes, edges });
    setSelected(null);
  }

  function onConnect(c: Connection) {
    if (!c.source || !c.target || c.source === c.target) return;
    if (!value.nodes.some((n) => n.id === c.source) || !value.nodes.some((n) => n.id === c.target)) return;
    setDraft("");
    setEdit({ kind: "connection", from: c.source, to: c.target });
  }

  function relayout() {
    commit({ ...value, nodes: value.nodes.map(({ position: _p, ...n }) => n) });
    setTimeout(() => rf.fitView({ duration: 300 }), 50);
  }

  const onNodeClick: NodeMouseHandler<MindFlowNode> = (_, n) => {
    setSelected(n.id);
  };

  function focusSearch(q: string) {
    const hit = value.nodes.find((n) => n.label.toLowerCase().includes(q.toLowerCase()));
    if (!hit) return;
    // Expand collapsed ancestors so the hit is visible.
    let cur = hit.parent_id;
    const toOpen = new Set<string>();
    while (cur) { toOpen.add(cur); cur = value.nodes.find((n) => n.id === cur)?.parent_id ?? null; }
    if (value.nodes.some((n) => toOpen.has(n.id) && n.collapsed))
      onChange({ ...value, nodes: value.nodes.map((n) => (toOpen.has(n.id) ? { ...n, collapsed: false } : n)) });
    setSelected(hit.id);
    setTimeout(() => {
      const node = rf.getNode(hit.id);
      if (node && view === "flat") rf.setCenter(node.position.x + 100, node.position.y + 25, { zoom: 1.2, duration: 400 });
    }, 60);
  }

  async function exportImage(kind: "png" | "svg") {
    if (view === "3d") {
      const c = wrap.current?.querySelector("canvas");
      if (kind === "png" && c) return download(`${fileBase}-mindmap-3d.png`, c.toDataURL("image/png"));
      setView("flat");
      setTimeout(() => void exportImage(kind), 400);
      return;
    }
    const el = wrap.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!el) return;
    const bounds = getNodesBounds(rf.getNodes());
    const w = Math.max(800, bounds.width + 160), h = Math.max(600, bounds.height + 160);
    const vp = getViewportForBounds(bounds, w, h, 0.2, 2, 0.05);
    const opts = {
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      width: w, height: h,
      style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
    };
    const url = kind === "png" ? await toPng(el, { ...opts, pixelRatio: 2 }) : await toSvg(el, opts);
    download(`${fileBase}-mindmap.${kind}`, url);
  }
  function exportText(ext: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    download(`${fileBase}-mindmap.${ext}`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const sel = value.nodes.find((n) => n.id === selected);
  const connected = sel
    ? value.edges.filter((e) => e.from === sel.id || e.to === sel.id).map((e) => {
        const other = value.nodes.find((n) => n.id === (e.from === sel.id ? e.to : e.from));
        return { e, other };
      }).filter((x) => x.other)
    : [];

  return (
    <NodeVaultProvider value={value} onChange={commit} sourceNoteId={sourceNoteId} sourceNoteTitle={sourceNoteTitle}>
    <MindActions.Provider value={actions}>
      <Dialog open={edit !== null} onOpenChange={(open) => { if (!open) setEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.kind === "rename" ? "Rename node" : "Label connection"}</DialogTitle><DialogDescription>{edit?.kind === "rename" ? "Enter a node label." : "A connection label is optional."}</DialogDescription></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!edit) return;
            if (edit.kind === "rename") {
              if (!draft.trim()) return;
              actions.rename(edit.id, draft.trim());
            } else if (value.nodes.some((n) => n.id === edit.from) && value.nodes.some((n) => n.id === edit.to)) {
              commit({ ...value, edges: [...value.edges, { id: `x-${crypto.randomUUID()}`, from: edit.from, to: edit.to, label: draft.trim(), kind: "cross_link" }] });
            }
            setEdit(null);
          }}>
            <Input autoFocus aria-label={edit?.kind === "rename" ? "Node label" : "Connection label"} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" disabled={edit?.kind === "rename" && !draft.trim()}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
          <form className="relative mr-auto" onSubmit={(e) => { e.preventDefault(); focusSearch(query); }}>
            <Search className="pointer-events-none absolute top-2 left-2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a node" list="mind-nodes" className="h-8 w-36 pl-7 text-sm sm:w-44" aria-label="Search nodes" />
            <datalist id="mind-nodes">{value.nodes.map((n) => <option key={n.id} value={n.label} />)}</datalist>
          </form>
          <Button variant="ghost" size="sm" aria-label={view === "3d" ? "Switch to flat view" : "Switch to 3D view"} onClick={() => setView(view === "3d" ? "flat" : "3d")}>
            {view === "3d" ? <><Square /> Flat</> : <><Box /> 3D</>}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Add child" onClick={() => addChild(selected ?? root ?? "")} disabled={!root}><Plus /></Button>
          <Button variant="ghost" size="icon" aria-label="Undo" onClick={undo} disabled={!past.length}><Undo2 /></Button>
          <Button variant="ghost" size="icon" aria-label="Redo" onClick={redo} disabled={!future.length}><Redo2 /></Button>
          <Button variant="ghost" size="icon" aria-label="Re-layout" title="Re-layout" onClick={relayout}><LayoutGrid /></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Regenerate from notes" title="Regenerate from notes"><RefreshCw /></Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate from notes?</AlertDialogTitle>
                <AlertDialogDescription>This builds a fresh map from the current transcript. Your manual edits to this map will be replaced.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Keep edits</AlertDialogCancel><AlertDialogAction onClick={onRegenerate}>Regenerate</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Export mind map"><Download /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportImage("png")}>PNG image</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportImage("svg")}>SVG image</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportText("json", JSON.stringify(value, null, 2), "application/json")}>JSON</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportText("md", toOutline(value), "text/markdown")}>Markdown outline</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div ref={wrap} className="mindmap relative min-h-0 flex-1">
          {view === "3d" ? (
            <Mind3D map={rendered} visible={visible} selected={selected} neighbours={neighbours} onSelect={setSelected} dark={dark} />
          ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelected(null)}
            onNodeDragStop={(_, __, dragged) => {
              const moved = new Map(dragged.map((d) => [d.id, d.position]));
              commit({ ...value, nodes: value.nodes.map((n) => { const p = moved.get(n.id); return p ? { ...n, position: { x: p.x, y: p.y } } : n; }) });
            }}
            onConnect={onConnect}
            deleteKeyCode={null}
            zoomOnDoubleClick={false}
            fitView
            minZoom={0.1}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable className="!hidden sm:!block" nodeColor={(n) => (n.data as { color?: string }).color ?? "var(--muted)"} maskColor="color-mix(in oklch, var(--background) 60%, transparent)" />
          </ReactFlow>
          )}

          {sel && (
            <aside className="absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-auto rounded-t-xl border-t bg-card p-4 shadow-lg md:inset-y-2 md:right-2 md:left-auto md:max-h-none md:w-72 md:rounded-xl md:border">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-serif text-lg font-semibold leading-tight">{sel.label}</h3><NoteIcon node={sel} />
                <Button variant="ghost" size="icon" className="-mt-1 -mr-2 h-7 w-7" aria-label="Close panel" onClick={() => setSelected(null)}><X /></Button>
              </div>
              <NodeVaultActions node={sel} />
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{sel.type}</p>
              {sel.summary && <p className="mt-2 text-sm">{sel.summary}</p>}
              {sel.source_snippet && (
                <button type="button" onClick={() => onShowSource(sel.source_snippet)} className="mt-3 flex w-full items-start gap-2 rounded-md bg-muted p-2 text-left text-xs italic">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /> “{sel.source_snippet}”
                </button>
              )}
              {connected.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground">Connected</p>
                  <ul className="mt-1 space-y-1">
                    {connected.map(({ e, other }) => (
                      <li key={`${e.from}-${e.to}-${e.kind}`}>
                        <button type="button" className="text-left text-sm underline-offset-2 hover:underline" onClick={() => setSelected(other!.id)}>
                          {e.kind === "cross_link" ? <span className="text-muted-foreground">{e.label || "related"} · </span> : null}{other!.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => addChild(sel.id)}><Plus /> Child</Button>
                {childrenOf(value, sel.id).length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => actions.toggle(sel.id)}>{sel.collapsed ? <><Plus /> Expand</> : <><MinusIcon /> Collapse</>}</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { setDraft(sel.label); setEdit({ kind: "rename", id: sel.id }); }}>Rename</Button>
                {sel.id !== root && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="sm" variant="outline"><Trash2 /> Delete</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{sel.label}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {childrenOf(value, sel.id).length ? "You can also delete everything under it, or keep its children and move them up a level." : "You can undo this."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        {childrenOf(value, sel.id).length > 0 && <AlertDialogAction onClick={() => deleteNode(sel.id, false)}>Keep children</AlertDialogAction>}
                        <AlertDialogAction onClick={() => deleteNode(sel.id, true)}>{childrenOf(value, sel.id).length ? "Delete all" : "Delete"}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </MindActions.Provider>
    </NodeVaultProvider>
  );
}

export default function MindMapView(props: Props) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
