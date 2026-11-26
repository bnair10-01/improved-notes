import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { QUESTIONS, saveLearningStyle, scoreStyle, type LearningStyle } from "@/lib/learning";

export function LearningQuiz({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) {
  const [answers, setAnswers] = useState<LearningStyle[]>([]);
  const [choice, setChoice] = useState<LearningStyle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const question = QUESTIONS[answers.length];
  if (!question) return null;
  const submit = async () => {
    if (!choice || busy) return;
    const next = [...answers, choice];
    if (next.length < QUESTIONS.length) { setAnswers(next); setChoice(null); return; }
    setBusy(true); setError("");
    try {
      await saveLearningStyle(scoreStyle(next));
      await client.invalidateQueries({ queryKey: ["learning-style"] });
      onComplete();
    } catch { setError("We couldn't save your preference. Please try again."); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground" aria-live="polite">Question {answers.length + 1} of {QUESTIONS.length}</p>
    <fieldset disabled={busy} className="space-y-2">
      <legend className="mb-3 font-medium">{question.prompt}</legend>
      {question.options.map((option) => <label key={option.style} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:bg-accent">
        <input type="radio" name="learning-answer" value={option.style} checked={choice === option.style} onChange={() => setChoice(option.style)} />{option.label}
      </label>)}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap justify-between gap-2">
      <Button variant="ghost" disabled={busy} onClick={onSkip}>Skip for now</Button>
      <div className="flex gap-2">
        {answers.length > 0 && <Button variant="outline" disabled={busy} onClick={() => { setChoice(answers[answers.length - 1] ?? null); setAnswers(answers.slice(0, -1)); setError(""); }}>Back</Button>}
        <Button disabled={!choice || busy} onClick={() => void submit()}>{busy ? "Saving…" : answers.length === QUESTIONS.length - 1 ? "Save preference" : "Next"}</Button>
      </div>
    </div>
  </div>;
}
