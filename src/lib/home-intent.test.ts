import { describe, expect, it } from "vitest";
import { asUrl, couldBeSubject, forceMode, homeIntent, learnSubject, looksLikeQuestion, questionSubject, toNote } from "./home-intent";

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
    expect(homeIntent("What is mitosis?", false)).toEqual({ kind: "learn", subject: "mitosis" });
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

describe("learning wishes", () => {
  it.each([
    ["Need to learn more on Black Holes", "Black Holes"],
    ["I want to learn about the Krebs cycle.", "Krebs cycle"],
    ["study organic chemistry", "organic chemistry"],
    ["teach me calculus", "calculus"],
    ["research the french revolution", "french revolution"],
    ["I have to understand how vaccines work", "how vaccines work"],
    ["need notes on Black Hole", "Black Hole"],
    ["I need some notes about the French Revolution", "French Revolution"],
    ["make me a summary of photosynthesis", "photosynthesis"],
    ["find videos on linear algebra", "linear algebra"],
    ["notes on cell division", "cell division"],
  ])("reads %s", (text, subject) => {
    expect(learnSubject(text)).toBe(subject);
    expect(homeIntent(text, true)).toEqual({ kind: "learn", subject });
    expect(homeIntent(text, false)).toEqual({ kind: "learn", subject });
  });

  it("leaves ordinary writing, questions and links alone", () => {
    expect(learnSubject("Lecture notes about studying habits")).toBeNull();
    expect(learnSubject("notes from today's meeting")).toBeNull();
    expect(learnSubject("What is mitosis?")).toBeNull();
    expect(learnSubject("learn https://example.com")).toBeNull();
    expect(learnSubject("Need to learn more on black holes\nand stars")).toBeNull();
    expect(homeIntent("explain the krebs cycle", true)).toMatchObject({ kind: "ask" });
  });

  it("offers research only for short subject-like phrases", () => {
    expect(couldBeSubject("Black holes")).toBe(true);
    expect(couldBeSubject("a long sentence that goes on and on about nothing in particular")).toBe(false);
    expect(couldBeSubject("example.com")).toBe(false);
  });
});

describe("questionSubject", () => {
  it.each([
    ["What is a black hole?", "black hole"],
    ["who was Ada Lovelace?", "Ada Lovelace"],
    ["How does GPS work?", "GPS"],
    ["Explain the Krebs cycle", "Krebs cycle"],
    ["Why is the sky blue?", "Why is the sky blue"],
  ])("%s", (q, subject) => expect(questionSubject(q)).toBe(subject));
});

describe("forceMode", () => {
  const auto = (t: string) => homeIntent(t, true);
  it("leaves auto alone", () => {
    expect(forceMode("auto", "black holes", auto("black holes"))).toMatchObject({ kind: "note" });
  });
  it("research looks up whatever was typed", () => {
    expect(forceMode("research", "Black Holes", auto("Black Holes"))).toEqual({ kind: "learn", subject: "Black Holes" });
    expect(forceMode("research", "need notes on Black Hole", auto("need notes on Black Hole"))).toEqual({ kind: "learn", subject: "Black Hole" });
    expect(forceMode("research", "What is a quasar?", auto("What is a quasar?"))).toEqual({ kind: "learn", subject: "quasar" });
    expect(forceMode("research", "Quasars\nsome thoughts", auto("Quasars\nsome thoughts"))).toEqual({ kind: "learn", subject: "Quasars" });
  });
  it("research still reads links as links", () => {
    expect(forceMode("research", "youtu.be/abcdefghijk", auto("youtu.be/abcdefghijk"))).toMatchObject({ kind: "youtube" });
  });
  it("note always makes a note, even from a question or a learning wish", () => {
    expect(forceMode("note", "What is a quasar?", auto("What is a quasar?"))).toEqual({ kind: "note", title: "What is a quasar?", markdown: "" });
    expect(forceMode("note", "study calculus", auto("study calculus"))).toMatchObject({ kind: "note", title: "study calculus" });
  });
  it("does nothing for empty text", () => {
    expect(forceMode("research", " ", { kind: "empty" })).toEqual({ kind: "empty" });
  });
});
