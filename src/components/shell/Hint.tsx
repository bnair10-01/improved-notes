import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { dismissHint, readHints, shouldShowHint, writeHints } from "@/lib/hints";

export function Hint({ id, children }: { id: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const sync = () => setShow(shouldShowHint(readHints(), id));
    sync(); window.addEventListener("hints-change", sync);
    return () => window.removeEventListener("hints-change", sync);
  }, [id]);
  if (!show) return null;
  return (
    <div role="note" data-distraction className="flex items-start gap-2 rounded-xl border border-primary/25 bg-accent/60 px-3 py-2.5 text-sm text-accent-foreground">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">{children}</p>
      <button aria-label="Dismiss tip" className="-m-1 rounded p-1 hover:bg-background/50" onClick={() => writeHints(dismissHint(readHints(), id))}><X className="h-4 w-4" /></button>
    </div>
  );
}
