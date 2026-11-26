import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { commit, newId, nowIso, userCol, userDoc } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDue, schedule, type Grade } from "@/lib/srs";
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
      const quiz = z.docs[0] ? { id: z.docs[0].id, questions: z.docs[0].get("questions") as Question[] } : null;
      return { cards, quiz };
    },
  });
  if (!q.data) return null;
  if (q.data.cards.length) return <Flashcards noteId={noteId} cards={q.data.cards} />;
  if (q.data.quiz) return <Quiz quizId={q.data.quiz.id} questions={q.data.quiz.questions} sourceIds={sourceIds} />;
  return null;
}

function Flashcards({ noteId, cards }: { noteId: string; cards: FCard[] }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"study" | "edit">("study");
  const [flipped, setFlipped] = useState(false);
  const [all, setAll] = useState(false);
  const queue = useMemo(() => (all ? cards : cards.filter((c) => isDue(c.due_at))), [cards, all]);
  const card = queue[0];
  const reload = () => qc.invalidateQueries({ queryKey: ["study", noteId] });

  async function grade(g: Grade) {
    if (!card) return;
    const next = schedule(card, g);
    await commit(updateDoc(userDoc("flashcards", card.id), { ...next }));
    await commit(setDoc(userDoc("attempts", newId()), { flashcard_id: card.id, quiz_id: null, score: g === "know" ? 1 : 0, details: { grade: g }, created_at: nowIso() }));
    setFlipped(false);
    if (all) setAll(false);
    await reload();
  }

  function exportCsv() {
    const blob = new Blob([toAnkiCsv(cards.map((c) => ({ ...c, card_type: c.card_type as "qa" })))], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "flashcards.csv"; a.click();
  }

  const shown = card ? (card.card_type === "cloze" ? clozeParts(card.front) : { prompt: card.front, answer: card.back }) : null;
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
            <button onClick={() => setFlipped(!flipped)} className="paper-sheet flex min-h-52 w-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="font-serif text-xl">{shown.prompt}</p>
              {flipped ? <>
                <p className="border-t pt-3 text-lg text-primary">{shown.answer || "—"}</p>
                {card?.source_snippet && <p className="text-xs text-muted-foreground" data-source>From your notes: <q className="[quotes:'“''”']">{card.source_snippet}</q></p>}
              </> : <p className="text-xs text-muted-foreground">Tap to flip</p>}
            </button>
            {flipped && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" onClick={() => grade("again")}><RotateCcw /> Review again</Button>
                <Button size="lg" onClick={() => grade("know")}><Check /> Know it</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="paper-sheet p-6 text-center">
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

function Quiz({ quizId, questions, sourceIds }: { quizId: string; questions: Question[]; sourceIds: string[] }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);
  const results = questions.map((q, i) => ({ topic: q.topic, correct: isCorrect(q, answers[i] ?? "") }));
  const score = results.filter((r) => r.correct).length;
  const weak = weakTopics(results);

  async function submit() {
    setDone(true);
    await commit(setDoc(userDoc("attempts", newId()), { quiz_id: quizId, flashcard_id: null, score: score / questions.length, details: { results }, created_at: nowIso() }));
  }

  return (
    <section className="mt-5 space-y-3">
      {done && (
        <div className="paper-sheet p-4">
          <p className="font-serif text-xl">Score: {score} / {questions.length}</p>
          {weak.length ? <>
            <p className="mt-1 text-sm text-muted-foreground">Weak topics: {weak.join(", ")}</p>
            {sourceIds.length > 0 && <div className="mt-3"><GenerateDialog noteIds={sourceIds} focusTopics={weak} trigger={<Button size="sm">Quiz me on weak topics</Button>} /></div>}
          </> : <p className="mt-1 text-sm text-muted-foreground">No weak topics — nice work.</p>}
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setAnswers({}); setDone(false); }}><RotateCcw /> Retake</Button>
        </div>
      )}
      {questions.map((q, i) => {
        const r = results[i]!;
        return (
          <div key={i} className="paper-sheet p-4">
            <p className="font-medium">{i + 1}. {q.question}</p>
            {q.type === "short" ? (
              <Input className="mt-2" value={answers[i] ?? ""} disabled={done} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} placeholder="Your answer" />
            ) : (
              <div className="mt-2 grid gap-1.5">
                {q.options.map((o) => {
                  const picked = answers[i] === o;
                  const tone = done ? (o === q.answer ? "border-primary bg-primary/10" : picked ? "border-destructive bg-destructive/10" : "") : picked ? "border-primary bg-secondary" : "";
                  return <button key={o} disabled={done} onClick={() => setAnswers({ ...answers, [i]: o })} className={`rounded-md border px-3 py-2.5 text-left text-sm ${tone}`}>{o}</button>;
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
