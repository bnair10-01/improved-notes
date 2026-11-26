import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { readHints, writeHints } from "@/lib/hints";

const GUIDE: [string, string[]][] = [
  ["Getting started", [
    "Home is your starting point: anything due to study shows at the top, then the Create cards.",
    "On a phone, use the tab bar at the bottom. The big + opens Create from anywhere.",
    "Your notes are private to your account and follow you to any device you sign in on.",
  ]],
  ["Scanning handwritten notes", [
    "Create → Scan handwriting. Take photos or choose files; add as many pages as you like.",
    "Reorder, rotate or remove pages, then pick “Just the text” or “Text + mind map” and tap Transcribe.",
    "Nothing is invented. Words that can't be read show as [illegible], guesses as [word?] — highlighted so you can fix them in Edit.",
    "Export the transcript as PDF, Markdown or plain text. Find past scans under Scans.",
  ]],
  ["Writing and linking notes", [
    "Create → Write a note or Blank concept. Notes save automatically as you type.",
    "Type / for headings, lists and checklists. Type [[ to link another note — a missing note is created for you.",
    "Each note shows Backlinks (notes that link here) and Unlinked mentions you can link with one tap.",
    "In Notes, sort by recently edited, created or title, use folders and tags, and press Ctrl/⌘ K to jump anywhere.",
    "Deleted notes go to Trash for 30 days before they're removed for good.",
  ]],
  ["Slides and audio", [
    "Create → Import slides takes a PDF (best) or PowerPoint. Each deck becomes one note you can read, edit and present.",
    "Create → Add audio lets you record or upload. Transcription is optional and uses AI credits; tap a line to jump to that moment.",
  ]],
  ["Mind maps and the graph", [
    "Scans can include a mind map — switch between flat and 3D views, edit, collapse and connect ideas.",
    "Any map idea can become its own note or link to an existing one.",
    "Notes → Graph shows how all your notes connect. “Suggest links” proposes connections you can accept or reject.",
  ]],
  ["Studying", [
    "On any note, tap ✦ Generate for a summary, flashcards, a quiz or slides — made only from what you wrote.",
    "Flashcards: tap to flip, then “Know it” or “Review again”. Cards come back when they're due.",
    "Quizzes show your score, explanations and weak topics, with a button to practise just those.",
    "Study lists all your decks and quizzes. Flashcards export to Anki as CSV.",
  ]],
  ["Appearance and accessibility", [
    "The sun/moon button switches light and dark mode and lets you pick a theme for each.",
    "The accessibility button sets font (including dyslexia-friendly), text size, line spacing, high contrast, reduced motion and focus mode.",
    "Read aloud on any note reads it with your device's voice and highlights the current sentence.",
    "These settings are saved on each device and apply everywhere.",
  ]],
];

export function HelpDialog() {
  const [tipsOn, setTipsOn] = useState(true);
  useEffect(() => setTipsOn(!readHints().off), []);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="min-h-10 min-w-10" aria-label="Help and guide"><CircleHelp /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-xl">How Improved Notes works</DialogTitle></DialogHeader>
        <p className="-mt-1 text-sm text-muted-foreground">A quick guide to everything you can do. Tap a topic to open it.</p>
        <Accordion type="single" collapsible defaultValue="Getting started">
          {GUIDE.map(([t, items]) => (
            <AccordionItem key={t} value={t}>
              <AccordionTrigger>{t}</AccordionTrigger>
              <AccordionContent><ul className="list-disc space-y-1.5 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul></AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <label className="mt-2 flex items-center justify-between rounded-lg bg-secondary px-3 py-2.5 text-sm">
          Show tips on pages
          <Switch checked={tipsOn} onCheckedChange={(v) => { setTipsOn(v); writeHints({ ...readHints(), off: !v, ...(v ? { dismissed: [] } : {}) }); }} />
        </label>
      </DialogContent>
    </Dialog>
  );
}
