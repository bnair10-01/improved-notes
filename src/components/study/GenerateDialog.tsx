import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { generateFromNotes, type GenKind, type SummaryStyle } from "@/lib/generate";
import { useRefreshVault } from "@/lib/vault";

const STYLES: [SummaryStyle, string][] = [["short", "Short"], ["key_points", "Key points"], ["outline", "Outline"], ["eli5", "Explain simply"], ["cheat_sheet", "Cheat sheet"], ["cornell", "Cornell notes"]];

function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`rounded-full border px-3 py-1.5 text-sm ${value === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{l}</button>
      ))}
    </div>
  );
}

export function GenerateDialog({ noteIds, focusTopics, trigger }: { noteIds: string[]; focusTopics?: string[]; trigger?: React.ReactNode }) {
  const gen = generateFromNotes;
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<GenKind>(focusTopics?.length ? "quiz" : "summary");
  const [style, setStyle] = useState<SummaryStyle>("key_points");
  const [length, setLength] = useState<"brief" | "medium" | "detailed">("medium");
  const [count, setCount] = useState(12);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [speakerNotes, setSpeakerNotes] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await gen({ noteIds, kind, style, length, count, difficulty, speakerNotes, ...(focusTopics?.length ? { focusTopics } : {}) });
      if (!r.ok) { toast.error(r.error); return; }
      await refresh();
      setOpen(false);
      toast.success("Saved in your Generated folder");
      navigate({ to: "/vault/$noteId", params: { noteId: r.noteId } });
    } catch { toast.error("Couldn't generate. Please try again."); }
    finally { setBusy(false); }
  }

  const [min, max] = kind === "quiz" ? [3, 20] : kind === "slides" ? [5, 20] : [5, 30];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button variant="outline" size="sm"><Sparkles /> Generate</Button>}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Generate from {noteIds.length === 1 ? "this note" : `${noteIds.length} notes`}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">Uses only what's written in your notes.</p>
        <div className="space-y-4">
          <Chips value={kind} onChange={(k) => { setKind(k); setCount(k === "quiz" ? 8 : 12); }} options={[["summary", "Summary"], ["flashcards", "Flashcards"], ["quiz", "Quiz"], ["slides", "Slides"]]} />
          {kind === "summary" && <>
            <Chips value={style} onChange={setStyle} options={STYLES} />
            <div><p className="mb-1.5 text-xs text-muted-foreground">Length</p><Chips value={length} onChange={setLength} options={[["brief", "Brief"], ["medium", "Medium"], ["detailed", "Detailed"]]} /></div>
          </>}
          {kind !== "summary" && (
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">{kind === "quiz" ? "Questions" : kind === "slides" ? "Slides" : "Cards"}: {count}</span>
              <input type="range" min={min} max={max} value={count} onChange={(e) => setCount(+e.target.value)} className="mt-1 w-full accent-[var(--primary)]" />
            </label>
          )}
          {kind === "slides" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={speakerNotes} onChange={(e) => setSpeakerNotes(e.target.checked)} /> Speaker notes</label>}
          {kind === "quiz" && <div><p className="mb-1.5 text-xs text-muted-foreground">Difficulty</p><Chips value={difficulty} onChange={setDifficulty} options={[["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]} /></div>}
          {focusTopics?.length ? <p className="text-xs text-muted-foreground">Focusing on: {focusTopics.join(", ")}</p> : null}
          <Button className="w-full" onClick={run} disabled={busy}>{busy ? <><Loader2 className="animate-spin" /> Generating…</> : "Generate"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
