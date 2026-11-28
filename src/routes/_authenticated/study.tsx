import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Layers, ListChecks, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Hint } from "@/components/shell/Hint";
import { Button } from "@/components/ui/button";
import { studyOverviewQuery } from "@/lib/study";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/_authenticated/study")({
  head: () => ({
    meta: [
      { title: "Study — Improved Notes" },
      { name: "description", content: "Review due flashcards and retake quizzes made from your notes." },
      { property: "og:title", content: "Study — Improved Notes" },
      { property: "og:description", content: "Review due flashcards and retake quizzes made from your notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudyPage,
});

function StudyPage() {
  const { data } = useQuery(studyOverviewQuery);
  const { data: vault } = useVault();
  const title = (id: string | null) => vault?.notes.find((n) => n.id === id)?.title ?? "Untitled";
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="stagger mx-auto max-w-3xl px-4 py-5 sm:py-8">
        <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Study</h1>
        <div className="mt-3"><Hint id="study">Make decks and quizzes from any note with ✦ Generate. Flashcards get harder as you get them right (hint, flip, then type from memory) and ease off when you miss. Quizzes suggest a harder or easier one next.</Hint></div>
        {!data ? <Loader2 className="mx-auto mt-16 h-6 w-6 animate-spin text-muted-foreground" /> : !data.decks.length && !data.quizzes.length ? (
          <div className="paper-sheet mt-6 p-8 text-center">
            <BookOpenCheck className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 font-serif text-lg">Nothing to study yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Open any note and tap ✦ Generate to make flashcards or a quiz from it.</p>
            <Button asChild className="mt-4"><Link to="/vault">Go to my notes</Link></Button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{data.dueTotal ? `${data.dueTotal} card${data.dueTotal > 1 ? "s" : ""} due today.` : "All caught up for today."}</p>
            <h2 className="mt-6 mb-2 flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4" /> Flashcard decks</h2>
            {data.decks.length ? <ul className="grid gap-2 sm:grid-cols-2">{data.decks.map((d, i) => (
              <li key={d.noteId} className="enter min-w-0" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}><Link to="/vault/$noteId" params={{ noteId: d.noteId }} className="paper-sheet flex min-h-16 items-center gap-3 p-3 hover:ring-2 hover:ring-primary/30">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{title(d.noteId).replace(/^Flashcards: /, "")}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${d.due ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{d.due ? `${d.due} due` : `${d.total} cards`}</span>
              </Link></li>))}</ul> : <p className="text-sm text-muted-foreground">No decks yet.</p>}
            <h2 className="mt-6 mb-2 flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4" /> Quizzes</h2>
            {data.quizzes.length ? <ul className="grid gap-2 sm:grid-cols-2">{data.quizzes.map((q, i) => (
              <li key={q.id} className="enter min-w-0" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}><Link to="/vault/$noteId" params={{ noteId: q.noteId ?? "" }} className="paper-sheet flex min-h-16 items-center gap-3 p-3 hover:ring-2 hover:ring-primary/30">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{title(q.noteId).replace(/^Quiz: /, "")}</span>
                <span className="text-xs text-muted-foreground">{q.best == null ? `${q.count} questions` : `Best ${Math.round(q.best * 100)}%`}</span>
              </Link></li>))}</ul> : <p className="text-sm text-muted-foreground">No quizzes yet.</p>}
          </>
        )}
      </main>
    </div>
  );
}
