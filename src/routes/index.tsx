import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ArrowUp, BookOpenCheck, Loader2, Pin } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { GoogleMark } from "@/components/GoogleMark";
import { AppleMark } from "@/components/AppleMark";
import { NewActionGrid } from "@/components/shell/NewActions";
import { Hint } from "@/components/shell/Hint";
import { Button } from "@/components/ui/button";
import { IS_NATIVE } from "@/lib/firebase";
import { authMessage, rememberNext, signInWithApple, signInWithGoogle, useAuth } from "@/lib/auth";
import { openDialog } from "@/lib/dialogs";
import { prepareImage } from "@/lib/image";
import { setSession } from "@/lib/session";
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

/** Content on the left, the faint "what a topic becomes" preview on the right (laptop and up). */
function Split({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1400px] lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="flex flex-col gap-7 px-5 pb-12 pt-8 sm:px-10 lg:px-16 lg:pt-16">{children}</div>
      <TopicPreview />
    </div>
  );
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

function TopicPreview() {
  return (
    <aside aria-hidden data-distraction className="relative hidden flex-col gap-4 overflow-hidden border-l bg-card/40 p-7 lg:flex">
      <div className={mono}>What a topic becomes</div>
      <p className="font-serif text-[15px] leading-relaxed text-muted-foreground">
        Scans, notes, websites and lectures on one subject end up in one place, linked, summarised and turned into study cards.
      </p>
      <div className="mt-1.5 flex flex-col gap-2.5 opacity-45">
        <div className="font-serif text-3xl leading-tight">Your first topic</div>
        <div className="flex gap-1.5">
          <span className="h-5 w-11 rounded-full bg-foreground" />
          {[70, 56, 64].map((w) => <span key={w} className="h-5 rounded-full border" style={{ width: w }} />)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="row-span-2 flex flex-col gap-2 rounded-xl border p-2.5">
            <span className="font-mono text-[9px] text-muted-foreground">SCAN</span>
            <div className="h-28 rounded bg-[repeating-linear-gradient(135deg,var(--secondary)_0_8px,var(--card)_8px_16px)]" />
            <span className="h-2 w-4/5 rounded-sm bg-border" /><span className="h-2 w-1/2 rounded-sm bg-secondary" />
          </div>
          {["WEBSITE", "PDF", "YOUTUBE"].map((k) => (
            <div key={k} className="flex flex-col gap-2 rounded-xl border p-2.5">
              <span className="font-mono text-[9px] text-muted-foreground">{k}</span>
              <span className="h-2 w-[90%] rounded-sm bg-border" /><span className="h-2 w-3/5 rounded-sm bg-secondary" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-xl border p-3">
          <span className="font-serif text-2xl">9</span>
          <span className="flex-1 text-xs text-muted-foreground">cards due<br />about 4 min</span>
          <span className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background">Study</span>
        </div>
      </div>
    </aside>
  );
}

const STARTS = [
  { n: "01", title: "Scan a page", body: "Photograph handwritten notes. We transcribe them." },
  { n: "02", title: "Write or draw", body: "Type, or use a pen on tablet." },
  { n: "03", title: "Add a source", body: "A PDF, slides or a lecture recording." },
];

function StartCards({ onPick }: { onPick: (i: number) => void }) {
  return (
    <div className="grid max-w-[640px] grid-cols-1 gap-2.5 sm:grid-cols-3">
      {STARTS.map((c, i) => (
        <button key={c.n} type="button" onClick={() => onPick(i)} className="flex flex-col gap-6 rounded-xl border p-4 text-left transition-colors hover:bg-card/70 sm:gap-7">
          <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground">{c.n}</span>
          <span><span className="block text-[14.5px] font-medium">{c.title}</span><span className="mt-1 block text-[12.5px] leading-snug text-muted-foreground">{c.body}</span></span>
        </button>
      ))}
    </div>
  );
}

/** One input that takes anything typed, pasted or dropped. */
function CaptureBar() {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      let host = "";
      try { if (/^https?:\/\/\S+$/i.test(t)) host = new URL(t).hostname; } catch { /* not a link */ }
      const id = await createNote({ kind: "text", title: host || t.split("\n")[0]!.slice(0, 60), markdown: host ? `[${t}](${t})\n` : t });
      await refresh();
      if (host) toast("Saved the link as a note. Reading web pages and YouTube isn't supported yet.");
      navigate({ to: "/vault/$noteId", params: { noteId: id } });
    } catch { toast.error("Couldn't save that. Please try again."); }
    finally { setBusy(false); }
  }

  async function drop(files: FileList | null) {
    const list = Array.from(files ?? []);
    const images = list.filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      const added = await Promise.all(images.map(async (f) => ({ id: crypto.randomUUID(), dataUrl: await prepareImage(f) })));
      setSession({ pages: added, result: null, noteId: null });
      navigate({ to: "/capture" });
    } else if (list.some((f) => f.type === "application/pdf" || /\.pptx?$/i.test(f.name))) openDialog("slides");
    else if (list.length) toast("That file type isn't supported yet. Try a photo, PDF or slides.");
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void drop(e.dataTransfer.files); }}
      className={`flex max-w-[640px] items-center gap-2.5 rounded-2xl border bg-card py-2 pl-4 pr-2 transition-colors ${over ? "border-foreground" : ""}`}
    >
      <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Write something, paste a link, or drop a file"
        placeholder="Write something, paste a link, or drop a file" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-muted-foreground" />
      <kbd className="hidden rounded border px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground sm:block">↵</kbd>
      <button type="submit" disabled={busy || !text.trim()} aria-label="Save" className="grid h-10 w-10 place-items-center rounded-[10px] bg-foreground text-background disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
      </button>
    </form>
  );
}

function Welcome() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function social(signIn: () => Promise<unknown>) {
    setBusy(true);
    try {
      rememberNext("/");
      await signIn();
    } catch (e) { toast.error(authMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Split>
      <Headline line1="Take notes. See the map." line2="Learn it." />
      <p className="max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
        Scan handwriting or type, link ideas together, and study with flashcards and quizzes made only from what you wrote. AI runs on your device first.
      </p>
      <div className="max-w-sm">
        {!IS_NATIVE && (
          <div className="space-y-2">
            <Button variant="outline" className="w-full" style={{ background: "#FFFFFF", borderColor: "#747775", color: "#1F1F1F" }} onClick={() => void social(signInWithGoogle)} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <GoogleMark />} Continue with Google
            </Button>
            <Button className="w-full" style={{ background: "#000000", color: "#FFFFFF", border: "1px solid #000000" }} onClick={() => void social(signInWithApple)} disabled={busy}>
              <AppleMark /> Continue with Apple
            </Button>
          </div>
        )}
        <Button asChild variant="ghost" size="sm" className="mt-1 w-full text-muted-foreground"><Link to="/auth" search={{ redirect: "/" }}>Use email instead</Link></Button>
      </div>
      <StartCards onPick={() => navigate({ to: "/capture" })} />
      <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground">
        <span className={mono}>or</span>
        <Link to="/capture" className="rounded-lg border px-3 py-1.5 text-foreground">Try it without an account</Link>
      </div>
    </Split>
  );
}

function Home({ name }: { name: string }) {
  const { data: vault, isLoading } = useVault();
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  const live = vault?.notes.filter((n) => !n.deleted_at) ?? [];
  if (isLoading || !vault) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (live.length) return <div className="mx-auto max-w-5xl px-4 pb-10 pt-5 sm:pt-10"><Dashboard name={name} /></div>;

  async function writeNote() {
    try {
      const id = await createNote({ kind: "text", title: "Untitled" });
      await refresh();
      navigate({ to: "/vault/$noteId", params: { noteId: id } });
    } catch { toast.error("Couldn't create the note."); }
  }
  return (
    <Split>
      <Headline line1={name ? `Welcome, ${name}.` : "Welcome."} line2="What are you exploring today?" />
      <CaptureBar />
      <StartCards onPick={(i) => { if (i === 0) navigate({ to: "/capture" }); else if (i === 1) void writeNote(); else openDialog("slides"); }} />
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
        <span className={mono}>or</span>
        <button type="button" onClick={() => openDialog("audio")} className="rounded-lg border px-3 py-1.5 text-foreground">Record audio</button>
        <Link to="/settings" className="rounded-lg border px-3 py-1.5 text-foreground">Import a backup</Link>
      </div>
    </Split>
  );
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

function Dashboard({ name }: { name: string }) {
  const { data: vault } = useVault();
  const { data: study } = useQuery(studyOverviewQuery);
  const live = vault?.notes.filter((n) => !n.deleted_at) ?? [];
  const pinned = live.filter((n) => n.pinned).slice(0, 6);
  return (
    <>
      <div className={mono}>{today()}</div>
      <h1 className="mt-2 font-serif text-4xl font-normal tracking-tight sm:text-5xl">Welcome back{name ? `, ${name}` : ""}.</h1>
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
