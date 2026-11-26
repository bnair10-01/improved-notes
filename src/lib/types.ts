export type Page = { id: string; dataUrl: string; path?: string };
export type NoteStructure = {
  nodes: { id: string; label: string; parent_id: string | null }[];
  edges: { from: string; to: string; label?: string }[];
};
export type TranscriptResult = {
  title: string;
  markdown: string;
  uncertain_spans: string[];
  structure: NoteStructure;
};
