import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Html, Lightformer, OrbitControls } from '@react-three/drei';
import { Box3, BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, LoadingManager, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import type { OrbitControls as Controls } from 'three-stdlib';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { explodeOffset, findPath, validateSpec, type Part, type Spec, type Vec3 } from '@/lib/model3d';
import { generateModelSpec } from '@/lib/ai/tasks';
export type ModelViewerProps = { spec: Spec; onSpecChange?: (spec: Spec) => void; glbUrl?: string; focusPartId?: string; compact?: boolean };
type Loaded = { parts: Part[]; geometry: Map<string, BufferGeometry> };
const reduced = () => document.documentElement.dataset["motion"] === 'reduce';
function geometryFor(p: Part) {
  const [x = 1, y = 1, z = 1] = p.size;
  switch (p.shape) {
    case 'box': return new BoxGeometry(x, y, z);
    case 'sphere': return new SphereGeometry(0.5, 24, 16).scale(x, y, z);
    case 'cylinder': return new CylinderGeometry(0.5, 0.5, 1, 24).scale(x, y, z);
    case 'cone': return new ConeGeometry(0.5, 1, 24).scale(x, y, z);
    case 'torus': return new TorusGeometry(0.35, 0.15, 12, 32).scale(x, y, z);
    case 'capsule': return new CapsuleGeometry(0.25, 0.5, 6, 16).scale(x, y, z);
  }
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
class CanvasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function Piece({ part, geometry, t, selected, dim, labels, select, focus }: {
  part: Part; geometry?: BufferGeometry; t: number; selected: boolean; dim: boolean; labels: boolean; select: () => void; focus: () => void;
}) {
  const mesh = useRef<Mesh>(null);
  const generated = useMemo(() => geometry ? null : geometryFor(part), [part.shape, part.size.join(','), geometry]);
  useEffect(() => () => { generated?.dispose(); }, [generated]);
  useFrame((_, dt) => {
    if (!mesh.current) return;
    const offset = explodeOffset(part, t, 3);
    const target = new Vector3(...part.position).add(new Vector3(...offset));
    if (reduced()) mesh.current.position.copy(target);
    else mesh.current.position.lerp(target, 1 - Math.exp(-12 * dt));
  });
  return <mesh ref={mesh} geometry={geometry ?? generated!} dispose={null} position={part.position} rotation={part.rotation}
    onClick={e => { e.stopPropagation(); select(); }} onDoubleClick={e => { e.stopPropagation(); focus(); }}>
    <meshStandardMaterial color={part.color} transparent={dim} opacity={dim ? 0.2 : 1} emissive={part.color} emissiveIntensity={selected ? 0.35 : 0} roughness={0.6} />
    {labels && <Html center distanceFactor={12}><button className="rounded border bg-background px-2 py-1 text-xs text-foreground shadow" onClick={select}>{part.name}</button></Html>}
  </mesh>;
}
function Camera({ target, reset, rotate, radius }: { target: Vec3; reset: number; rotate: boolean; radius: number }) {
  const controls = useRef<Controls>(null), { camera } = useThree();
  useEffect(() => {
    controls.current?.target.set(...target);
    camera.position.set(target[0] + radius, target[1] + radius * 0.7, target[2] + radius);
    controls.current?.update();
  }, [camera, target[0], target[1], target[2], reset, radius]);
  return <OrbitControls ref={controls} makeDefault enablePan enableZoom enableDamping={!reduced()} autoRotate={rotate && !reduced()} minDistance={0.1} maxDistance={500} />;
}
export default function ModelViewer({ spec, onSpecChange, glbUrl, focusPartId, compact = false }: ModelViewerProps) {
  const [root, setRoot] = useState(() => validateSpec(spec)), [path, setPath] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null), [error, setError] = useState('');
  const [selectedId, setSelected] = useState<string | null>(focusPartId ?? null), [hidden, setHidden] = useState<Set<string>>(new Set());
  const [isolate, setIsolate] = useState<string | null>(null), [search, setSearch] = useState('');
  const [explode, setExplode] = useState(0), [labels, setLabels] = useState(false), [rotate, setRotate] = useState(false);
  const [focus, setFocus] = useState<Vec3>([0, 0, 0]), [radius, setRadius] = useState(8), [reset, setReset] = useState(0);
  const [tour, setTour] = useState<number | null>(null), [busy, setBusy] = useState(false), [webgl, setWebgl] = useState(true);
  const container = useRef<HTMLDivElement>(null), group = useRef<Group>(null), canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { setRoot(validateSpec(spec)); }, [spec]);
  // Frame the whole model: centre the camera on the parts and back off by their extent.
  useEffect(() => {
    if (glbUrl || !root.parts.length) return;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of root.parts) for (let i = 0; i < 3; i++) {
      const h = Math.max(...p.size.map(Math.abs), 0.1) / 2, v = p.position[i] ?? 0;
      lo[i] = Math.min(lo[i]!, v - h); hi[i] = Math.max(hi[i]!, v + h);
    }
    const c: Vec3 = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
    const ext = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!, 0.5);
    setFocus(c); setRadius(ext * 1.1);
  }, [root, glbUrl]);
  useEffect(() => { if (focusPartId) setSelected(focusPartId); }, [focusPartId]);
  useEffect(() => {
    const c = document.createElement('canvas');
    const context = c.getContext('webgl2') || c.getContext('webgl');
    setWebgl(Boolean(context)); context?.getExtension('WEBGL_lose_context')?.loseContext();
  }, []);
  useEffect(() => {
    if (!glbUrl) { setLoaded(null); return; }
    let alive = true; const abort = new AbortController(), geometry = new Map<string, BufferGeometry>();
    setLoaded(null); setError('');
    const manager = new LoadingManager();
    // A GLB must be self-contained; do not follow arbitrary external resource URLs.
    manager.setURLModifier(url => { if (url.startsWith('data:') || url.startsWith('blob:')) return url; throw new Error('Use a self-contained GLB without external resources.'); });
    void (async () => {
      const response = await fetch(glbUrl, { signal: abort.signal });
      if (!response.ok) throw new Error('Model link expired or could not be loaded. Refresh to get a new link.');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('GLB files must be 25 MB or smaller.');
      const gltf = await new GLTFLoader(manager).parseAsync(bytes, '');
      const materials = new Set<import('three').Material>(), textures = new Set<import('three').Texture>();
      try {
        gltf.scene.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(gltf.scene), center = bounds.getCenter(new Vector3());
        const size = bounds.getSize(new Vector3()), scale = 6 / Math.max(size.x, size.y, size.z, 0.001);
        const parts: Part[] = [];
        gltf.scene.traverse(node => {
          if (!(node instanceof Mesh)) return;
          const id = `mesh-${parts.length + 1}`;
          const g = node.geometry.clone().applyMatrix4(node.matrixWorld);
          g.translate(-center.x, -center.y, -center.z).scale(scale, scale, scale); g.computeBoundingBox();
          const c = g.boundingBox!.getCenter(new Vector3()); g.translate(-c.x, -c.y, -c.z); geometry.set(id, g);
          const material = Array.isArray(node.material) ? node.material[0] : node.material;
          const color = material && 'color' in material ? `#${(material as MeshStandardMaterial).color.getHexString()}` : '#60a5fa';
          parts.push(validateSpec({ parts: [{ id, name: node.name || node.parent?.name || `Mesh ${parts.length + 1}`, shape: 'box', color, position: c.toArray(), explode_direction: c.length() ? c.clone().normalize().toArray() : [0, 1, 0] }] }).parts[0]!);
          for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
            materials.add(m);
            for (const v of Object.values(m)) if (v && typeof v === 'object' && 'isTexture' in v) textures.add(v as import('three').Texture);
          }
        });
        if (!parts.length) throw new Error('This GLB contains no mesh parts.');
        if (alive) setLoaded({ parts, geometry });
      } finally {
        gltf.scene.traverse(n => { if (n instanceof Mesh) n.geometry.dispose(); });
        materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
        if (!alive) geometry.forEach(g => g.dispose());
      }
    })().catch(e => { if (alive && !abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load GLB.'); });
    return () => { alive = false; abort.abort(); geometry.forEach(g => g.dispose()); };
  }, [glbUrl]);
  const crumbs = findPath(root, path);
  const current = crumbs.at(-1)?.children_model ?? root;
  const parts = glbUrl ? loaded?.parts ?? [] : current.parts;
  const selected = parts.find(p => p.id === selectedId);
  const ordered = useMemo(() => [...parts].sort((a, b) => a.assembly_order - b.assembly_order), [parts]);
  const framePart = (p: Part) => {
    const d = explodeOffset(p, explode, 3);
    setFocus(p.position.map((v, i) => v + (d[i] ?? 0)) as Vec3);
    setRadius(Math.max(...p.size, 0.6) * 2); setReset(v => v + 1); setSelected(p.id);
    setHidden(old => new Set([...old].filter(id => id !== p.id))); setIsolate(null);
  };
  useEffect(() => { if (focusPartId) { const p = parts.find(p => p.id === focusPartId); if (p) framePart(p); } }, [focusPartId, loaded]);
  useEffect(() => { if (tour !== null && ordered.length) { const p = ordered[Math.min(tour, ordered.length - 1)]; if (p) framePart(p); } }, [tour]);
  const navigate = (next: string[]) => { setPath(next); setSelected(null); setHidden(new Set()); setIsolate(null); setTour(null); setExplode(0); setFocus([0, 0, 0]); setRadius(8); setReset(v => v + 1); };
  const commit = (next: Spec) => { setRoot(next); onSpecChange?.(next); };
  const replaceCurrent = (next: Spec) => {
    const replace = (s: Spec, level: number): Spec => level === path.length ? next : { ...s, parts: s.parts.map(p => p.id === path[level] && p.children_model ? { ...p, children_model: replace(p.children_model, level + 1) } : p) };
    commit(replace(root, 0));
  };
  const edit = (patch: Partial<Part>) => { if (selected) replaceCurrent({ ...current, parts: parts.map(p => p.id === selected.id ? { ...p, ...patch } : p) }); };
  const generate = async (breakdown: boolean) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await generateModelSpec({ concept: breakdown && selected ? selected.name : current.title, context: breakdown && selected ? `${current.summary}\n${selected.description}` : current.summary });
      if (!response.ok) throw new Error(response.error);
      const normalized = validateSpec(response.spec, breakdown ? path.length + 1 : path.length);
      if (breakdown && selected) edit({ children_model: normalized }); else replaceCurrent(normalized);
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed.'); } finally { setBusy(false); }
  };
  const fallback = <p className="rounded border bg-muted p-4 text-muted-foreground">3D is unavailable on this device. Explore the parts below instead.</p>;
  const editable = !glbUrl;
  const checklist = <div className="space-y-2">
    <label className="block text-sm">Search parts<input className="mt-1 w-full rounded border bg-background p-2" value={search} onChange={e => setSearch(e.target.value)} /></label>
    <ul className="max-h-64 space-y-2 overflow-auto">{parts.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => <li key={p.id} className="flex items-center gap-2">
      <input type="checkbox" aria-label={`Show ${p.name}`} checked={!hidden.has(p.id)} onChange={e => setHidden(old => { const n = new Set(old); if (e.target.checked) n.delete(p.id); else n.add(p.id); return n; })} />
      <button className="min-h-10 flex-1 text-left text-sm underline-offset-4 hover:underline" aria-pressed={selectedId === p.id} onClick={() => setSelected(p.id)}>{p.name}</button>
      <Button variant="outline" size="sm" aria-pressed={isolate === p.id} onClick={() => setIsolate(isolate === p.id ? null : p.id)}>Isolate</Button>
    </li>)}</ul>
  </div>;
  return <div ref={container} className="space-y-3 rounded-xl border bg-background p-3 text-foreground">
    <h3 className="font-semibold">{root.title}</h3>
    {editable && <p className="text-xs text-muted-foreground">Simplified schematic, not to scale</p>}
    {!!path.length && <nav aria-label="Model breadcrumbs" className="flex flex-wrap gap-2 text-sm"><button onClick={() => navigate([])}>{root.title}</button>{crumbs.map((p, i) => <button key={p.id} onClick={() => navigate(path.slice(0, i + 1))}>/ {p.name}</button>)}</nav>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {glbUrl && !loaded && !error && <p role="status">Loading uploaded model…</p>}
    {webgl ? <CanvasBoundary fallback={fallback}><div className={compact ? 'h-64' : 'h-80 sm:h-[28rem]'} aria-label="Interactive 3D model. Use the parts list for keyboard navigation.">
      <Canvas camera={{ position: [8, 6, 8], near: 0.01, far: 1000 }} gl={{ preserveDrawingBuffer: true }} onCreated={({ gl }) => { canvas.current = gl.domElement; }} onPointerMissed={() => setSelected(null)}>
        <ambientLight intensity={0.8} /><directionalLight position={[5, 8, 5]} intensity={2} />
        <Environment resolution={128}><Lightformer position={[0, 5, -4]} scale={[10, 10, 1]} intensity={2} /></Environment>
        <group ref={group}>{parts.filter(p => !hidden.has(p.id) && (!isolate || isolate === p.id)).map(p => <Piece key={`${path.join('/')}/${p.id}`} part={p} {...(loaded?.geometry.get(p.id) ? { geometry: loaded.geometry.get(p.id)! } : {})} t={parts.length < 2 ? 0 : explode} selected={p.id === selectedId} dim={!!selectedId && p.id !== selectedId} labels={labels} select={() => setSelected(p.id)} focus={() => framePart(p)} />)}</group>
        <Camera target={focus} reset={reset} radius={radius} rotate={rotate} />
      </Canvas></div></CanvasBoundary> : fallback}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => { setFocus([0, 0, 0]); setRadius(8); setReset(v => v + 1); setHidden(new Set()); setIsolate(null); setSelected(null); setTour(null); setExplode(0); setRotate(false); }}>Reset</Button>
      <Button variant="outline" size="sm" aria-pressed={rotate} disabled={reduced()} onClick={() => setRotate(!rotate)}>Auto-rotate</Button>
      <Button variant="outline" size="sm" aria-pressed={labels} onClick={() => setLabels(!labels)}>Labels</Button>
      <Button variant="outline" size="sm" onClick={() => { void (document.fullscreenElement ? document.exitFullscreen() : container.current?.requestFullscreen())?.catch(() => setError('Fullscreen is not available in this browser.')); }}>Fullscreen</Button>
      <Button variant="outline" size="sm" onClick={() => { try { canvas.current?.toBlob(b => { if (b) saveBlob(b, 'concept.png'); else setError('Could not capture snapshot.'); }); } catch { setError('Could not capture snapshot.'); } }} disabled={!webgl}>PNG snapshot</Button>
      {editable && <Button variant="outline" size="sm" disabled={!webgl} onClick={async () => { try {
        if (!group.current) return;
        const result = await new GLTFExporter().parseAsync(group.current, { binary: true });
        if (result instanceof ArrayBuffer) saveBlob(new Blob([result], { type: 'model/gltf-binary' }), 'concept.glb');
      } catch { setError('Could not export GLB.'); } }}>Export GLB</Button>}
    </div>
    <label className="block text-sm">Explode {Math.round(explode * 100)}%<input className="mt-2 w-full accent-primary" aria-label="Explode assembly" type="range" min="0" max="100" value={explode * 100} disabled={parts.length < 2} onChange={e => setExplode(Number(e.target.value) / 100)} /></label>
    {parts.length === 1 && <p className="text-sm text-muted-foreground">This model has a single mesh, so there are no separate parts to explode.</p>}
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={() => setExplode(0)}>Reassemble</Button>
      <Button variant="outline" size="sm" disabled={!parts.length} onClick={() => setTour(tour === null ? 0 : null)}>{tour === null ? 'Tour assembly' : 'End tour'}</Button>
      {tour !== null && <><Button variant="outline" size="sm" disabled={tour === 0} onClick={() => setTour(Math.max(0, tour - 1))}>Previous</Button><span aria-live="polite" className="text-sm">{tour + 1} / {ordered.length}</span><Button variant="outline" size="sm" disabled={tour >= ordered.length - 1} onClick={() => setTour(tour + 1)}>Next</Button></>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">{checklist}{selected && <section aria-label="Selected part" className="space-y-2 rounded-lg border p-3">
      <h4 className="font-medium">{selected.name}</h4><p className="text-sm text-muted-foreground">{selected.description || 'Uploaded mesh; description not provided.'}</p>
      <Button variant="outline" size="sm" onClick={() => framePart(selected)}>Zoom to part</Button>
      {editable ? <><label className="block text-sm">Part note<textarea className="mt-1 w-full rounded border bg-background p-2" value={selected.note ?? ''} onChange={e => edit({ note: e.target.value })} /></label>
        <label className="block text-sm">Name<input className="mt-1 w-full rounded border bg-background p-2" value={selected.name} maxLength={160} onChange={e => edit({ name: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm">Color<input type="color" value={selected.color} onChange={e => edit({ color: e.target.value })} /></label>
        <Button variant="destructive" size="sm" onClick={() => { replaceCurrent({ ...current, parts: parts.filter(p => p.id !== selected.id) }); setSelected(null); }}>Delete part</Button>
        {selected.children_model && <Button variant="outline" size="sm" onClick={() => navigate([...path, selected.id])}>Break this down</Button>}
        {!selected.children_model && path.length < 2 && <Button variant="outline" size="sm" disabled={busy} onClick={() => void generate(true)}>{busy ? 'Generating…' : 'Generate breakdown'}</Button>}
      </> : <p className="text-xs text-muted-foreground">Uploaded meshes are read-only; use isolate, hide and zoom to explore them.</p>}
    </section>}</div>
    {editable && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={busy}>Regenerate</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Replace this schematic?</AlertDialogTitle><AlertDialogDescription>This replaces the current assembly, including its part notes and breakdowns. Other breadcrumb levels are kept.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void generate(false)}>Regenerate</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
  </div>;
}
