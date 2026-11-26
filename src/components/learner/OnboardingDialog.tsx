import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVault } from "@/lib/vault";
import { QUESTIONS, saveLearningStyle, scoreStyle, useLearningStyle, type LearningStyle } from "@/lib/learning";

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
export function OnboardingDialog() {
  const profile = useLearningStyle();
  const { data: vault } = useVault();
  // First-run stays clean: ask about learning preferences only once there is something to learn from.
  const hasNotes = !!vault?.notes.some((n) => !n.deleted_at);
  const [skip, setSkip] = useState<{ userId: string; skipped: boolean } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!profile.userId) { setSkip(null); return; }
    let skipped = false;
    try { skipped = localStorage.getItem(`learner-skipped:${profile.userId}`) === "1"; } catch { /* device storage unavailable */ }
    setSkip({ userId: profile.userId, skipped });
  }, [profile.userId]);
  const dismiss = () => {
    if (!profile.userId) return;
    try { localStorage.setItem(`learner-skipped:${profile.userId}`, "1"); } catch { /* still dismiss for this session */ }
    setDismissed(profile.userId);
  };
  const open = hasNotes && !!profile.userId && profile.isSuccess && profile.data === null && skip?.userId === profile.userId && !skip.skipped && dismissed !== profile.userId;
  return <Dialog open={open} onOpenChange={(value) => { if (!value) dismiss(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Make this space yours</DialogTitle><DialogDescription>Five quick questions about what you enjoy. These are preferences, not fixed abilities—you can change them anytime in Settings.</DialogDescription></DialogHeader>
      {open && <LearningQuiz key={profile.userId} onComplete={() => setDismissed(profile.userId)} onSkip={dismiss} />}
    </DialogContent>
  </Dialog>;
}
