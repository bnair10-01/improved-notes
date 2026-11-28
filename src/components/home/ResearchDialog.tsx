import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { researchRequest } from "@/lib/dialogs";
import { researchIdeas } from "@/lib/research";
import { ResearchPanel } from "./ResearchPanel";

/**
 * "Research more", from anywhere: on a note, on a topic, on a topic you got wrong in a quiz, or on a flashcard you missed.
 * It starts from what you were looking at (and you can change the words), then works like the Home box: Wikipedia and videos,
 * built into notes you name. When it starts from a topic, the new notes go into that topic.
 */
export function ResearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const start = researchRequest();
  const [text, setText] = useState(start.subject);
  const [subject, setSubject] = useState(start.subject.trim());
  const go = () => { if (text.trim()) setSubject(text.trim()); };
  // Things the notes themselves bring up, to go deeper on with one tap.
  const ideas = useMemo(() => researchIdeas(start.context ?? "", start.subject), [start.context, start.subject]);
  const dig = (i: string) => { setText(i); setSubject(i); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" data-research-dialog>
        <DialogHeader>
          <DialogTitle>Research more</DialogTitle>
          <DialogDescription>Look it up on Wikipedia and YouTube, then turn what you pick into notes. Change the words to go deeper or wider.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); go(); }} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="What to research" placeholder="What do you want to know more about?" className="min-w-0 flex-1 text-base sm:text-sm" autoFocus={!subject} />
          <Button type="submit" disabled={!text.trim()} className="shrink-0"><Search /> <span className="hidden min-[400px]:inline">Look it up</span></Button>
        </form>
        {ideas.length > 0 && (
          <div data-research-ideas>
            <p className="mb-1.5 text-xs text-muted-foreground">From your notes, dig into:</p>
            <div className="flex flex-wrap gap-1.5">
              {ideas.map((i) => <button key={i} type="button" onClick={() => dig(i)} aria-pressed={subject === i} className={`min-h-9 rounded-full border px-3 py-1 text-xs hover:bg-secondary ${subject === i ? "border-foreground bg-secondary" : ""}`}>{i}</button>)}
            </div>
          </div>
        )}
        {subject && <ResearchPanel key={subject} subject={subject} folderId={start.folderId ?? null} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
