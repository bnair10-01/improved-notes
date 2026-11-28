import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { commit, newId, nowIso, userCol, userDoc } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDue, schedule, type Grade } from "@/lib/srs";
import { hintFor, LEVEL_BONUS, LEVEL_NAMES, LEVEL_NOTE, looseMatch, nextDifficulty, START_RUN, step, UP_AFTER, isDifficulty, type Difficulty, type Run } from "@/lib/adapt";
import { clozeParts, isCorrect, toAnkiCsv, weakTopics, type Question } from "@/lib/study-validate";
import { GenerateDialog } from "./GenerateDialog";

type FCard = { id: string; front: string; back: string; card_type: string; due_at: string; reps: number; interval_days: number; ease: number; source_snippet: string };

export function StudyPanel({ noteId, sourceIds }: { noteId: string; sourceIds: string[] }) {
  const q = useQuery({
    queryKey: ["study", noteId],
    queryFn: async () => {
      const [c, z] = await Promise.all([
        getDocs(query(userCol("flashcards"), where("note_id", "==", noteId))),
        getDocs(query(userCol("quizzes"), where("note_id", "==", noteId))),
      ]);
      const cards = c.docs.map((d) => ({ ...(d.data() as Omit<FCard, "id">), id: d.id, created_at: d.get("created_at") as string }))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) as FCard[];
      const quiz = z.docs[0] ? { id: z.docs[0].id, questions: z.docs[0].get("questions") as Question[], difficulty: isDifficulty(z.docs[0].get("difficulty")) ? (z.docs[0].get("difficulty") as Difficulty) : "medium" } : null;
      return { cards, quiz };
    },
  });
  if (!q.data) return null;
  if (q.data.cards.length) return <Flashcards noteId={noteId} cards={q.data.cards} />;
  if (q.data.quiz) return <Quiz quizId={q.data.quiz.id} questions={q.data.quiz.questions} difficulty={q.data.quiz.difficulty} sourceIds={sourceIds} />;
  return null;
}

function Flashcards({ noteId, cards }: { noteId: string; cards: FCard[] }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"study" | "edit">("study");
  const [flipped, setFlipped] = useState(false);
  const [all, setAll] = useState(false);
  const [run, setRun] = useState<Run>(START_RUN);
  const [moved, setMoved] = useState<"up" | "down" | null>(null);
  const [typed, setTyped] = useState("");
  // Weakest cards first, so the ones you're shaky on get the most attention.
  const queue = useMemo(() => [...(all ? cards : cards.filter((c) => isDue(c.due_at)))].sort((a, b) => a.ease - b.ease), [cards, all]);
  const card = queue[0];
  const reload = () => qc.invalidateQueries({ queryKey: ["study", noteId] });

  async function grade(g: Grade) {
    if (!card) return;
    const next = schedule(card, g, new Date(), g === "know" ? LEVEL_BONUS[run.level] : 1);
    await commit(updateDoc(userDoc("flashcards", card.id), { ...next }));
    await commit(setDoc(userDoc("attempts", newId()), { flashcard_id: card.id, quiz_id: null, score: g === "know" ? 1 : 0, details: { grade: g, level: run.level }, created_at: nowIso() }));
    const r = step(run, g === "know");
    setRun({ level: r.level, right: r.right, wrong: r.wrong }); setMoved(r.moved);
    setFlipped(false); setTyped("");
    if (all) setAll(false);
    await reload();
  }

  function exportCsv() {
    const blob = new Blob([toAnkiCsv(cards.map((c) => ({ ...c, card_type: c.card_type as "qa" })))], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "flashcards.csv"; a.click();
  }

  const shown = card ? (card.card_type === "cloze" ? clozeParts(card.front) : { prompt: card.front, answer: card.back }) : null;
  const recall = run.level === 2 && !flipped;
  const typedRight = flipped && run.level === 2 && typed.trim() ? looseMatch(typed, shown?.answer ?? "") : null;
  const suggested: Grade | null = typedRight === null ? null : typedRight ? "know" : "again";
  return (
    <section className="mt-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Flashcards · {cards.filter((c) => isDue(c.due_at)).length} due of {cards.length}</h2>
        <Button size="sm" variant="ghost" onClick={() => setMode(mode === "study" ? "edit" : "study")}>{mode === "study" ? <><Pencil /> Edit</> : "Study"}</Button>
        <Button size="sm" variant="ghost" onClick={exportCsv} aria-label="Export CSV"><Download /> CSV</Button>
      </div>
      {mode === "study" ? (
        shown ? (
          <div>
            <div data-level-bar title={LEVEL_NOTE[run.level]} className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              {LEVEL_NAMES.map((n, i) => (
                <span key={n} data-level={i} aria-current={i === run.level} className={`rounded-full px-2.5 py-0.5 transition-all duration-300 ${i === run.level ? "scale-105 bg-secondary font-medium text-foreground" : ""}`}>{n}</span>
              ))}
              <span className="ml-auto flex items-center gap-1" aria-label={`${run.right} right in a row`}>
                {Array.from({ length: UP_AFTER }, (_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${i < run.right ? "scale-125 bg-primary" : "bg-border"}`} />)}
              </span>
            </div>
            {moved && <p key={run.level} role="status" data-level-note className="enter-pop mb-2 rounded-lg bg-accent/60 px-3 py-1.5 text-xs text-accent-foreground">
              {moved === "up" ? `Nice streak. Stepping up to ${LEVEL_NAMES[run.level]}. ${LEVEL_NOTE[run.level]}` : `Easing off to ${LEVEL_NAMES[run.level]}. ${LEVEL_NOTE[run.level]}`}
            </p>}
            {recall ? (
              <form key={card!.id} onSubmit={(e) => { e.preventDefault(); setFlipped(true); }} className="paper-sheet enter-pop flex min-h-52 w-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="font-serif text-xl">{shown.prompt}</p>
                <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type what you remember" aria-label="Your answer" className="max-w-sm text-center" />
                <div className="flex gap-3 text-sm">
                  <Button type="submit" size="sm">Check</Button>
                  <button type="button" onClick={() => { setTyped(""); setFlipped(true); }} className="text-muted-foreground underline-offset-2 hover:underline">Show answer</button>
                </div>
              </form>
            ) : (
              <button key={`${card!.id}-${flipped}`} onClick={() => setFlipped(!flipped)} className={`paper-sheet flex min-h-52 w-full flex-col items-center justify-center gap-3 p-6 text-center ${flipped ? "flip-in" : "enter-pop"}`}>
                <p className="font-serif text-xl">{shown.prompt}</p>
                {flipped ? <>
                  {typedRight !== null && <p data-typed-result className={`text-sm ${typedRight ? "text-primary" : "text-destructive"}`}>{typedRight ? "Looks right" : `Not quite. You wrote “${typed.trim()}”`}</p>}
                  <p className="border-t pt-3 text-lg text-primary">{shown.answer || "—"}</p>
                  {card?.source_snippet && <p className="text-xs text-muted-foreground" data-source>From your notes: <q className="[quotes:'“''”']">{card.source_snippet}</q></p>}
                </> : <>
                  {run.level === 0 && shown.answer && <p data-hint className="font-mono text-sm tracking-widest text-muted-foreground">Hint: {hintFor(shown.answer)}</p>}
                  <p className="text-xs text-muted-foreground">Tap to flip</p>
                </>}
              </button>
            )}
            {flipped && (
              <div className="enter-pop mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" className={suggested === "again" ? "ring-2 ring-primary/50" : ""} onClick={() => grade("again")}><RotateCcw /> Review again</Button>
                <Button size="lg" className={suggested === "know" ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-background" : ""} onClick={() => grade("know")}><Check /> Know it</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="paper-sheet enter-pop p-6 text-center">
            <p className="font-serif text-lg">All caught up</p>
            <p className="mt-1 text-sm text-muted-foreground">No cards are due right now. Come back later, or practise anyway.</p>
            <Button className="mt-3" variant="outline" onClick={() => setAll(true)}>Practise all cards</Button>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {cards.map((c) => <CardEditor key={c.id} card={c} onChange={reload} />)}
        </div>
      )}
    </section>
  );
}

function CardEditor({ card, onChange }: { card: FCard; onChange: () => void }) {
  async function save(patch: Partial<FCard>) { await commit(updateDoc(userDoc("flashcards", card.id), { ...patch })); onChange(); }
  return (
    <div className="paper-sheet flex gap-2 p-2">
      <div className="flex-1 space-y-1.5">
        <Input defaultValue={card.front} aria-label="Front" onBlur={(e) => e.target.value !== card.front && save({ front: e.target.value })} />
        {card.card_type !== "cloze" && <Input defaultValue={card.back} aria-label="Back" onBlur={(e) => e.target.value !== card.back && save({ back: e.target.value })} />}
      </div>
      <Button variant="ghost" size="icon" aria-label="Delete card" onClick={async () => { await commit(deleteDoc(userDoc("flashcards", card.id))); onChange(); toast("Card deleted"); }}><Trash2 /></Button>
    </div>
  );
}

const WORD: Record<Difficulty, string> = { easy: "easier", medium: "medium", hard: "harder" };

function Quiz({ quizId, questions, difficulty, sourceIds }: { quizId: string; questions: Question[]; difficulty: Difficulty; sourceIds: string[] }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);
  const results = questions.map((q, i) => ({ topic: q.topic, correct: isCorrect(q, answers[i] ?? "") }));
  const score = results.filter((r) => r.correct).length;
  const weak = weakTopics(results);
  const pct = Math.round((score / Math.max(1, questions.length)) * 100);
  const next = nextDifficulty(difficulty, score / Math.max(1, questions.length));

  async function submit() {
    setDone(true);
    await commit(setDoc(userDoc("attempts", newId()), { quiz_id: quizId, flashcard_id: null, score: score / questions.length, details: { results, difficulty }, created_at: nowIso() }));
  }

  return (
    <section className="mt-5 space-y-3">
      {done && (
        <div className="paper-sheet enter-pop p-4" data-quiz-result>
          <p className="font-serif text-xl">Score: {score} / {questions.length} <span className="text-base text-muted-foreground">({pct}%)</span></p>
          <p data-next-difficulty className="mt-1 text-sm">
            {next === difficulty
              ? (difficulty === "easy" && pct < 50 ? "Still tricky. The next quiz stays easy; practising the weak topics below will help." : `That was about right for ${difficulty === "easy" ? "an" : "a"} ${difficulty} quiz. The next one stays ${difficulty}.`)
              : next === "hard" || (next === "medium" && difficulty === "easy")
                ? `You're ready for more. The next quiz steps up to ${next}.`
                : `Let's ease off. The next quiz steps down to ${next}.`}
          </p>
          {weak.length ? <p className="mt-1 text-sm text-muted-foreground">Weak topics: {weak.join(", ")}</p> : <p className="mt-1 text-sm text-muted-foreground">No weak topics. Nice work.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {sourceIds.length > 0 && <GenerateDialog noteIds={sourceIds} initialKind="quiz" initialDifficulty={next} trigger={<Button size="sm">New {WORD[next]} quiz</Button>} />}
            {weak.length > 0 && sourceIds.length > 0 && <GenerateDialog noteIds={sourceIds} focusTopics={weak} initialDifficulty={next} trigger={<Button size="sm" variant="outline">Practise weak topics</Button>} />}
            <Button size="sm" variant="ghost" onClick={() => { setAnswers({}); setDone(false); }}><RotateCcw /> Retake</Button>
          </div>
        </div>
      )}
      {questions.map((q, i) => {
        const r = results[i]!;
        return (
          <div key={i} className="paper-sheet enter p-4" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
            <p className="font-medium">{i + 1}. {q.question}</p>
            {q.type === "short" ? (
              <Input className="mt-2" value={answers[i] ?? ""} disabled={done} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} placeholder="Your answer" />
            ) : (
              <div className="mt-2 grid gap-1.5">
                {q.options.map((o) => {
                  const picked = answers[i] === o;
                  const tone = done ? (o === q.answer ? "border-primary bg-primary/10" : picked ? "border-destructive bg-destructive/10" : "") : picked ? "border-primary bg-secondary" : "";
                  const right = done && o === q.answer, wrong = done && picked && o !== q.answer;
                  return <button key={o} disabled={done} onClick={() => setAnswers({ ...answers, [i]: o })} className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${tone} ${picked && !done ? "pop" : ""} ${right ? "pop" : ""} ${wrong ? "shake" : ""}`}>{o}</button>;
                })}
              </div>
            )}
            {done && <p className={`mt-2 text-sm ${r.correct ? "text-primary" : "text-destructive"}`}>{r.correct ? "Correct." : `Answer: ${q.answer}.`} <span className="text-muted-foreground">{q.explanation}</span>{q.source_snippet && <span className="mt-1 block text-xs text-muted-foreground" data-source>From your notes: <q className="[quotes:'“''”']">{q.source_snippet}</q></span>}</p>}
          </div>
        );
      })}
      {!done && <Button className="w-full" size="lg" onClick={submit} disabled={Object.keys(answers).length === 0}>Check answers</Button>}
    </section>
  );
}
