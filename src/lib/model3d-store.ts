import { getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { commit, nowIso, userCol, userDoc } from "./db";
import { signedUrls } from "./notes";
import { validateSpec, type Spec } from "./model3d";

/** Load a 3D model note: its schematic, plus the uploaded GLB file if it has one. */
export async function loadModel(noteId: string): Promise<{ title: string; spec: Spec; glbUrl?: string }> {
  const note = await getDoc(userDoc("notes", noteId));
  if (!note.exists() || note.get("kind") !== "model3d" || note.get("deleted_at")) throw new Error("Couldn't load this model.");
  const title = String(note.get("title") ?? "Model");
  const files = await getDocs(query(userCol("attachments"), where("note_id", "==", noteId)));
  const file = files.docs.map((d) => d.data()).filter((a) => a["type"] === "model_file").sort((a, b) => (a["position"] ?? 0) - (b["position"] ?? 0))[0];
  const [glbUrl] = file ? await signedUrls([file["storage_path"] as string]) : [];
  return { title, spec: validateSpec(note.get("model_spec") ?? { title, summary: "", parts: [] }), ...(glbUrl ? { glbUrl } : {}) };
}

export async function saveModelSpec(noteId: string, spec: Spec) {
  await commit(updateDoc(userDoc("notes", noteId), { model_spec: spec, updated_at: nowIso() }));
}
