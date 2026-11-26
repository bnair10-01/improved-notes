import { useQuery } from "@tanstack/react-query";
import { getDoc, setDoc } from "firebase/firestore";
import { requireUid, userDoc, nowIso } from "./db";
import { useAuth } from "@/lib/auth";

// Also the deterministic tie-breaking order.
export const STYLES = ["visual", "auditory", "reading", "hands_on", "analytical"] as const;
export type LearningStyle = typeof STYLES[number];
export const STYLE_LABELS: Record<LearningStyle, string> = {
  visual: "Visual", auditory: "Listening", reading: "Reading & writing",
  hands_on: "Hands-on", analytical: "Analytical",
};
const optionSet = (labels: readonly string[]) => STYLES.map((style, i) => ({ style, label: labels[i] ?? STYLE_LABELS[style] }));
export const QUESTIONS = [
  { prompt: "How would you start exploring a new topic?", options: optionSet(["Look at a diagram", "Hear an explanation", "Read an overview", "Try a small activity", "Understand the underlying rules"]) },
  { prompt: "What helps an idea stick?", options: optionSet(["A memorable image", "Saying it aloud", "Writing a summary", "Practising it", "Connecting causes and effects"]) },
  { prompt: "When something is confusing, what would you try?", options: optionSet(["Sketch a map", "Talk it through", "Read another explanation", "Work through an example", "Break it into logical steps"]) },
  { prompt: "How do you like to review?", options: optionSet(["Scan a concept map", "Listen to a recap", "Read my notes", "Test myself with a task", "Compare and classify ideas"]) },
  { prompt: "How would you explain an idea to a friend?", options: optionSet(["Draw it", "Describe it aloud", "Write instructions", "Demonstrate it", "Explain why it works"]) },
] as const;
export function isLearningStyle(value: unknown): value is LearningStyle {
  return STYLES.some((style) => style === value);
}
export function scoreStyle(answers: readonly LearningStyle[]): LearningStyle {
  const scores = Object.fromEntries(STYLES.map((style) => [style, 0])) as Record<LearningStyle, number>;
  for (const answer of answers) if (isLearningStyle(answer)) scores[answer]++;
  return STYLES.reduce((best, style) => scores[style] > scores[best] ? style : best, STYLES[0]);
}
export type HomeSection = "create" | "study" | "map";
export function homeOrder(style: LearningStyle | null | undefined): HomeSection[] {
  if (style === "visual") return ["map", "study", "create"];
  if (style === "hands_on") return ["create", "study", "map"];
  if (style === "analytical") return ["study", "map", "create"];
  if (style === "auditory" || style === "reading") return ["study", "create", "map"];
  return ["create", "study", "map"];
}
export function defaultNoteTab(style: LearningStyle | null | undefined): "read" | "map" | "listen" {
  return style === "visual" ? "map" : style === "auditory" ? "listen" : "read";
}
export function useLearningStyle() {
  const { user, ready } = useAuth();
  const query = useQuery({
    queryKey: ["learning-style", user?.uid], enabled: ready && !!user,
    queryFn: async () => {
      if (!user) throw new Error("Please sign in.");
      const snap = await getDoc(userDoc("settings", "profile", user.uid));
      const value = snap.exists() ? snap.get("learning_style") : null;
      return isLearningStyle(value) ? value : null;
    },
  });
  return { ...query, userId: user?.uid ?? null };
}
export async function saveLearningStyle(style: LearningStyle): Promise<void> {
  if (!isLearningStyle(style)) throw new Error("Choose a learning preference.");
  requireUid();
  await setDoc(userDoc("settings", "profile"), { learning_style: style, updated_at: nowIso() }, { merge: true });
}
