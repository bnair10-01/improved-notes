export type NoteSort = "recent" | "created" | "title";
type N = { title: string; updated_at: string; created_at: string; pinned: boolean };
/** Pinned first, then the chosen order. */
export function sortNotes<T extends N>(notes: T[], by: NoteSort): T[] {
  const cmp = (a: T, b: T) => by === "title" ? (a.title || "Untitled").localeCompare(b.title || "Untitled", undefined, { sensitivity: "base" })
    : (by === "created" ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at));
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || cmp(a, b));
}
