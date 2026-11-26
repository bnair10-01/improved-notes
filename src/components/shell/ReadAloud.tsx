import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sentences } from "@/lib/a11y";

/** Reads text with the browser's voice and shows the current sentence highlighted. */
export function ReadAloud({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [idx, setIdx] = useState(-1);
  const list = useRef<string[]>([]);
  const [supported, setSupported] = useState(false);
  useEffect(() => { setSupported("speechSynthesis" in window); return () => { if ("speechSynthesis" in window) speechSynthesis.cancel(); }; }, []);
  if (!supported || !text.trim()) return null;

  function speakFrom(i: number) {
    const s = list.current[i];
    if (!s) { setState("idle"); setIdx(-1); return; }
    setIdx(i);
    const u = new SpeechSynthesisUtterance(s);
    u.onend = () => speakFrom(i + 1);
    speechSynthesis.speak(u);
  }
  function start() { speechSynthesis.cancel(); list.current = sentences(text); setState("playing"); speakFrom(0); }
  function stop() { speechSynthesis.cancel(); setState("idle"); setIdx(-1); }

  return (
    <div className="rounded-lg border bg-secondary/40 p-2" data-read-aloud>
      <div className="flex items-center gap-1">
        <Volume2 className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden />
        {state === "idle" && <Button size="sm" variant="ghost" onClick={start}><Play /> Read aloud</Button>}
        {state === "playing" && <Button size="sm" variant="ghost" onClick={() => { speechSynthesis.pause(); setState("paused"); }}><Pause /> Pause</Button>}
        {state === "paused" && <Button size="sm" variant="ghost" onClick={() => { speechSynthesis.resume(); setState("playing"); }}><Play /> Resume</Button>}
        {state !== "idle" && <Button size="sm" variant="ghost" onClick={stop}><Square /> Stop</Button>}
      </div>
      {idx >= 0 && <p aria-live="polite" className="mt-1 px-2 pb-1 font-serif text-lg"><span className="read-aloud-current">{list.current[idx]}</span></p>}
    </div>
  );
}
