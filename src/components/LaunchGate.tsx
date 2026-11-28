import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/GoogleMark";
import { authMessage, ensureSignedIn, rememberNext, signInWithGoogle, useAuth } from "@/lib/auth";

/**
 * The phone apps' front door. It plays the logo animation (the tile settles in, its margin line draws, the dot lands, the name rises),
 * and if nobody is signed in it stays on the same screen and offers Start writing, Continue with Google, or Sign in with email.
 * There is no separate landing page, and the screen behind is never shown until the app is ready, so nothing flashes.
 * Signing out brings it back. The website doesn't use it.
 */
const reduced = () => {
  const m = document.documentElement.getAttribute("data-motion");
  return m ? m === "reduce" : matchMedia("(prefers-reduced-motion: reduce)").matches;
};
const SHOW_MS = 1500, FADE_MS = 450;
let played = false;
/** Google's sign-in popup can't open inside the phone app, so the button waits for the native Google sign-in to be set up (VITE_NATIVE_GOOGLE=1). */
const GOOGLE = import.meta.env.VITE_NATIVE_GOOGLE === "1";

/** Called before the first render so the start page knows to hold its own entrance until the screen lifts. */
export function holdForSplash() {
  if (played || !Capacitor.isNativePlatform() || reduced()) return false;
  document.documentElement.setAttribute("data-launch", "");
  return true;
}

export function LaunchGate() {
  return Capacitor.isNativePlatform() ? <Gate /> : null;
}

function Gate() {
  const { user, ready } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [intro, setIntro] = useState(() => document.documentElement.hasAttribute("data-launch"));
  const [phase, setPhase] = useState<"on" | "out" | "off">("on");
  const [busy, setBusy] = useState<"write" | "google" | null>(null);

  useEffect(() => {
    if (!intro) return;
    played = true;
    const t = setTimeout(() => setIntro(false), SHOW_MS);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gate = ready && !user && path === "/" && !intro;
  const cover = intro || !ready || gate;

  useEffect(() => {
    if (cover) { setPhase("on"); return; }
    setPhase((p) => (p === "off" ? p : "out"));
    const t = setTimeout(() => { setPhase("off"); document.documentElement.removeAttribute("data-launch"); }, FADE_MS);
    return () => clearTimeout(t);
  }, [cover]);
  // Nothing is waiting behind the gate, so the start page's own entrance needn't be held back.
  useEffect(() => { if (gate) document.documentElement.removeAttribute("data-launch"); }, [gate]);

  if (phase === "off") return null;

  async function write() {
    setBusy("write");
    try { await ensureSignedIn(); } catch { toast.error("Couldn't get started. Please try again."); } finally { setBusy(null); }
  }
  async function google() {
    setBusy("google");
    try { rememberNext("/"); await signInWithGoogle(); } catch (e) { toast.error(authMessage(e)); } finally { setBusy(null); }
  }
  function email() { rememberNext("/"); void navigate({ to: "/auth", search: { redirect: "/" } }); }

  return (
    <div data-launch-splash data-launch-gate={gate || undefined} aria-hidden={!gate} className={`launch-splash ${phase === "out" ? "launch-out" : ""} ${gate ? "launch-gate" : ""}`}>
      <div className="launch-brand">
        <svg viewBox="0 0 28 28" className="launch-mark">
          <defs><clipPath id="launch-clip"><rect width="28" height="28" rx="7" /></clipPath></defs>
          <g clipPath="url(#launch-clip)">
            <rect width="28" height="28" className="launch-tile" />
            <rect x="8" width="1.5" height="28" className="launch-line" />
            <circle cx="18.5" cy="18.5" r="3.5" className="launch-dot" />
          </g>
        </svg>
        <p className="launch-name">Improved Notes</p>
      </div>
      <div className="launch-actions">
        <div>
          <div className="mx-auto w-full max-w-xs space-y-2.5 pt-7">
            <Button className="w-full" size="lg" onClick={() => void write()} disabled={busy !== null}>
              {busy === "write" ? <Loader2 className="animate-spin" /> : <PenLine />} Start writing
            </Button>
            {GOOGLE && (
              <Button variant="outline" className="w-full" size="lg" style={{ background: "#FFFFFF", borderColor: "#747775", color: "#1F1F1F" }} onClick={() => void google()} disabled={busy !== null}>
                {busy === "google" ? <Loader2 className="animate-spin" /> : <GoogleMark />} Continue with Google
              </Button>
            )}
            <button type="button" onClick={email} disabled={busy !== null} className="mx-auto block min-h-11 px-3 text-sm text-foreground underline underline-offset-4 disabled:opacity-50">Sign in with email</button>
            <p className="px-2 text-center text-xs text-muted-foreground">Start without an account and sign in later to keep your notes on every device.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
