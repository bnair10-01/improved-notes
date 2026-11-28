import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { readHints, writeHints } from "@/lib/hints";
import { touchFirst } from "./CommandPalette";

const GUIDE: [string, string[]][] = [
  ["Getting started", [
    "Home is one box. Type a topic and press Enter to look it up and build notes from Wikipedia and YouTube, or switch the box to Note to start writing with what you typed. Your choice is remembered.",
    "Paste a YouTube or web link into the box and it's read and divided into notes, one per idea. You name the topic; nothing is filed until you accept.",
    "Press + in the box, or Add in the top bar, to bring in anything else. On a phone the big + in the tab bar does the same, Notes, Graph, Topics and Study are one tap away, and the logo takes you home.",
    "Your notes are private to your account and follow you to any device you sign in on. A guest account lasts only for this tab until you sign in.",
  ]],
  ["Rename, delete and research more", [
    "Every note and topic has a ⋯ menu (on the Notes list, in a topic, and in the sidebar): rename it, pin it, research more about it, or delete it. Deleting a note moves it to Trash, with an Undo.",
    "Deleting a topic asks whether to keep its notes (they simply leave the topic) or send them to Trash too.",
    "Research more opens from a note, a topic, the weak topics after a quiz, and any flashcard (“Read more about this”). New notes made from a topic's research go into that topic.",
    "Settings → Your notes can move every note to Trash at once (with Undo), or delete everything for good after you type DELETE.",
  ]],
  ["Add anything", [
    "The Add menu is the one place to start: Write a note, Scan handwriting, Voice or lecture, PDF or slides, Website or YouTube link, Upload a file, 3D model of a concept.",
    "Open it from inside a topic and whatever you add lands in that topic.",
    "You can also drop a photo, PDF, slides or a recording on Home, or paste a screenshot into the box.",
  ]],
  ["Research and videos", [
    "Research looks the subject up on Wikipedia and finds YouTube videos, then shows what it found. Tick the sources you want and press Build notes.",
    "Every note keeps its sources: a “Source:” line with a link for each, so you can check where it came from.",
    "A note built from a video keeps the video right on the note. Pause it and press “Add my note at this moment” to stamp your own note with the time. Timestamp links in the note jump back to that moment.",
  ]],
  ["Scanning handwritten notes", [
    "Add → Scan handwriting. Take photos or choose files; add as many pages as you like.",
    "Reorder, rotate or remove pages, then tap Transcribe. You always get the transcript and a mind map, and the note is saved for you as soon as it's transcribed. Edits save as you go.",
    "Nothing is invented. Words that can't be read show as [illegible], guesses as [word?], highlighted so you can fix them in Edit.",
    "Export the transcript as PDF, Markdown or plain text. Past scans are under History.",
  ]],
  ["Writing and linking notes", [
    "Add → Write a note. Notes save automatically as you type.",
    "Type / for headings, lists and checklists. Type [[ to link another note; a missing note is created for you.",
    "Each note shows Backlinks (notes that link here) and Unlinked mentions you can link with one tap.",
    "In Notes, sort by recently edited, created or title, use folders and tags, and press Ctrl/⌘ K to search and jump anywhere.",
    "Deleted notes go to Trash and stay there until you empty it. Every note keeps a version history you can restore.",
  ]],
  ["Slides, audio and links", [
    "Add → PDF or slides takes a PDF (best) or PowerPoint. Each deck becomes one note you can read, edit and present.",
    "Add → Voice or lecture lets you record or upload. Transcription is optional and uses AI credits; tap a line to jump to that moment.",
    "Add → Website or YouTube link reads a page or video and offers it as notes. Use Split into notes on any long note to divide it the same way.",
  ]],
  ["3D models", [
    "Add → 3D model of a concept, or ✦ on any note, builds a model from what you wrote. It first draws a reference picture with Nano Banana, then builds the 3D model to match, and keeps the picture beside it.",
    "Tap a part to read what it does and the line of your note it came from. Drag to turn, pinch or scroll to zoom, and press E (or Explode) to take it apart.",
    "It's a simplified schematic, not to scale. Check AI-generated details against your own notes.",
  ]],
  ["Mind maps and the graph", [
    "Scans can include a mind map. Switch between flat and 3D views, edit, collapse and connect ideas.",
    "Any map idea can become its own note or link to an existing one.",
    "Notes → Graph shows how all your notes connect. “Suggest links” proposes connections you can accept or reject.",
  ]],
  ["Studying", [
    "On any note, tap ✦ Generate for a summary, flashcards, a quiz or slides, made only from what you wrote.",
    "Flashcards adapt to you. Three right in a row steps up from Guided (a hint) to Flip to Recall (type the answer from memory); two misses steps back down. Cards you're shaky on come first, and answers from memory are scheduled further out.",
    "Quizzes show your score, explanations and weak topics. Score 85% or better and the next quiz is harder; 50% or worse and it's easier. One button makes it, or practises just the weak topics.",
    "Study lists all your decks and quizzes. Flashcards export to Anki as CSV.",
  ]],
  ["Where the AI runs", [
    "A small badge shows whether each AI answer ran On-device (private, free, works offline, in Chrome with Gemini Nano) or in the Cloud.",
    "Short jobs try your device first and fall back to the cloud. Photos, audio, slides, research and 3D always use the cloud.",
    "Every AI answer cites where it came from, and quotes are checked against your own text.",
  ]],
  ["Pen, Apple Pencil and tablets", [
    "On an iPad or Android tablet the app uses the roomier laptop layout, with controls sized for fingers and pens.",
    "Touch a note's editor with a pen and it switches to Pencil mode and starts writing straight away. Lines get bolder as you press harder, a resting palm or finger is ignored once a pen is in use, and a stylus's eraser end rubs out.",
    "In Pencil mode, Pen and Eraser are in the toolbar, with Undo, Clear ink, and To text to turn your handwriting into text.",
  ]],
  ["Appearance and accessibility", [
    "Light or dark follows your device's setting and changes with it. The sun/moon switch flips it for now with a ripple, and it goes back to the device's setting when you reopen the app or the device changes. The palette button (and Settings → Appearance, which is where a phone picks one) chooses the colour theme for each mode.",
    "The accessibility button sets font (including dyslexia-friendly), text size, line spacing, high contrast, reduced motion and focus mode. Reduce motion also turns off the animations.",
    "Read aloud on any note uses a natural Gemini voice (your device's voice as a backup) and highlights the current sentence.",
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
        <p className="-mt-1 text-sm text-muted-foreground">A quick guide to everything you can do. Tap a topic to open it. Tips appear on pages until you dismiss them.</p>
        <Accordion type="single" collapsible defaultValue="Getting started">
          {GUIDE.map(([t, items]) => (
            <AccordionItem key={t} value={t}>
              <AccordionTrigger>{t}</AccordionTrigger>
              <AccordionContent><ul className="list-disc space-y-1.5 pl-5 text-sm">{items.map((i) => <li key={i}>{touchFirst() ? i.replace("press Ctrl/⌘ K to search and jump anywhere", "pull down from the top of any screen to search and jump anywhere") : i}</li>)}</ul></AccordionContent>
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
