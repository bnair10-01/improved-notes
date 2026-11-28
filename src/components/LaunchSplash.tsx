import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * The phone apps' opening moment: the paper tile settles in, its margin line draws down, the ink dot lands, the name
 * rises, then the whole thing fades to reveal the start page, whose own pieces ease in right after. It never blocks a tap,
 * runs once per launch, and is skipped under Reduce motion. The website doesn't show it.
 */
const reduced = () => {
  const m = document.documentElement.getAttribute("data-motion");
  return m ? m === "reduce" : matchMedia("(prefers-reduced-motion: reduce)").matches;
};
const SHOW_MS = 1500, FADE_MS = 450;
let played = false;

/** Called before the first render so the start page knows to hold its own entrance until the splash lifts. */
export function holdForSplash() {
  if (played || !Capacitor.isNativePlatform() || reduced()) return false;
  document.documentElement.setAttribute("data-launch", "");
  return true;
}

export function LaunchSplash() {
  const [phase, setPhase] = useState<"on" | "out" | "gone">(() => (document.documentElement.hasAttribute("data-launch") ? "on" : "gone"));
  useEffect(() => {
    if (phase === "gone") return;
    played = true;
    const a = setTimeout(() => setPhase("out"), SHOW_MS);
    const b = setTimeout(() => { setPhase("gone"); document.documentElement.removeAttribute("data-launch"); }, SHOW_MS + FADE_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (phase === "gone") return null;
  return (
    <div aria-hidden data-launch-splash className={`launch-splash ${phase === "out" ? "launch-out" : ""}`}>
      <svg viewBox="0 0 28 28" className="launch-mark">
        <defs><clipPath id="launch-clip"><rect width="28" height="28" rx="7" /></clipPath></defs>
        <g clipPath="url(#launch-clip)">
          <rect width="28" height="28" fill="#f5f3ee" className="launch-tile" />
          <rect x="8" width="1.5" height="28" fill="#050505" className="launch-line" />
          <circle cx="18.5" cy="18.5" r="3.5" fill="#050505" className="launch-dot" />
        </g>
      </svg>
      <p className="launch-name">Improved Notes</p>
    </div>
  );
}
