import { useEffect, useState } from "react";
import { QUIPS, shuffled, type QuipSet } from "@/lib/quips";

/**
 * Little animated pictures for things that take a moment, each one matching the job: a magnifier sweeping over text while
 * searching, a book turning its page while reading, blocks stacking while a picture is drawn. They use the text colour, so
 * they suit every theme, and stand still under Reduce motion.
 */
export type DoodleKind = "search" | "book" | "video" | "write" | "sketch" | "blocks" | "cards" | "quiz" | "sparkle" | "scan" | "wave" | "slides" | "globe" | "scissors" | "mind";

export function Doodle({ kind, className = "h-10 w-10" }: { kind: DoodleKind; className?: string }) {
  const p = { viewBox: "0 0 48 48", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: `doodle ${className}`, "aria-hidden": true };
  switch (kind) {
    case "search": return (
      <svg {...p}><path d="M8 14h20M8 22h26M8 30h16" className="d-fade" /><g className="d-sweep"><circle cx="18" cy="20" r="7" /><path d="M23.5 25.5L32 34" strokeWidth={3} /></g></svg>);
    case "book": return (
      <svg {...p}><path d="M24 12v26M24 12c-4-3-11-3-15-1v26c4-2 11-2 15 1M24 12c4-3 11-3 15-1v26c-4-2-11-2-15 1" /><path d="M24 12c4-3 11-3 15-1v26c-4-2-11-2-15 1z" className="d-page" fill="currentColor" fillOpacity={0.12} /></svg>);
    case "video": return (
      <svg {...p}><rect x="6" y="10" width="36" height="24" rx="5" /><path d="M20 16l10 6-10 6z" className="d-pulse" fill="currentColor" /><path d="M10 40h28" strokeOpacity={0.3} /><path d="M10 40h28" className="d-progress" /></svg>);
    case "write": return (
      <svg {...p}><path d="M8 38h32" strokeOpacity={0.25} /><path d="M8 38c4-8 8-8 12-3s8 3 12-6" className="d-draw" /><g className="d-pencil"><path d="M30 8l6 6-14 14-8 2 2-8z" fill="currentColor" fillOpacity={0.15} /></g></svg>);
    case "sketch": return (
      <svg {...p}><path d="M10 34c-3-9 2-20 12-22s18 4 17 13-8 14-17 12" className="d-draw" /><circle cx="24" cy="24" r="4" className="d-pulse" fill="currentColor" fillOpacity={0.3} /><path d="M34 8l6 6-10 10-6 1 1-6z" className="d-brush" /></svg>);
    case "blocks": return (
      <svg {...p}><rect x="6" y="30" width="14" height="12" rx="2" className="d-drop d-1" fill="currentColor" fillOpacity={0.12} /><rect x="22" y="30" width="14" height="12" rx="2" className="d-drop d-2" fill="currentColor" fillOpacity={0.12} /><rect x="14" y="16" width="14" height="12" rx="2" className="d-drop d-3" fill="currentColor" fillOpacity={0.25} /><rect x="30" y="16" width="10" height="12" rx="2" className="d-drop d-4" fill="currentColor" fillOpacity={0.12} /></svg>);
    case "cards": return (
      <svg {...p}><rect x="6" y="12" width="22" height="28" rx="3" className="d-flip" fill="currentColor" fillOpacity={0.1} /><rect x="20" y="8" width="22" height="28" rx="3" className="d-flip d-late" fill="currentColor" fillOpacity={0.2} /><path d="M26 18h10M26 24h6" /></svg>);
    case "quiz": return (
      <svg {...p}><path d="M17 17c0-4 3-7 7-7s7 3 7 7c0 5-7 5-7 10" className="d-bounce" /><circle cx="24" cy="35" r="1.5" fill="currentColor" className="d-bounce" /><path d="M8 40l3 3 5-6" className="d-tick" /></svg>);
    case "sparkle": return (
      <svg {...p}><path d="M24 6l3.5 11L38 20.5 27.5 24 24 36l-3.5-12L10 20.5 20.5 17z" className="d-twinkle" fill="currentColor" fillOpacity={0.15} /><path d="M38 6v8M34 10h8" className="d-twinkle d-late" /><path d="M10 34v6M7 37h6" className="d-twinkle d-later" /></svg>);
    case "scan": return (
      <svg {...p}><rect x="10" y="6" width="28" height="36" rx="3" fill="currentColor" fillOpacity={0.08} /><path d="M16 16h16M16 22h12M16 28h14" strokeOpacity={0.5} /><path d="M6 24h36" className="d-scan" strokeWidth={3} /></svg>);
    case "wave": return (
      <svg {...p} strokeWidth={3.5}>{[8, 15, 22, 29, 36].map((x, i) => <path key={x} d={`M${x} 14v20`} className="d-bar" style={{ animationDelay: `${i * 120}ms` }} />)}</svg>);
    case "slides": return (
      <svg {...p}><rect x="12" y="10" width="28" height="20" rx="3" strokeOpacity={0.35} /><rect x="8" y="16" width="28" height="20" rx="3" className="d-slide" fill="currentColor" fillOpacity={0.12} /><path d="M14 24h14M14 29h9" /></svg>);
    case "globe": return (
      <svg {...p}><circle cx="24" cy="24" r="16" /><path d="M8 24h32" strokeOpacity={0.5} /><ellipse cx="24" cy="24" rx="7" ry="16" className="d-spin" /></svg>);
    case "scissors": return (
      <svg {...p}><g className="d-snip-a"><path d="M10 34L36 12" /></g><g className="d-snip-b"><path d="M10 14L36 36" /></g><circle cx="12" cy="12" r="4" /><circle cx="12" cy="36" r="4" /></svg>);
    case "mind": return (
      <svg {...p}><path d="M24 24L10 12M24 24l16-10M24 24L12 38M24 24l15 14" strokeOpacity={0.5} /><circle cx="24" cy="24" r="6" fill="currentColor" fillOpacity={0.2} className="d-pulse" /><circle cx="10" cy="12" r="3.5" className="d-twinkle" /><circle cx="40" cy="14" r="3.5" className="d-twinkle d-late" /><circle cx="12" cy="38" r="3.5" className="d-twinkle d-later" /><circle cx="39" cy="38" r="3.5" className="d-twinkle" /></svg>);
  }
}

/**
 * What a wait looks like: a doodle that matches the job, a line saying what is happening, and underneath a fact or joke that
 * changes every few seconds, so a longer wait is something to read rather than stare at.
 */
export function Working({ kind, steps, quips, className = "" }: { kind: DoodleKind; steps: string[]; quips?: QuipSet; className?: string }) {
  const [i, setI] = useState(0);
  const [order] = useState(() => (quips ? shuffled(QUIPS[quips]) : []));
  const [q, setQ] = useState(0);
  useEffect(() => {
    setI(0);
    if (steps.length < 2) return;
    const t = setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 3200);
    return () => clearInterval(t);
  }, [steps.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (order.length < 2) return;
    const t = setInterval(() => setQ((n) => (n + 1) % order.length), 5200);
    return () => clearInterval(t);
  }, [order.length]);
  return (
    <div role="status" aria-live="polite" data-working className={`flex items-start gap-3 text-sm ${className}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-foreground"><Doodle kind={kind} className="h-8 w-8" /></span>
      <span className="min-w-0 flex-1">
        <span key={`s${i}`} className="enter block font-medium text-foreground">{steps[Math.min(i, steps.length - 1)]}</span>
        <span className="working-bar mt-1.5 block" />
        {order.length > 0 && <span key={`q${q}`} data-quip className="enter mt-2 block text-xs italic leading-relaxed text-muted-foreground">{order[q]}</span>}
      </span>
    </div>
  );
}
