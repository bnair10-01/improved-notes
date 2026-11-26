import { writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { commit, newId, nowIso, userDoc } from "./db";
import { loadVault } from "./vault";
import { explain } from "./ai/run";
import { generateMaterial, STYLE_LABEL, type GenKind, type GenOptions, type SummaryStyle } from "./ai/tasks";
import { CARD_MAX, CARD_MIN, QUIZ_MAX, QUIZ_MIN, clampCount, validateCards, validateQuestions } from "./study-validate";
import { slidesToMarkdown, validateSlides } from "./slides";

export type { GenKind, SummaryStyle };
export type GenInput = GenOptions & { noteIds: string[] };
export type GenResponse = { ok: true; noteId: string } | { ok: false; error: string };

const GENERATED_FOLDER = "Generated";

/** Make a summary, flashcards, quiz or slides from notes, and save the result into the vault. */
export async function generateFromNotes(input: GenInput): Promise<GenResponse> {
  const { noteIds, ...opts } = input;
  if (!noteIds.length || noteIds.length > 50) return { ok: false, error: "Pick 1–50 notes." };

  const vault = await loadVault();
  const notes = vault.notes.filter((n) => noteIds.includes(n.id) && !n.deleted_at);
  if (!notes.length) return { ok: false, error: "Couldn't read those notes." };
  const text = notes.map((n) => `# ${n.title}\n${n.markdown}`).join("\n\n");
  if (!text.replace(/\[illegible\]/gi, "").trim()) return { ok: false, error: "These notes are empty." };
  const srcTitle = notes.length === 1 ? notes[0]!.title : `${notes.length} notes`;

  let args: Record<string, unknown>;
  try {
    args = await generateMaterial(opts, text);
  } catch (e) {
    const f = explain(e);
    if (f.kind === "other") console.error("generateFromNotes failed", e);
    return { ok: false, error: f.message };
  }

  const stamp = nowIso().slice(0, 16).replace("T", " ");
  let title: string, markdown: string;
  let cards: ReturnType<typeof validateCards> = [];
  let questions: ReturnType<typeof validateQuestions> = [];
  if (opts.kind === "summary") {
    markdown = String(args["markdown"] ?? "").trim();
    if (!markdown) return { ok: false, error: "Nothing came back. Try again." };
    title = `${STYLE_LABEL[opts.style ?? "key_points"]}: ${srcTitle} (${stamp})`;
  } else if (opts.kind === "slides") {
    const slides = validateSlides(args["slides"], opts.count ?? 10);
    if (slides.length < 5) return { ok: false, error: "Not enough usable material for five slides. Add more notes or try again." };
    if (!opts.speakerNotes) for (const slide of slides) slide.notes = "";
    markdown = slidesToMarkdown(slides);
    title = `Slides: ${srcTitle} (${stamp})`;
  } else if (opts.kind === "flashcards") {
    cards = validateCards((args["cards"] as unknown[]) ?? [], clampCount(opts.count ?? 12, CARD_MIN, CARD_MAX));
    if (!cards.length) return { ok: false, error: "Couldn't make usable cards from these notes." };
    title = `Flashcards: ${srcTitle} (${stamp})`;
    markdown = `${cards.length} flashcards made from your notes. Study them below.`;
  } else {
    questions = validateQuestions((args["questions"] as unknown[]) ?? [], clampCount(opts.count ?? 8, QUIZ_MIN, QUIZ_MAX));
    if (!questions.length) return { ok: false, error: "Couldn't make usable questions from these notes." };
    title = `Quiz: ${srcTitle} (${stamp})`;
    markdown = `${questions.length}-question ${opts.difficulty ?? "medium"} quiz made from your notes.`;
  }
  markdown += `\n\n**Sources:** ${notes.map((n) => `[[${n.title}]]`).join(", ")}`;

  const batch = writeBatch(db);
  const now = nowIso();
  let folderId = vault.folders.find((f) => f.name === GENERATED_FOLDER && !f.parent_id)?.id;
  if (!folderId) {
    folderId = newId();
    batch.set(userDoc("folders", folderId), { name: GENERATED_FOLDER, parent_id: null, created_at: now });
  }
  const noteId = newId();
  const ids = notes.map((n) => n.id);
  batch.set(userDoc("notes", noteId), {
    title, markdown, kind: opts.kind === "slides" ? "slides" : "generated", folder_id: folderId, tags: [], pinned: false,
    deleted_at: null, source_note_ids: ids, created_at: now, updated_at: now, rev: 1,
  });
  for (const to of ids) batch.set(userDoc("links", newId()), { from_note_id: noteId, to_note_id: to, kind: "wikilink", label: null, created_at: now });
  for (const c of cards) {
    batch.set(userDoc("flashcards", newId()), { ...c, note_id: noteId, source_note_ids: ids, due_at: now, reps: 0, interval_days: 0, ease: 2.5, created_at: now });
  }
  if (questions.length) {
    batch.set(userDoc("quizzes", newId()), { title, note_id: noteId, questions, difficulty: opts.difficulty ?? "medium", source_note_ids: ids, created_at: now });
  }
  try {
    await commit(batch.commit());
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Couldn't save the result." };
  }
  return { ok: true, noteId };
}
