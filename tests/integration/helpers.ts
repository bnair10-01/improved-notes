import { PROJECT } from "../rules/env";

const reset = (url: string) => fetch(url, { method: "DELETE" }).then(() => undefined);

/** Wipe emulator state between tests. */
export async function resetEmulators() {
  await reset(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
  await reset(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll until `fn` returns a truthy value, or fail with the last value. */
export async function eventually<T>(fn: () => T | Promise<T>, ms = 8000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  let last: T | undefined;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last as NonNullable<T>;
    await sleep(100);
  }
  throw new Error(`condition not met within ${ms}ms (last: ${JSON.stringify(last)})`);
}

export const PAGE = { id: "p1", dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==", path: "" };
export const RESULT = { title: "Cells", markdown: "# Cells\nmitosis", uncertain_spans: [], structure: { nodes: [], edges: [] } };
