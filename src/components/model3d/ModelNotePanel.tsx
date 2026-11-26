import { useEffect, useState } from "react";
import { loadModel, saveModelSpec } from "@/lib/model3d-store";
import type { Spec } from "@/lib/model3d";
import ModelViewerClient from "./ModelViewerClient";

/** Viewer for a 'model3d' note: loads its schematic or uploaded file and saves edits back. */
export function ModelNotePanel({ noteId }: { noteId: string }) {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | undefined>();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadModel(noteId)
      .then((m) => { setSpec(m.spec); setGlbUrl(m.glbUrl); })
      .catch(() => setErr("Couldn't load this model."));
  }, [noteId]);
  if (err) return <p className="paper-sheet p-4 text-sm text-destructive">{err}</p>;
  if (!spec) return <p role="status" className="paper-sheet p-4 text-sm text-muted-foreground">Loading model…</p>;
  return (
    <ModelViewerClient spec={spec} {...(glbUrl ? { glbUrl } : {})}
      onSpecChange={async (s) => { setSpec(s); await saveModelSpec(noteId, s); }} />
  );
}
