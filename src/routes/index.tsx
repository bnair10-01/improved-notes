import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpenCheck, Loader2, PenLine, Pin } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { GoogleMark } from "@/components/GoogleMark";
import { Button } from "@/components/ui/button";
import { IS_NATIVE } from "@/lib/firebase";
import { authMessage, ensureSignedIn, rememberNext, signInWithGoogle, useAuth } from "@/lib/auth";
import { studyOverviewQuery } from "@/lib/study";
import { createNote, openTarget, useRefreshVault, useVault, type VNote } from "@/lib/vault";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const mono = "font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground";

function HomePage() {
  const { user, ready } = useAuth();
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main>{!ready ? null : user ? <Home name={firstName(user.displayName, user.email)} /> : <Welcome />}</main>
    </div>
  );
}

function firstName(displayName?: string | null, email?: string | null) {
  return (displayName ?? "").split(" ")[0] || email?.split("@")[0] || "";
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }).toUpperCase();

function Column({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-[1100px] flex-col gap-7 px-5 pb-12 pt-8 sm:px-10 lg:px-16 lg:pt-16">{children}</div>;
}

function Headline({ line1, line2 }: { line1: string; line2: string }) {
  return (
    <div>
      <div className={mono}>{today()}</div>
      <h1 className="mt-3.5 font-serif text-[40px] font-normal leading-[1.02] tracking-[-0.02em] sm:text-6xl">
        {line1}<br /><span className="italic text-muted-foreground">{line2}</span>
      </h1>
    </div>
  );
}

/** Make a blank note and open it. Everything else (scan, voice, websites, slides) is available from inside the note. */
function useStartWriting() {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  return async () => {
    await ensureSignedIn();
    const id = await createNote({ kind: "text", title: "Untitled" });
    await refresh();
    navigate({ to: "/vault/$noteId", params: { noteId: id } });
  };
}

function Welcome() {
  const [busy, setBusy] = useState<"google" | "write" | null>(null);
  const start = useStartWriting();
  async function google() {
    setBusy("google");
    try { rememberNext("/"); await signInWithGoogle(); }
    catch (e) { toast.error(authMessage(e)); }
    finally { setBusy(null); }
  }
  async function write() {
    setBusy("write");
    try { await start(); } catch { toast.error("Couldn't open a blank note. Please try again."); } finally { setBusy(null); }
  }
  return (
    <Column>
      <Headline line1="Take notes. See the map." line2="Learn it." />
      <p className="max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
        Write, scan handwriting, or bring in a lecture, a website or a video. Everything is divided into notes, linked into topics, and turned into flashcards and quizzes made only from what you wrote. AI runs on your device first.
      </p>
      <div className="max-w-sm space-y-2">
        <Button className="w-full" size="lg" onClick={() => void write()} disabled={busy !== null}>
          {busy === "write" ? <Loader2 className="animate-spin" /> : <PenLine />} Start writing
        </Button>
        {!IS_NATIVE && (
          <Button variant="outline" className="w-full" style={{ background: "#FFFFFF", borderColor: "#747775", color: "#1F1F1F" }} onClick={() => void google()} disabled={busy !== null}>
            {busy === "google" ? <Loader2 className="animate-spin" /> : <GoogleMark />} Continue with Google
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="w-full text-muted-foreground"><Link to="/auth" search={{ redirect: "/" }}>Sign in with email</Link></Button>
        <p className="px-1 text-xs text-muted-foreground">Start without an account and sign in later to keep your notes on every device.</p>
      </div>
    </Column>
  );
}

function Home({ name }: { name: string }) {
  const { data: vault, isLoading } = useVault();
  const start = useStartWriting();
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const opened = useRef(false);
  const live = vault?.notes.filter((n) => !n.deleted_at) ?? [];

  // A brand new person lands on a blank page, ready to write, with the tools one click away.
  useEffect(() => {
    if (isLoading || !vault || live.length || opened.current) return;
    opened.current = true;
    void (async () => {
      try {
        const id = await createNote({ kind: "text", title: "Untitled" });
        await refresh();
        navigate({ to: "/vault/$noteId", params: { noteId: id }, replace: true });
      } catch { opened.current = false; toast.error("Couldn't open a blank note. Please try again."); }
    })();
  }, [isLoading, vault, live.length, navigate, refresh]);

  if (isLoading || !vault || !live.length) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Opening a blank note" /></div>;
  return <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:pt-10"><Dashboard name={name} notes={live} onNew={() => void start()} /></div>;
}

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

function Dashboard({ name, notes, onNew }: { name: string; notes: VNote[]; onNew: () => void }) {
  const { data: study } = useQuery(studyOverviewQuery);
  const pinned = notes.filter((n) => n.pinned).slice(0, 6);
  const recent = [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
  return (
    <>
      <div className={mono}>{today()}</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-4xl font-normal tracking-tight sm:text-5xl">Welcome back{name ? `, ${name}` : ""}.</h1>
        <Button size="lg" onClick={onNew}><PenLine /> New note</Button>
      </div>

      <Link to="/study" className="paper-sheet mt-6 flex items-center gap-3 p-4 hover:ring-2 hover:ring-primary/30">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground"><BookOpenCheck className="h-5 w-5" /></span>
        <span className="flex-1">
          <span className="block font-medium">{study?.dueTotal ? `${study.dueTotal} flashcard${study.dueTotal > 1 ? "s" : ""} due` : "Study"}</span>
          <span className="block text-xs text-muted-foreground">{study?.dueTotal ? "A few minutes keeps them fresh." : study && (study.decks.length || study.quizzes.length) ? "All caught up. Retake a quiz anytime." : "Make flashcards or quizzes from any note with ✦ Generate."}</span>
        </span>
      </Link>

      <section className="mt-6"><h2 className="mb-2 text-sm font-semibold">Pick up where you left off</h2><div className="grid gap-2 md:grid-cols-2">{recent.map((n) => <NoteRow key={n.id} n={n} />)}</div></section>
      {pinned.length > 0 && (
        <section className="mt-6"><h2 className="mb-2 text-sm font-semibold">Pinned</h2><div className="grid gap-2 md:grid-cols-2">{pinned.map((n) => <NoteRow key={n.id} n={n} />)}</div></section>
      )}
    </>
  );
}
