import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Minus, Plus } from "lucide-react";
import type { OrbitControls } from "three-stdlib";

/**
 * Zoom for the 3D views inside the phone apps, where the page itself is locked against zoom. Two-finger pinch (WebKit's
 * gesture events) and the + and − buttons both move the camera along its view of the target, within the controls' limits.
 * Put <PinchZoom /> inside a <Canvas> whose controls use makeDefault, and <ZoomButtons /> in the wrapper marked data-scene.
 */
export const SCENE_ZOOM = "scene-zoom";

export function PinchZoom() {
  const { gl, camera, controls } = useThree();
  useEffect(() => {
    const c = controls as unknown as OrbitControls | null;
    if (!c) return;
    const el = gl.domElement, scope = el.closest("[data-scene]") ?? el;
    if (import.meta.env.DEV) (window as unknown as { __scene?: unknown }).__scene = { camera, controls: c }; // for the browser checks; not in production builds
    const to = (distance: number) => {
      const dir = camera.position.clone().sub(c.target).normalize();
      camera.position.copy(c.target).addScaledVector(dir, Math.min(c.maxDistance, Math.max(c.minDistance, distance)));
      c.update();
    };
    let start = 1, was = true;
    const gStart = (e: Event) => { e.preventDefault(); was = c.enableZoom; c.enableZoom = false; start = camera.position.distanceTo(c.target); };
    const gChange = (e: Event) => { e.preventDefault(); to(start / ((e as Event & { scale?: number }).scale || 1)); };
    const gEnd = () => { c.enableZoom = was; };
    const step = (e: Event) => to(camera.position.distanceTo(c.target) / ((e as CustomEvent<number>).detail || 1));
    el.addEventListener("gesturestart", gStart, { passive: false });
    el.addEventListener("gesturechange", gChange, { passive: false });
    el.addEventListener("gestureend", gEnd);
    scope.addEventListener(SCENE_ZOOM, step);
    return () => {
      el.removeEventListener("gesturestart", gStart); el.removeEventListener("gesturechange", gChange); el.removeEventListener("gestureend", gEnd);
      scope.removeEventListener(SCENE_ZOOM, step);
    };
  }, [gl, camera, controls]);
  return null;
}

/** Zoom buttons that always work, for anyone who can't or doesn't want to pinch. */
export function ZoomButtons({ className = "bottom-3 right-3" }: { className?: string }) {
  const zoom = (factor: number) => (e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.closest("[data-scene]")?.dispatchEvent(new CustomEvent(SCENE_ZOOM, { detail: factor }));
  const btn = "grid h-10 w-10 place-items-center rounded-full border bg-background/80 text-foreground shadow backdrop-blur hover:bg-secondary";
  return (
    <div className={`absolute z-10 flex flex-col gap-1.5 ${className}`} data-zoom-buttons>
      <button type="button" aria-label="Zoom in" className={btn} onClick={zoom(1.35)}><Plus className="h-4 w-4" /></button>
      <button type="button" aria-label="Zoom out" className={btn} onClick={zoom(1 / 1.35)}><Minus className="h-4 w-4" /></button>
    </div>
  );
}
