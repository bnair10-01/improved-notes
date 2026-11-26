import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

export const PROJECT = "demo-improved-notes";

export async function makeEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
}

export const note = (over: Record<string, unknown> = {}) => ({
  title: "T", markdown: "m", kind: "text", folder_id: null, tags: [], pinned: false,
  deleted_at: null, source_note_ids: [], created_at: "2026-11-25T00:00:00Z", updated_at: "2026-11-25T00:00:00Z", rev: 1, ...over,
});
