import { describe, expect, it } from "vitest";
import { asUrl, homeIntent, looksLikeQuestion, toNote } from "./home-intent";

describe("homeIntent", () => {
  it("is empty for blank text", () => {
    expect(homeIntent("   ", true)).toEqual({ kind: "empty" });
  });

  it("recognises YouTube links, with or without a scheme", () => {
    expect(homeIntent("https://www.youtube.com/watch?v=abc", true)).toMatchObject({ kind: "youtube" });
    expect(homeIntent("youtu.be/abc", true)).toEqual({ kind: "youtube", url: "https://youtu.be/abc" });
  });

  it("treats other single links as websites", () => {
    expect(homeIntent("www.example.com", true)).toEqual({ kind: "website", url: "https://www.example.com/" });
    expect(homeIntent("en.wikipedia.org/wiki/Cell", false)).toMatchObject({ kind: "website" });
  });

  it("does not treat a sentence containing a link as a link", () => {
    expect(homeIntent("read https://example.com later", true)).toMatchObject({ kind: "note" });
  });

  it("asks the notes for short questions, only when there is something to ask", () => {
    expect(homeIntent("What is mitosis?", true)).toEqual({ kind: "ask", question: "What is mitosis?" });
    expect(homeIntent("explain the krebs cycle", true)).toMatchObject({ kind: "ask" });
    expect(homeIntent("What is mitosis?", false)).toMatchObject({ kind: "note", title: "What is mitosis?" });
  });

  it("starts a note for anything else", () => {
    expect(homeIntent("Lecture 4: cell division\nProphase first.", true)).toEqual({ kind: "note", title: "Lecture 4: cell division", markdown: "Prophase first." });
  });
});

describe("helpers", () => {
  it("never reads multi-line or long text as a question", () => {
    expect(looksLikeQuestion("why?\nbecause")).toBe(false);
    expect(looksLikeQuestion(`why ${"x".repeat(400)}?`)).toBe(false);
  });

  it("keeps a long first line in the body", () => {
    const long = "a".repeat(120);
    expect(toNote(long)).toEqual({ title: "Untitled", markdown: long });
    expect(toNote("# Heading\nbody")).toEqual({ title: "Heading", markdown: "body" });
  });

  it("rejects things that only look like links", () => {
    expect(asUrl("hello")).toBeNull();
    expect(asUrl("e.g.")).toBeNull();
    expect(asUrl("https://localhost")).toBeNull();
  });
});
