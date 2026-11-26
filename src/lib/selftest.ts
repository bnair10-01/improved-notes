import { Capacitor } from "@capacitor/core";

/**
 * A launch-time check for native test builds only (`VITE_NATIVE_SELFTEST=1 npm run build`). It signs in as a guest,
 * makes one real Firebase AI Logic call and one research lookup, and prints what happened on screen and in the log,
 * so a simulator screenshot shows whether AI works in that environment and where it ran. It is not in normal builds.
 */
export async function runSelfTest() {
  const box = document.createElement("pre");
  box.setAttribute("data-selftest", "");
  box.style.cssText = "position:fixed;left:8px;right:8px;bottom:96px;z-index:99999;margin:0;padding:10px;border-radius:10px;background:rgba(0,0,0,.88);color:#e8e8e8;font:11px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none";
  document.body.appendChild(box);
  const lines: string[] = [];
  const say = (l: string) => { lines.push(l); box.textContent = lines.join("\n"); console.log(`SELFTEST ${l}`); };
  try {
    say(`platform: ${Capacitor.getPlatform()} (native: ${Capacitor.isNativePlatform()})`);
    const { ensureSignedIn } = await import("./auth");
    const u = await ensureSignedIn();
    say(`signed in as guest: ${u.isAnonymous}`);
    const { runModel } = await import("./ai/run");
    const r = await runModel({ task: "summary", chars: 60, instructions: "Reply with exactly one word: ready" });
    say(`Firebase AI Logic call ok: "${r.text.trim().slice(0, 20)}"`);
    say(`ran on: ${r.source === "on_device" ? "ON-DEVICE" : "CLOUD"} (hybrid: on-device first, cloud fallback)`);
    const { researchSubject } = await import("./research");
    const rs = await researchSubject("Black Hole");
    say(rs.ok ? `research ok: wikipedia=${rs.research.wiki?.title ?? "none"}, videos=${rs.research.videos.length}` : `research failed: ${rs.error}`);
    say("DONE");
  } catch (e) { say(`FAILED: ${e instanceof Error ? e.message : String(e)}`); }
}
