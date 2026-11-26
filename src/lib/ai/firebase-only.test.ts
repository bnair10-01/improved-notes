import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The hackathon requires all AI to run on Firebase AI Logic. This guards that rule.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

const files = walk("src");
const read = (p: string) => readFileSync(p, "utf8");

describe("all AI goes through Firebase AI Logic", () => {
  it("imports and actually calls the hybrid SDK", () => {
    const run = read("src/lib/ai/run.ts");
    expect(run).toMatch(/from "firebase\/ai"/);
    expect(run).toMatch(/getGenerativeModel\(/);
    expect(run).toMatch(/generateContent\(/);
    expect(run).toMatch(/mode: r\.mode/);
  });

  it("uses no other AI provider or gateway anywhere in the app", () => {
    const banned = /openai|@anthropic-ai|api\.anthropic|generativelanguage\.googleapis|@google\/generative-ai|@google\/genai|ai-gateway|api\.mistral|cohere|replicate\.com/i;
    const hits = files.filter((f) => banned.test(read(f)));
    expect(hits).toEqual([]);
  });

  it("only the AI layer touches firebase/ai", () => {
    const hits = files.filter((f) => /from "firebase\/ai"/.test(read(f))).filter((f) => !f.startsWith("src/lib/ai/"));
    expect(hits).toEqual([]);
  });

  it("uses Authentication, Firestore, Remote Config and App Check too", () => {
    const all = files.map(read).join("\n");
    for (const m of ["firebase/auth", "firebase/firestore", "firebase/remote-config", "firebase/app-check", "firebase/storage"]) {
      expect(all).toContain(`"${m}"`);
    }
  });
});
