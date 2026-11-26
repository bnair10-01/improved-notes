import { createFolder, createNote, loadVault, syncWikilinks, updateNote } from "./vault";
import { planSplit, type Section } from "./split";

export type SaveSplitInput = {
  topicName: string;
  /** Add to this existing topic instead of making one. */
  folderId?: string | null;
  overview: string;
  sections: Section[];
  source?: string;
  tags?: string[];
};
export type SaveSplitResult = { folderId: string; overviewId: string; ids: string[] };

/** Make the topic (or use the one given), then an overview note and one note per section, all linked together. */
export async function saveSplit(input: SaveSplitInput): Promise<SaveSplitResult> {
  const name = input.topicName.trim() || "Imported notes";
  const vault = await loadVault();
  const folderId =
    input.folderId ??
    vault.folders.find((f) => !f.parent_id && f.name.trim().toLowerCase() === name.toLowerCase())?.id ??
    (await createFolder(name));
  const plan = planSplit({ topic: name, overview: input.overview, sections: input.sections, ...(input.source ? { source: input.source } : {}), existingTitles: vault.notes.filter((n) => !n.deleted_at).map((n) => n.title) });
  const ids: string[] = [];
  for (const p of plan) {
    const id = await createNote({ title: p.title, markdown: p.markdown, kind: "text", folder_id: folderId });
    if (input.tags?.length) await updateNote(id, { tags: input.tags });
    ids.push(id);
  }
  // Turn the [[links]] between them into real links, now that every note exists.
  const fresh = await loadVault();
  for (let i = 0; i < ids.length; i++) await syncWikilinks(fresh, ids[i]!, plan[i]!.markdown);
  return { folderId, overviewId: ids[0]!, ids };
}
