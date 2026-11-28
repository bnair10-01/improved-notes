import { PinchZoom, ZoomButtons } from "@/components/scene/SceneZoom";
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, Lightformer, Line, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { branchIndex, rootId, type MindMap } from "@/lib/mindmap-types";
import { layout3d } from "./layout3d";
import { NoteIcon } from "./NodeVault";

const LIGHT = ["#f4c7c3", "#c8e6c0", "#c3d7f4", "#f4e2b0", "#ddc8f0", "#bfe6e4", "#f4d2b8"];
const DARK = ["#a86a66", "#6f9a68", "#6a86b0", "#a8924f", "#8a70a8", "#5e9a96", "#a87c5e"];

type Props = {
  map: MindMap;
  visible: Set<string>;
  selected: string | null;
  neighbours: Set<string> | null;
  onSelect: (id: string | null) => void;
  dark: boolean;
};

function Fly({ target }: { target: THREE.Vector3 | null }) {
  const { camera, controls } = useThree();
  const goal = useRef<THREE.Vector3 | null>(null);
  useEffect(() => { goal.current = target ? target.clone() : null; }, [target]);
  useFrame((_, delta) => {
    const c = controls as unknown as OrbitImpl | null;
    if (!c || !goal.current) return;
    const k = document.documentElement.dataset["motion"] === "reduce" ? 1 : 1 - Math.exp(-4 * Math.min(delta, 0.05));
    const offset = camera.position.clone().sub(c.target);
    c.target.lerp(goal.current, k);
    const wanted = goal.current.clone().add(offset.setLength(Math.max(7, Math.min(offset.length(), 14))));
    camera.position.lerp(wanted, k);
    c.update();
    if (c.target.distanceTo(goal.current) < 0.01) goal.current = null;
  });
  return null;
}

function Scene({ map, visible, selected, neighbours, onSelect, dark }: Props) {
  const pos = useMemo(() => layout3d(map, visible), [map, visible]);
  const root = rootId(map);
  const palette = dark ? DARK : LIGHT;
  const colour = (id: string) => (id === root ? (dark ? "#7fc4b4" : "#2f6b5e") : palette[(branchIndex(map, id) + 7) % 7]!);
  const target = selected && pos[selected] ? new THREE.Vector3(...pos[selected]) : null;
  const ink = dark ? "#f3ede2" : "#3a3128";

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 10, 6]} intensity={1.2} />
      <Environment resolution={64}>
        <Lightformer intensity={2} position={[0, 6, 0]} scale={[10, 10, 1]} />
        <Lightformer intensity={1} color="#d8c8a8" position={[-6, 1, -2]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
      {dark && <Stars radius={60} depth={30} count={1200} factor={2} fade />}
      <OrbitControls makeDefault enableDamping enablePan autoRotate={!selected} autoRotateSpeed={0.4} minDistance={3} maxDistance={60} />
      <Fly target={target} />
      <PinchZoom />

      {map.edges.filter((e) => pos[e.from] && pos[e.to]).map((e, i) => {
        const crossLink = e.kind === "cross_link";
        const faded = neighbours && !(neighbours.has(e.from) && neighbours.has(e.to) && (e.from === selected || e.to === selected));
        const a = pos[e.from]!, b = pos[e.to]!;
        const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (crossLink ? 1.2 : 0), (a[2] + b[2]) / 2];
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), new THREE.Vector3(...mid), new THREE.Vector3(...b));
        return (
          <group key={e.id ?? i}>
            <Line points={curve.getPoints(24)} color={crossLink ? ink : colour(e.to)} lineWidth={crossLink ? 1.2 : 2.2} dashed={crossLink} dashSize={0.3} gapSize={0.2} transparent opacity={faded ? 0.12 : crossLink ? 0.7 : 0.9} />
            {crossLink && e.label && !faded && (
              <Html position={curve.getPoint(0.5)} center style={{ pointerEvents: "none" }}>
                <span className="whitespace-nowrap rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">{e.label}</span>
              </Html>
            )}
          </group>
        );
      })}

      {map.nodes.filter((n) => pos[n.id]).map((n) => {
        const r = n.id === root ? 0.9 : n.importance === 3 ? 0.6 : n.importance === 2 ? 0.45 : 0.32;
        const faded = neighbours && !neighbours.has(n.id);
        const isSel = n.id === selected;
        return (
          <group key={n.id} position={pos[n.id]!}>
            <mesh
              onClick={(e) => { e.stopPropagation(); onSelect(n.id); }}
              onPointerOver={() => { document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { document.body.style.cursor = ""; }}
            >
              {n.type === "action" ? <boxGeometry args={[r * 1.5, r * 1.5, r * 1.5]} /> : n.type === "question" ? <octahedronGeometry args={[r * 1.2]} /> : n.type === "detail" ? <icosahedronGeometry args={[r, 0]} /> : <sphereGeometry args={[r, 32, 32]} />}
              <meshStandardMaterial color={colour(n.id)} roughness={0.45} metalness={0.05} transparent opacity={faded ? 0.2 : 1} emissive={colour(n.id)} emissiveIntensity={isSel ? 0.45 : 0.08} />
            </mesh>
            <Html position={[0, r + 0.35, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: "auto", opacity: faded ? 0.25 : 1 }}>
              <span className={`whitespace-nowrap rounded-md px-2 py-0.5 shadow-sm ${n.id === root ? "bg-primary text-base font-semibold text-primary-foreground" : n.importance >= 2 ? "bg-card text-sm font-medium" : "bg-card/90 text-xs"} ${isSel ? "ring-2 ring-ring" : ""}`}>
                {n.type === "action" ? "☐ " : n.type === "question" ? "? " : ""}{n.label}{n.collapsed ? " ▸" : ""}
              </span>
              <NoteIcon node={n} />
            </Html>
          </group>
        );
      })}
    </>
  );
}

export default function Mind3D(props: Props) {
  return (
    <div className="relative h-full w-full" data-scene-ready="" data-scene>
      <ZoomButtons className="bottom-3 right-3" />
      <Canvas
        camera={{ position: [0, 6, 18], fov: 50 }}
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onPointerMissed={() => props.onSelect(null)}
        style={{ touchAction: "none" }}
      >
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
