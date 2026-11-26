import { describe, expect, it } from "vitest";
import { clampCount, clozeParts, isCorrect, toAnkiCsv, validateCards, validateQuestions, weakTopics } from "./study-validate";

describe("flashcard validation", () => {
  it("card count is clamped to 5–30", () => {
    expect(clampCount(2, 5, 30)).toBe(5);
    expect(clampCount(50, 5, 30)).toBe(30);
  });
  it("drops cards with [illegible] content", () => {
    expect(validateCards([{ front: "What is [illegible]?", back: "x", card_type: "qa" }])).toHaveLength(0);
  });
  it("cloze cards need a {{blank}}", () => {
    expect(validateCards([{ front: "No blank here", back: "", card_type: "cloze" }])).toHaveLength(0);
    expect(validateCards([{ front: "The {{sun}} rises", back: "", card_type: "cloze" }])).toHaveLength(1);
  });
  it("Q/A cards need an answer and duplicates are removed", () => {
    const out = validateCards([{ front: "Q", back: "" }, { front: "A?", back: "1" }, { front: "a?", back: "2" }]);
    expect(out.map((c) => c.back)).toEqual(["1"]);
  });
  it("cloze splits into prompt and answer", () => {
    expect(clozeParts("The {{sun}} rises")).toEqual({ prompt: "The ___ rises", answer: "sun" });
  });
  it("Anki CSV escapes quotes and numbers cloze blanks", () => {
    expect(toAnkiCsv([{ front: 'Say "hi"', back: "ok", card_type: "qa" }])).toBe('"Say ""hi""","ok"');
    expect(toAnkiCsv([{ front: "{{a}} and {{b}}", back: "", card_type: "cloze" }])).toBe('"{{c1::a}} and {{c2::b}}",""');
  });
});

describe("quiz validation", () => {
  it("multiple choice answer must be one of the options", () => {
    expect(validateQuestions([{ type: "mc", question: "Q", options: ["a", "b"], answer: "c" }])).toHaveLength(0);
    expect(validateQuestions([{ type: "mc", question: "Q", options: ["a", "b"], answer: "a" }])).toHaveLength(1);
  });
  it("true/false answers are normalized", () => {
    expect(validateQuestions([{ type: "tf", question: "Q", answer: "true" }])[0]?.answer).toBe("True");
    expect(validateQuestions([{ type: "tf", question: "Q", answer: "maybe" }])).toHaveLength(0);
  });
  it("short answers ignore case and punctuation", () => {
    const [q] = validateQuestions([{ type: "short", question: "Q", answer: "Light energy" }]);
    expect(isCorrect(q!, "light energy!")).toBe(true);
    expect(isCorrect(q!, "heat")).toBe(false);
  });
  it("weak topics are those missed more than answered right", () => {
    expect(weakTopics([{ topic: "A", correct: false }, { topic: "A", correct: false }, { topic: "B", correct: true }, { topic: "C", correct: false }])).toEqual(["A", "C"]);
  });
});
