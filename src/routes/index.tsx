import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Pin } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { HomeComposer } from "@/components/home/HomeComposer";
import { useAuth } from "@/lib/auth";
import { studyDueQuery } from "@/lib/study";
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
      {/* Signed out, the front door (LaunchGate) is what you see; there's no separate landing page. */}
      <main>{ready && user ? <Home name={firstName(user.displayName, user.email)} /> : null}</main>
    </div>
  );
}

function firstName(displayName?: string | null, email?: string | null) {
  return (displayName ?? "").split(" ")[0] || email?.split("@")[0] || "";
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }).toUpperCase();

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
  const { data: vault } = useVault();
  const { data: study } = useQuery(studyDueQuery);
  // The greeting and the box show straight away; what's under them fills in as your notes arrive, rather than a spinner first.
  const loading = !vault;
  const live = (vault?.notes ?? []).filter((n) => !n.deleted_at);
  const recent = live.filter(started).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  const fresh = !loading && recent.length === 0;
  const topics = (vault?.folders ?? []).slice(0, 8);
  const due = study?.dueTotal ?? 0;

  return (
    <div className={`mx-auto flex w-full max-w-[720px] flex-col px-4 sm:px-6 ${fresh ? "min-h-[calc(100dvh-8rem)] justify-center pb-24" : "pb-16 pt-10 sm:pt-20"}`}>
      <div className={`${mono} enter`}>{today()}</div>
      <h1 className="enter mb-6 mt-2 font-serif text-[32px] font-normal leading-tight tracking-[-0.01em] sm:text-[40px]">
        {greeting()}{name ? `, ${name}` : ""}.
        {fresh && <span className="block text-muted-foreground">What are you learning today?</span>}
      </h1>

      <div className="enter" style={{ "--i": 2 } as React.CSSProperties}><HomeComposer notes={live} folders={vault?.folders ?? []} autoFocus /></div>

      {fresh ? (
        <p className="mt-4 px-1 text-xs leading-relaxed text-muted-foreground">
          Type a topic and Enter builds notes from Wikipedia and YouTube. Switch to Note to write your own. Paste a YouTube or web link and it's divided into notes, one per idea. Press + to scan handwriting, record a lecture or import slides.
        </p>
      ) : (
        <div className="enter mt-10 space-y-8" style={{ "--i": 4 } as React.CSSProperties}>
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
            <ul className="divide-y rounded-xl border" aria-busy={loading}>
              {loading && [0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-3.5 py-3" aria-hidden><span className="h-3.5 flex-1 animate-pulse rounded bg-secondary" style={{ maxWidth: `${70 - i * 12}%` }} /><span className="h-3 w-10 animate-pulse rounded bg-secondary" /></li>
              ))}
              {recent.map((n, i) => (
                <li key={n.id} className="enter" style={{ "--i": i + 5 } as React.CSSProperties}>
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
