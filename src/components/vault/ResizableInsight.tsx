import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";

const KEY = "insight-width";
const SLIM = 44, MIN = 260, MAX = 560;
const clamp = (n: number) => (n < 140 ? SLIM : Math.min(MAX, Math.max(MIN, n)));

const initial = () => {
  try { const v = Number(localStorage.getItem(KEY)); if (Number.isFinite(v) && v >= SLIM) return v; } catch { /* storage unavailable */ }
  return typeof window !== "undefined" && window.innerWidth >= 1280 ? 368 : 320;
};

/** The Insight column. Drag its edge to resize; drag it nearly shut and it becomes a slim strip you can open again. */
export function ResizableInsight({ children }: { children: ReactNode }) {
  const [w, setW] = useState(initial);
  const drag = useRef<{ x: number; w: number } | null>(null);
  useEffect(() => { try { localStorage.setItem(KEY, String(w)); } catch { /* storage unavailable */ } }, [w]);
  const slim = w <= SLIM;
  return (
    <aside data-distraction data-fold-aside className="relative hidden shrink-0 overflow-hidden border-l md:block" style={{ width: w }}>
      <div role="separator" aria-orientation="vertical" aria-label="Resize Insight" aria-valuenow={w} aria-valuemin={SLIM} aria-valuemax={MAX} tabIndex={0}
        className="absolute left-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-primary/30 focus-visible:bg-primary/40"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, w }; }}
        onPointerMove={(e) => { if (drag.current) setW(clamp(drag.current.w + (drag.current.x - e.clientX))); }}
        onPointerUp={() => { drag.current = null; }}
        onKeyDown={(e) => { if (e.key === "ArrowLeft") setW((v) => clamp(v + 24)); else if (e.key === "ArrowRight") setW((v) => clamp(v - 24)); }} />
      {slim && (
        <button onClick={() => setW(340)} aria-label="Open Insight" className="mt-3 grid w-full place-items-center gap-1 text-muted-foreground hover:text-foreground">
          <Sparkles className="h-4 w-4" /><span className="font-mono text-[9px] uppercase tracking-wider [writing-mode:vertical-rl]">Insight</span>
        </button>
      )}
      <div className={`h-full overflow-y-auto ${slim ? "hidden" : ""}`}>{children}</div>
    </aside>
  );
}
