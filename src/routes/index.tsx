import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpenCheck, Box, Camera, Layers, Loader2, Mic, Network, Pin, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { GoogleMark } from "@/components/GoogleMark";
import { NewActionGrid } from "@/components/shell/NewActions";
import { Hint } from "@/components/shell/Hint";
import { Button } from "@/components/ui/button";
import { IS_NATIVE } from "@/lib/firebase";
import { authMessage, rememberNext, signInWithGoogle, useAuth } from "@/lib/auth";
import { studyOverviewQuery } from "@/lib/study";
import { openTarget, useVault, type VNote } from "@/lib/vault";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { user, ready } = useAuth();
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:pt-10">
        {!ready ? null : user ? <Dashboard name={firstName(user?.displayName, user?.email)} /> : <Welcome />}
      </main>
    </div>
  );
}

function firstName(displayName?: string | null, email?: string | null) {
  return (displayName ?? "").split(" ")[0] || email?.split("@")[0] || "";
}

function Welcome() {
  const [busy, setBusy] = useState(false);
  async function google() {
    setBusy(true);
    try {
      rememberNext("/");
      await signInWithGoogle();
    } catch (e) { toast.error(authMessage(e)); } finally { setBusy(false); }
  }
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 px-5 py-10 sm:px-10 sm:py-14">
      <div aria-hidden data-distraction className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative max-w-xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"><Sparkles className="h-3.5 w-3.5" /> Your notes, made clear</span>
        <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight sm:text-5xl">Take notes. See the <span className="italic text-primary">map</span>. Learn it.</h1>
        <p className="mt-3 text-muted-foreground">Scan handwriting or type, link ideas together, and study with flashcards and quizzes made only from what you wrote.</p>
        <div className="mt-6 max-w-sm">
          {!IS_NATIVE && <Button variant="outline" className="w-full" style={{ background: "#FFFFFF", borderColor: "#747775", color: "#1F1F1F" }} onClick={google} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <GoogleMark />} Continue with Google
          </Button>}
          <Button asChild variant="ghost" size="sm" className="mt-1 w-full text-muted-foreground"><Link to="/auth" search={{ redirect: "/" }}>Use email instead</Link></Button>
          <Button asChild variant="ghost" size="sm" className="w-full text-muted-foreground"><Link to="/capture">Try it without an account</Link></Button>
        </div>
      </div>
      <ul aria-label="What you can do" className="relative mt-10 grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {SHOWCASE.map(({ icon: I, label }, i) => (
          <li key={label} className="paper-sheet flex flex-col items-center gap-2 px-2 py-4 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2" style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary"><I className="h-5 w-5" /></span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SHOWCASE = [
  { icon: Camera, label: "Scan" },
  { icon: Network, label: "Map" },
  { icon: Layers, label: "Flashcards" },
  { icon: Mic, label: "Audio" },
  { icon: Box, label: "3D" },
  { icon: Sparkles, label: "Quiz" },
];

function NoteRow({ n }: { n: VNote }) {
  return (
    <Link {...openTarget(n)} className="paper-sheet flex min-h-14 items-center gap-3 p-3 hover:ring-2 hover:ring-primary/30">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{n.title || "Untitled"}</span>
        <span className="block text-xs capitalize text-muted-foreground">{n.kind} · {new Date(n.updated_at).toLocaleDateString()}</span>
      </span>
      {n.pinned && <Pin className="h-3.5 w-3.5 fill-current text-primary" aria-label="Pinned" />}
    </Link>
  );
}

function Dashboard({ name }: { name: string }) {
  const { data: vault } = useVault();
  const { data: study } = useQuery(studyOverviewQuery);
  const live = vault?.notes.filter((n) => !n.deleted_at) ?? [];
  const pinned = live.filter((n) => n.pinned).slice(0, 6);
  return (
    <>
      <h1 className="font-serif text-2xl font-semibold sm:text-3xl">Hi{name ? `, ${name}` : ""}.</h1>
      <p className="mt-1 text-sm text-muted-foreground">What would you like to do?</p>

      <Link to="/study" className="paper-sheet mt-4 flex items-center gap-3 p-4 hover:ring-2 hover:ring-primary/30">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground"><BookOpenCheck className="h-5 w-5" /></span>
        <span className="flex-1">
          <span className="block font-medium">{study?.dueTotal ? `${study.dueTotal} flashcard${study.dueTotal > 1 ? "s" : ""} due` : "Study"}</span>
          <span className="block text-xs text-muted-foreground">{study?.dueTotal ? "A few minutes keeps them fresh." : study && (study.decks.length || study.quizzes.length) ? "All caught up — retake a quiz anytime." : "Make flashcards or quizzes from any note with ✦ Generate."}</span>
        </span>
      </Link>
      <div className="mt-4"><Hint id="home">Tap a card to start. Your notes, folders and sorting live in <b>Notes</b>; the <b>?</b> button at the top has a full guide.</Hint></div>
      <section className="mt-5" aria-label="Create"><NewActionGrid /></section>

      {pinned.length > 0 && (
        <section className="mt-6"><h2 className="mb-2 text-sm font-semibold">Pinned</h2><div className="grid gap-2 md:grid-cols-2">{pinned.map((n) => <NoteRow key={n.id} n={n} />)}</div></section>
      )}
    </>
  );
}
