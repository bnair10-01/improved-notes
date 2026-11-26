import { Schema } from "firebase/ai";

/** A small JSON-Schema subset, so prompts can keep their readable schemas. */
export type JS = {
  type: string | string[];
  description?: string;
  enum?: string[];
  items?: JS;
  properties?: Record<string, JS>;
  required?: string[];
};

/** Convert to Firebase AI Logic's Schema (which has `nullable` instead of type unions). */
export function toSchema(js: JS): Schema {
  const types = Array.isArray(js.type) ? js.type : [js.type];
  const nullable = types.includes("null");
  const type = types.find((t) => t !== "null") ?? "string";
  const base = { nullable, ...(js.description ? { description: js.description } : {}) };
  switch (type) {
    case "object": {
      const props = js.properties ?? {};
      const required = new Set(js.required ?? Object.keys(props));
      return Schema.object({
        ...base,
        properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toSchema(v)])),
        optionalProperties: Object.keys(props).filter((k) => !required.has(k)),
      });
    }
    case "array": return Schema.array({ ...base, items: toSchema(js.items ?? { type: "string" }) });
    case "integer": return Schema.integer(base);
    case "number": return Schema.number(base);
    case "boolean": return Schema.boolean(base);
    default: return js.enum ? Schema.enumString({ ...base, enum: js.enum }) : Schema.string(base);
  }
}
