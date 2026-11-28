import { PinchZoom, ZoomButtons } from "@/components/scene/SceneZoom";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import { forceLayout3d, type Vec3 } from "@/lib/graph-layout";
import { pairKey, relatedPairs, type Related } from "@/lib/related";
import type { VFolder, VLink, VNote } from "@/lib/vault";

export type GraphStats = { notes: number; links: number; auto: number; /** Notes nothing connects to yet. */ orphans: string[] };

type Props = {
  notes: VNote[];
  links: VLink[];
  folders?: VFolder[];
  focusId?: string;
  showAuto?: boolean;
  /** When set, notes outside this set are drawn as dimmer "↗" satellites of a topic. */
  inTopic?: Set<string>;
  /** Notes to bring forward (a search): their labels win and the rest fade. */
  highlight?: Set<string>;
  /** Ask the graph to select a note, e.g. from the "not connected yet" list. `n` changes on every request. */
  select?: { id: string; n: number } | null;
  onOpen: (n: VNote) => void;
  onAddLink?: (a: string, b: string, why: string) => void | Promise<void>;
  onRemoveLink?: (linkId: string) => void;
  onStats?: (s: GraphStats) => void;
};

type Edge = { a: string; b: string; kind: "written" | "auto"; linkId?: string; shared?: string[] };

const NO_TOPIC = "#c9c8c3";
const hue = (i: number) => `hsl(${(i * 67 + 20) % 360}, 58%, 64%)`; // comma syntax: three.js does not read the space-separated form
const reduced = () => typeof document !== "undefined" && document.documentElement.dataset["motion"] === "reduce";

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * Keeps each note's label glued to its sphere, and keeps the screen readable: labels are placed most important first (the selected
 * note, then its neighbours, search matches, hubs), and any label that would sit on top of one already placed is hidden, up to a
 * cap that's smaller on a phone. Zoom in and more of them fit. Labels are ordinary page elements, so they are real buttons.
 */
function LabelProjector({ anchors, labels, priority }: { anchors: Map<string, Vec3>; labels: { current: Map<string, HTMLElement> }; priority: (id: string) => number }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const max = size.width < 640 ? 9 : 26;
    const items: { el: HTMLElement; x: number; y: number; w: number; p: number }[] = [];
    for (const [id, el] of labels.current) {
      const a = anchors.get(id);
      if (!a) continue;
      v.set(a[0], a[1], a[2]).project(camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) { el.style.display = "none"; continue; }
      const w = Math.min(200, (el.textContent?.length ?? 8) * 7 + 12);
      items.push({ el, x: Math.min(size.width - w / 2 - 4, Math.max(w / 2 + 4, (v.x * 0.5 + 0.5) * size.width)), y: (-v.y * 0.5 + 0.5) * size.height, w, p: priority(id) - v.z * 4 });
    }
    items.sort((x, y) => y.p - x.p);
    const placed: [number, number, number, number][] = [];
    let shown = 0;
    for (const it of items) {
      const box: [number, number, number, number] = [it.x - it.w / 2, it.y, it.x + it.w / 2, it.y + 20];
      const must = it.p >= 500; // the selected note and its neighbours always show
      if (!must && (shown >= max || placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]))) { it.el.style.display = "none"; continue; }
      placed.push(box); shown++;
      it.el.style.display = "";
      it.el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, 0)`;
    }
  });
  return null;
}

/** Every note as a point in 3D space, joined by the links you wrote and by connections found automatically. */
export default function VaultGraph3D({ notes, links, folders = [], focusId, showAuto = true, inTopic, highlight, select, onOpen, onAddLink, onRemoveLink, onStats }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const folderIndex = useMemo(() => new Map(folders.map((f, i) => [f.id, i])), [folders]);

  const { edges, auto, seen: writtenKeys } = useMemo(() => {
    const written: Edge[] = [];
    const seen = new Set<string>();
    for (const l of links) {
      if (!byId.has(l.from_note_id) || !byId.has(l.to_note_id) || l.from_note_id === l.to_note_id) continue;
      const k = pairKey(l.from_note_id, l.to_note_id);
      if (seen.has(k)) continue;
      seen.add(k);
      written.push({ a: l.from_note_id, b: l.to_note_id, kind: "written", linkId: l.id });
    }
    const rel: Related[] = showAuto ? relatedPairs(notes, { skip: seen }) : [];
    const autoEdges: Edge[] = rel.map((r) => ({ a: r.a, b: r.b, kind: "auto", shared: r.shared }));
    return { edges: [...written, ...autoEdges], auto: autoEdges.length, seen };
  }, [notes, links, byId, showAuto]);

  const degree = useMemo(() => { const d = new Map<string, number>(); for (const e of edges) { d.set(e.a, (d.get(e.a) ?? 0) + 1); d.set(e.b, (d.get(e.b) ?? 0) + 1); } return d; }, [edges]);
  const orphans = useMemo(() => notes.filter((n) => !degree.has(n.id)).map((n) => n.id), [notes, degree]);

  // Keyed by content, not identity: the parent re-renders when it gets this, and a fresh array each time would loop forever.
  const orphanKey = orphans.join(",");
  useEffect(() => { onStats?.({ notes: notes.length, links: edges.length - auto, auto, orphans }); }, [notes.length, edges.length, auto, orphanKey, onStats]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connected notes are laid out by their links; notes nothing connects to yet sit on an outer shell, so they stay in view without crowding the map.
  const layoutKey = `${notes.map((n) => n.id).sort().join(",")}#${edges.map((e) => pairKey(e.a, e.b)).sort().join(",")}`;
  const pos = useMemo(() => {
    const linked = notes.filter((n) => degree.has(n.id)).map((n) => n.id);
    const out = forceLayout3d(linked.length ? linked : notes.map((n) => n.id), edges.map((e) => [e.a, e.b] as [string, string]));
    if (linked.length && orphans.length) {
      const R = Math.max(4, ...[...out.values()].map((p) => Math.hypot(...p))) * 1.3 + 1.5;
      orphans.forEach((id, i) => {
        const y = orphans.length === 1 ? 0.3 : 1 - (2 * (i + 0.5)) / orphans.length, ring = Math.sqrt(1 - y * y), t = i * 2.399963;
        out.set(id, [R * ring * Math.cos(t), R * y, R * ring * Math.sin(t)]);
      });
    }
    return out;
  }, [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const radius = useMemo(() => Math.max(4, ...[...pos.values()].map((p) => Math.hypot(...p))), [pos]);

  const radiusOf = (id: string) => (degree.has(id) ? 0.3 + Math.min(0.5, (degree.get(id) ?? 0) * 0.08) : 0.2);
  const labelRefs = useRef(new Map<string, HTMLElement>());
  const anchors = useMemo(() => new Map(notes.flatMap((n) => { const p = pos.get(n.id); return p ? [[n.id, [p[0], p[1] - radiusOf(n.id) - 0.35, p[2]] as Vec3] as const] : []; })), [notes, pos, degree]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorOf = (n: VNote) => (n.folder_id && folderIndex.has(n.folder_id) ? hue(folderIndex.get(n.folder_id)!) : NO_TOPIC);
  const touching = (id: string) => edges.filter((e) => e.a === id || e.b === id);
  const neighbours = useMemo(() => new Set(selected ? touching(selected).flatMap((e) => [e.a, e.b]) : []), [selected, edges]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = selected ? byId.get(selected) : undefined;
  useEffect(() => { if (select && byId.has(select.id)) setSelected(select.id); }, [select?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // How much a label deserves to be shown when space is short.
  const priority = (id: string) => (id === selected ? 1000 : id === focusId ? 900 : neighbours.has(id) ? 500 : highlight?.has(id) ? 800 : (degree.get(id) ?? 0) * 8);
  // Notes that aren't connected yet may still have something in common: offer the closest few, to connect with one tap.
  const possible = useMemo(() => (sel && !degree.has(sel.id)
    ? relatedPairs(notes, { minScore: 0.03, perNote: 1000, skip: writtenKeys }).filter((r) => r.a === sel.id || r.b === sel.id).slice(0, 3) : []), [sel?.id, notes, writtenKeys, degree]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (
    <div className="p-6 text-sm text-muted-foreground">
      <p>3D isn't available on this device. Here are the connections instead.</p>
      <ul className="mt-3 space-y-1">{edges.map((e) => <li key={pairKey(e.a, e.b)}>{byId.get(e.a)?.title} ↔ {byId.get(e.b)?.title} <span className="text-xs">({e.kind === "written" ? "written link" : `automatic: ${e.shared?.join(", ")}`})</span></li>)}</ul>
    </div>
  );

  if (notes.length < 2) {
    return <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground" data-graph-empty>Write a few notes and they connect here, in 3D, as you go.</div>;
  }

  return (
    <div className="relative h-full w-full bg-[radial-gradient(ellipse_at_50%_42%,#18181a_0%,#0b0b0c_55%,#060607_100%)]" data-graph3d data-scene>
      <ZoomButtons className="right-3 top-2.5" />
      <Boundary fallback={list}>
        <Canvas camera={{ position: [0, radius * 0.35, Math.max(9, radius * 2.5)], fov: 50 }} onPointerMissed={() => setSelected(null)} gl={{ antialias: true }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[6, 8, 6]} intensity={1.6} />
          {edges.map((e) => {
            const a = pos.get(e.a), b = pos.get(e.b);
            if (!a || !b) return null;
            const on = !selected || e.a === selected || e.b === selected;
            return e.kind === "written"
              ? <Line key={`w-${pairKey(e.a, e.b)}`} points={[a, b]} color={on ? "#e8e7e3" : "#55544f"} lineWidth={on ? 1.8 : 1} transparent opacity={on ? 0.95 : 0.35} />
              : <Line key={`a-${pairKey(e.a, e.b)}`} points={[a, b]} color={on ? "#8fb8e8" : "#3f5468"} lineWidth={1.2} dashed dashSize={0.28} gapSize={0.22} transparent opacity={on ? 0.9 : 0.3} />;
          })}
          {notes.map((n) => {
            const p = pos.get(n.id) as Vec3 | undefined;
            if (!p) return null;
            const r = radiusOf(n.id);
            const isSel = n.id === selected, near = neighbours.has(n.id);
            const outside = !!inTopic && !inTopic.has(n.id);
            const lone = !degree.has(n.id);
            const dim = (!!selected && !isSel && !near) || (!!highlight && highlight.size > 0 && !highlight.has(n.id)) || false;
            return (
              <group key={n.id} position={p}>
                <mesh onClick={(e) => { e.stopPropagation(); setSelected(n.id === selected ? null : n.id); }} onDoubleClick={(e) => { e.stopPropagation(); onOpen(n); }}>
                  <sphereGeometry args={[r, 28, 20]} />
                  <meshStandardMaterial color={lone ? "#8a8984" : colorOf(n)} emissive={lone ? "#8a8984" : colorOf(n)} emissiveIntensity={isSel ? 0.7 : n.id === focusId ? 0.5 : 0.12} roughness={0.5} transparent opacity={dim ? 0.2 : lone ? 0.6 : outside ? 0.55 : 1} />
                </mesh>
              </group>
            );
          })}
          <LabelProjector anchors={anchors} labels={labelRefs} priority={priority} />
          <PinchZoom />
          <OrbitControls makeDefault enableDamping autoRotate={!reduced() && !selected} autoRotateSpeed={0.45} minDistance={3} maxDistance={radius * 6} />
        </Canvas>
      </Boundary>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" role="group" aria-label="Notes in the graph">
        {notes.map((n) => {
          const isSel = n.id === selected, near = neighbours.has(n.id);
          const dim = (!!selected && !isSel && !near) || (!!highlight && highlight.size > 0 && !highlight.has(n.id));
          const outside = !!inTopic && !inTopic.has(n.id);
          const lone = !degree.has(n.id);
          return (
            <button key={n.id} type="button" ref={(el) => { if (el) labelRefs.current.set(n.id, el); else labelRefs.current.delete(n.id); }}
              data-graph-node data-note-id={n.id} aria-pressed={isSel} onClick={() => setSelected(n.id === selected ? null : n.id)} onDoubleClick={() => onOpen(n)}
              style={{ transform: "translate(-9999px, -9999px)" }}
              className={`pointer-events-auto absolute left-0 top-0 max-w-[11rem] truncate whitespace-nowrap rounded px-1 text-[12px] font-medium [text-shadow:0_1px_8px_#000,0_0_2px_#000] hover:bg-white/10 sm:max-w-[14rem] sm:text-[12.5px] ${lone ? "text-[#a3a29c]" : "text-[#e8e7e3]"} ${dim ? "opacity-30" : outside || lone ? "opacity-80" : ""}`}>
              {outside ? "↗ " : ""}{n.title || "Untitled"}
            </button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute left-3 top-2.5 space-y-1 text-[11px] text-[#8a8984]" data-graph-legend>
        <p className="flex items-center gap-2"><span className="inline-block h-px w-5 bg-[#e8e7e3]" /> linked</p>
        {showAuto && <p className="flex items-center gap-2"><span className="inline-block w-5 border-t border-dashed border-[#8fb8e8]" /> related</p>}
        {orphans.length > 0 && <p className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-[#8a8984]/70" /> not connected yet ({orphans.length})</p>}
        <p className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-[#55544f] sm:block pointer-coarse:hidden">Drag to orbit · scroll to zoom · click a note · double-click to open</p>
      </div>

      {sel && (
        <div className="absolute inset-x-2 bottom-[calc(var(--tabbar,0px)+0.5rem)] rounded-xl border border-[#26262a] bg-[#111113]/95 p-3.5 text-[#e8e7e3] backdrop-blur sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[360px]" role="dialog" aria-label={sel.title} data-graph-card>
          <div className="flex items-start justify-between gap-2">
            <p className="font-serif text-lg leading-snug">{sel.title || "Untitled"}</p>
            <button onClick={() => setSelected(null)} aria-label="Close" className="text-[#8a8984] hover:text-white">×</button>
          </div>
          {sel.folder_id && folders.find((f) => f.id === sel.folder_id) && <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8a8984]">{folders.find((f) => f.id === sel.folder_id)!.name}</p>}
          <ul className="mt-2.5 max-h-36 space-y-1.5 overflow-auto text-[13px] sm:max-h-44">
            {touching(sel.id).map((e) => {
              const otherId = e.a === sel.id ? e.b : e.a, other = byId.get(otherId);
              return (
                <li key={pairKey(e.a, e.b)} className="flex items-start gap-2">
                  <span className={`mt-1.5 inline-block w-4 shrink-0 border-t ${e.kind === "written" ? "border-[#e8e7e3]" : "border-dashed border-[#8fb8e8]"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <button onClick={() => setSelected(otherId)} className="font-medium hover:underline">{other?.title || "Untitled"}</button>
                    <span className="block text-xs text-[#8a8984]">{e.kind === "written" ? "linked in the note" : `shares: ${e.shared?.join(", ")}`}</span>
                  </span>
                  {e.kind === "auto" && onAddLink && <button onClick={() => void onAddLink(e.a, e.b, `shares ${e.shared?.slice(0, 3).join(", ")}`)} className="shrink-0 rounded-md border border-[#2a2a2e] px-2 py-0.5 text-xs hover:bg-[#1c1c1f]">Keep link</button>}
                  {e.kind === "written" && e.linkId && onRemoveLink && <button onClick={() => onRemoveLink(e.linkId!)} className="shrink-0 rounded-md border border-[#2a2a2e] px-2 py-0.5 text-xs hover:bg-[#1c1c1f]">Remove</button>}
                </li>
              );
            })}
            {!touching(sel.id).length && <li className="text-xs text-[#8a8984]">Not connected to anything yet.{possible.length ? " These come closest:" : ""}</li>}
            {possible.map((r) => {
              const otherId = r.a === sel.id ? r.b : r.a, other = byId.get(otherId);
              return (
                <li key={`p-${otherId}`} className="flex items-start gap-2">
                  <span className="mt-1.5 inline-block w-4 shrink-0 border-t border-dotted border-[#8fb8e8]" aria-hidden />
                  <span className="min-w-0 flex-1"><button onClick={() => setSelected(otherId)} className="font-medium hover:underline">{other?.title || "Untitled"}</button><span className="block text-xs text-[#8a8984]">shares: {r.shared.join(", ")}</span></span>
                  {onAddLink && <button onClick={() => void onAddLink(r.a, r.b, `shares ${r.shared.slice(0, 3).join(", ")}`)} className="shrink-0 rounded-md border border-[#2a2a2e] px-2 py-0.5 text-xs hover:bg-[#1c1c1f]">Connect</button>}
                </li>
              );
            })}
          </ul>
          <button onClick={() => onOpen(sel)} className="mt-3 rounded-md bg-[#e8e7e3] px-3 py-1.5 text-sm font-medium text-[#0b0b0c]">Open note</button>
        </div>
      )}
    </div>
  );
}
