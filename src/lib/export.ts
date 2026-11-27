export type ExportNote = { id: string; title: string; markdown: string; folder_id: string | null; deleted_at?: string | null };
export type ExportFolder = { id: string; name: string; parent_id: string | null };
export function sanitizeFilename(value: string): string {
  // eslint-disable-next-line no-control-regex
  let name = value.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-").replace(/\s+/g, " ").trim().replace(/^[. ]+|[. ]+$/g, "").slice(0, 90).replace(/[. ]+$/g, "");
  if (!name) name = "Untitled";
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  return name;
}
/** Allocates names case-insensitively; files and folders share a namespace. */
export function buildExportEntries(notes: readonly ExportNote[], folders: readonly ExportFolder[]): { path: string; markdown: string }[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string>();
  const used = new Set<string>();
  const claim = (parent: string, raw: string, suffix: string) => {
    const base = sanitizeFilename(raw);
    let index = 1;
    let path: string;
    do { path = `${parent}${base}${index === 1 ? "" : ` (${index})`}${suffix}`; index++; }
    while (used.has(path.toLocaleLowerCase("en-US")));
    used.add(path.toLocaleLowerCase("en-US"));
    return path;
  };
  const folderPath = (id: string | null, visiting = new Set<string>()): string => {
    if (!id || visiting.has(id)) return "";
    const known = paths.get(id);
    if (known !== undefined) return known;
    const folder = byId.get(id);
    if (!folder) return "";
    const next = new Set(visiting); next.add(id);
    const parent = folderPath(folder.parent_id, next);
    const path = `${claim(parent, folder.name, "")}/`;
    paths.set(id, path);
    return path;
  };
  for (const folder of [...folders].sort((a, b) => a.id.localeCompare(b.id))) folderPath(folder.id);
  return [...notes].filter((note) => !note.deleted_at).sort((a, b) => a.id.localeCompare(b.id)).map((note) => ({
    path: claim(folderPath(note.folder_id), note.title, ".md"), markdown: note.markdown,
  }));
}
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
