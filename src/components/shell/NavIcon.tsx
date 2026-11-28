/**
 * The section icons, each with a little motion that suits what it stands for. They play when you open a section, when you press
 * the tab, and (on a laptop) when you hover it: the house lifts its roof and swings its door, the note writes its lines, the
 * folder opens and a sheet slides out, the study book opens and ticks, the scanner sweeps, the graph's nodes light up in turn.
 * Same drawings in the phone tab bar and the laptop rail. Reduce motion keeps them still.
 */
export type NavKind = "home" | "notes" | "topics" | "study" | "scans" | "graph";

export const navKind = (to: string): NavKind =>
  to === "/" ? "home" : to === "/vault" ? "notes" : to === "/topics" ? "topics" : to === "/study" ? "study" : to === "/history" ? "scans" : "graph";

export function NavIcon({ kind, className = "h-5 w-5", strokeWidth = 1.8 }: { kind: NavKind; className?: string; strokeWidth?: number }) {
  const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: `navicon ${className}`, "aria-hidden": true };
  switch (kind) {
    case "home": return (
      <svg {...p}><path d="M3 11.5L12 4l9 7.5" className="ni-roof" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-5.5h4V20" className="ni-door" fill="currentColor" fillOpacity={0.12} /></svg>);
    case "notes": return (
      <svg {...p}><g className="ni-page"><path d="M6.5 3h8l4 4v14h-12z" /><path d="M14.5 3v4h4" /></g><path d="M9.5 12h6" className="ni-line ni-l1" /><path d="M9.5 15.5h6" className="ni-line ni-l2" /><path d="M9.5 18.5h3.5" className="ni-line ni-l3" /></svg>);
    case "topics": return (
      <svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M8 13V9.5h8V13" className="ni-sheet" /><path d="M3.5 11.5h17L19 19H5z" className="ni-flap" fill="currentColor" fillOpacity={0.14} /></svg>);
    case "study": return (
      <svg {...p}><g className="ni-book"><path d="M12 6.5C9.5 5 6.5 4.7 3.5 5.3v12.4c3-.6 6 -.3 8.5 1.3 2.5-1.6 5.5-1.9 8.5-1.3V5.3c-3-.6-6-.3-8.5 1.2z" /><path d="M12 6.5V19" /></g><path d="M7.2 11.2l1.8 1.8 3-3.2" className="ni-check" /></svg>);
    case "scans": return (
      <svg {...p}><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M5 12h14" className="ni-scan" strokeWidth={strokeWidth + 0.6} /></svg>);
    case "graph": return (
      <svg {...p}><path d="M12 7.2v4.3M12 11.5l-5.3 5M12 11.5l5.3 5" className="ni-link" /><circle cx="12" cy="5" r="2.2" className="ni-node ni-n1" /><circle cx="5.5" cy="18" r="2.2" className="ni-node ni-n2" /><circle cx="18.5" cy="18" r="2.2" className="ni-node ni-n3" /></svg>);
  }
}
