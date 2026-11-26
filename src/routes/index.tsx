import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BookOpenCheck, Loader2, PenLine, Pin } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { GoogleMark } from "@/components/GoogleMark";
import { HomeComposer } from "@/components/home/HomeComposer";
import { Button } from "@/components/ui/button";
import { IS_NATIVE } from "@/lib/firebase";
import { authMessage, ensureSignedIn, rememberNext, signInWithGoogle, useAuth } from "@/lib/auth";
import { studyOverviewQuery } from "@/lib/study";
import { openTarget, useVault, type VNote } from "@/lib/vault";

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

function Welcome() {
  const [busy, setBusy] = useState<"google" | "write" | null>(null);
  async function google() {
    setBusy("google");
    try { rememberNext("/"); await signInWithGoogle(); }
    catch (e) { toast.error(authMessage(e)); }
    finally { setBusy(null); }
  }
  async function write() {
    setBusy("write");
    // A guest is created here and Home takes over: the box is where writing, asking and importing start.
    try { await ensureSignedIn(); } catch { toast.error("Couldn't get started. Please try again."); } finally { setBusy(null); }
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

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** A note counts as started once it has a real title or any text; empty "Untitled" pages stay out of the way. */
const started = (n: VNote) => !!n.markdown.trim() || (!!n.title.trim() && n.title !== "Untitled");

function when(iso: string) {
  const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days < 1 ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : days < 7 ? d.toLocaleDateString(undefined, { weekday: "short" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Home is one box: write, ask your notes, search, paste a link, or drop a file. Below it, only what helps you
 * pick up again (recent notes, topics, cards due), and nothing at all when there is nothing yet.
 */
function Home({ name }: { name: string }) {
  const { data: vault, isLoading } = useVault();
  const { data: study } = useQuery(studyOverviewQuery);
  if (isLoading || !vault) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading your notes" /></div>;

  const live = vault.notes.filter((n) => !n.deleted_at);
  const recent = live.filter(started).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  const fresh = recent.length === 0;
  const topics = vault.folders.slice(0, 8);
  const due = study?.dueTotal ?? 0;

  return (
    <div className={`mx-auto flex w-full max-w-[720px] flex-col px-4 sm:px-6 ${fresh ? "min-h-[calc(100dvh-8rem)] justify-center pb-24" : "pb-16 pt-10 sm:pt-20"}`}>
      <div className={mono}>{today()}</div>
      <h1 className="mb-6 mt-2 font-serif text-[32px] font-normal leading-tight tracking-[-0.01em] sm:text-[40px]">
        {greeting()}{name ? `, ${name}` : ""}.
        {fresh && <span className="block text-muted-foreground">What are you learning today?</span>}
      </h1>

      <HomeComposer notes={live} folders={vault.folders} autoFocus />

      {fresh ? (
        <p className="mt-4 px-1 text-xs leading-relaxed text-muted-foreground">
          Type to start a note. Paste a YouTube or web link and it's divided into notes, one per idea. Press + to scan handwriting, record a lecture or import slides.
        </p>
      ) : (
        <div className="mt-10 space-y-8">
          {due > 0 && (
            <Link to="/study" className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm hover:bg-secondary" data-home-due>
              <BookOpenCheck className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{due} flashcard{due > 1 ? "s" : ""} due</span>
              <span className="text-xs text-muted-foreground">Study →</span>
            </Link>
          )}
          <section aria-labelledby="home-recent">
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h2 id="home-recent" className={mono}>Recent</h2>
              <Link to="/vault" className="text-xs text-muted-foreground hover:text-foreground">All notes</Link>
            </div>
            <ul className="divide-y rounded-xl border">
              {recent.map((n) => (
                <li key={n.id}>
                  <Link {...openTarget(n)} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-secondary/60">
                    <span className="min-w-0 flex-1 truncate text-sm">{n.title || "Untitled"}</span>
                    {n.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-muted-foreground" aria-label="Pinned" />}
                    <span className="shrink-0 text-xs text-muted-foreground">{when(n.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {topics.length > 0 && (
            <section aria-labelledby="home-topics">
              <h2 id="home-topics" className={`${mono} mb-2 px-1`}>Topics</h2>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((f) => <Link key={f.id} to="/topics/$folderId" params={{ folderId: f.id }} className="rounded-full border px-3 py-1 text-xs hover:bg-secondary">{f.name}</Link>)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
