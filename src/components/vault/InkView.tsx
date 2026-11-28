import { useCallback, useEffect, useRef } from "react";
import { drawStrokes, parseInk } from "@/lib/ink";

/**
 * A note's pen ink, drawn read-only over whatever it sits on (the Read view). It covers the whole pane and grows with it, in the same
 * coordinates the editor draws in, so what you wrote in Pencil mode is there when you switch back to reading.
 */
export function InkView({ ink }: { ink?: string | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef(parseInk(ink));
  strokes.current = parseInk(ink);
  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    drawStrokes(ctx, strokes.current, w, getComputedStyle(c).color);
  }, []);
  useEffect(() => {
    redraw();
    const c = canvas.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(redraw); ro.observe(c);
    return () => ro.disconnect();
  }, [redraw, ink]);
  if (!parseInk(ink).length) return null;
  return <canvas ref={canvas} aria-hidden data-ink-read className="pointer-events-none absolute inset-0 h-full w-full text-foreground" />;
}
