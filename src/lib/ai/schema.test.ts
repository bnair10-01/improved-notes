import { describe, expect, it } from "vitest";
import { toSchema, type JS } from "./schema";

const json = (s: ReturnType<typeof toSchema>) => JSON.parse(JSON.stringify((s as unknown as { toJSON: () => unknown }).toJSON()));

describe("toSchema", () => {
  it("maps objects, marking only unlisted properties optional", () => {
    const js: JS = { type: "object", properties: { a: { type: "string" }, b: { type: "integer" } }, required: ["a"] };
    const out = json(toSchema(js));
    expect(out.type).toBe("object");
    expect(out.required).toEqual(["a"]);
  });

  it("treats [type, 'null'] as a nullable type, which Firebase schemas express differently", () => {
    const out = json(toSchema({ type: ["string", "null"] }));
    expect(out.type).toBe("string");
    expect(out.nullable).toBe(true);
  });

  it("maps enums, arrays and numbers", () => {
    expect(json(toSchema({ type: "string", enum: ["a", "b"] })).enum).toEqual(["a", "b"]);
    expect(json(toSchema({ type: "array", items: { type: "number" } })).items.type).toBe("number");
  });

  it("requires every property when `required` is omitted", () => {
    const out = json(toSchema({ type: "object", properties: { x: { type: "string" }, y: { type: "string" } } }));
    expect(out.required.sort()).toEqual(["x", "y"]);
  });
});
