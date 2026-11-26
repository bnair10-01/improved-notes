import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DEVICE_VOICE, GEMINI_VOICES, Narrator, saveVoice, savedVoice, type VoiceChoice } from "@/lib/ai/speech";

/** Reads a note aloud with a natural Gemini voice (or this device's best voice), highlighting the passage being read. */
export function ReadAloud({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [passage, setPassage] = useState("");
  const [voice, setVoice] = useState<VoiceChoice>("Kore");
  const narrator = useRef<Narrator | null>(null);

  useEffect(() => { setVoice(savedVoice()); return () => narrator.current?.stop(); }, []);
  if (!text.trim()) return null;

  function start() {
    narrator.current?.stop();
    const n = new Narrator({
      onLoading: (l) => setState((s) => (l ? "loading" : s === "loading" ? "playing" : s)),
      onPassage: (_i, t) => { setPassage(t); setState("playing"); },
      onEnd: () => { setState("idle"); setPassage(""); },
      onFallback: () => toast("Using this device's voice (the natural voice isn't reachable)."),
    });
    narrator.current = n;
    setState("loading");
    void n.start(text, voice);
  }
  function stop() { narrator.current?.stop(); setState("idle"); setPassage(""); }

  return (
    <div className="rounded-lg border bg-secondary/40 p-2" data-read-aloud>
      <div className="flex flex-wrap items-center gap-1">
        <Volume2 className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden />
        {state === "idle" && <Button size="sm" variant="ghost" onClick={start}><Play /> Read aloud</Button>}
        {state === "loading" && <Button size="sm" variant="ghost" disabled><Loader2 className="animate-spin" /> Getting the voice…</Button>}
        {state === "playing" && <Button size="sm" variant="ghost" onClick={() => { narrator.current?.pause(); setState("paused"); }}><Pause /> Pause</Button>}
        {state === "paused" && <Button size="sm" variant="ghost" onClick={() => { narrator.current?.resume(); setState("playing"); }}><Play /> Resume</Button>}
        {state !== "idle" && <Button size="sm" variant="ghost" onClick={stop}><Square /> Stop</Button>}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          Voice
          <select value={voice} disabled={state !== "idle"} onChange={(e) => { const v = e.target.value as VoiceChoice; setVoice(v); saveVoice(v); }}
            className="rounded-md border bg-background px-1.5 py-1 text-xs text-foreground" aria-label="Voice">
            {GEMINI_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            <option value={DEVICE_VOICE}>This device (works offline)</option>
          </select>
        </label>
      </div>
      {passage && <p aria-live="polite" className="mt-1 px-2 pb-1 font-serif text-lg"><span className="read-aloud-current">{passage}</span></p>}
    </div>
  );
}
