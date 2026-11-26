import { queryOptions } from "@tanstack/react-query";
import { getDocs } from "firebase/firestore";
import { auth } from "./firebase";
import { userCol } from "./db";

type Row = Record<string, unknown> & { id: string };
const all = async (name: "flashcards" | "quizzes" | "attempts"): Promise<Row[]> =>
  (await getDocs(userCol(name))).docs.map((d) => ({ ...d.data(), id: d.id }));

export const studyOverviewQuery = queryOptions({
  queryKey: ["study-overview"],
  queryFn: async () => {
    if (!auth.currentUser) return { decks: [], dueTotal: 0, quizzes: [] };
    const now = new Date().toISOString();
    const [cards, quizzes, attempts] = await Promise.all([all("flashcards"), all("quizzes"), all("attempts")]);
    const decks = new Map<string, { total: number; due: number }>();
    for (const c of cards) {
      const noteId = c["note_id"] as string | undefined;
      if (!noteId) continue;
      const d = decks.get(noteId) ?? { total: 0, due: 0 };
      d.total++; if (String(c["due_at"]) <= now) d.due++;
      decks.set(noteId, d);
    }
    const best = new Map<string, number>();
    for (const a of attempts) {
      const quizId = a["quiz_id"] as string | undefined;
      const score = a["score"] as number | null | undefined;
      if (quizId && score != null) best.set(quizId, Math.max(best.get(quizId) ?? 0, score));
    }
    return {
      decks: [...decks].map(([noteId, d]) => ({ noteId, ...d })),
      dueTotal: [...decks.values()].reduce((s, d) => s + d.due, 0),
      quizzes: quizzes
        .sort((a, b) => String(b["created_at"]).localeCompare(String(a["created_at"])))
        .map((q) => ({
          id: q.id,
          noteId: q["note_id"] as string,
          count: Array.isArray(q["questions"]) ? q["questions"].length : 0,
          best: best.get(q.id) ?? null,
        })),
    };
  },
});
