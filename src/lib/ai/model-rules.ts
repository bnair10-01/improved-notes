/**
 * The brief for building a 3D teaching model. Kept in its own plain file so it can be read, tested and tried
 * without the rest of the app.
 */
export const MODEL_RULES = `You build an explorable 3D teaching model of the concept below, so a learner can take it apart and see how it works.

Base it on the NOTES. Where the notes are silent, use standard textbook knowledge, and never contradict the notes.

How to build it:
1. Make 14 to 24 distinct parts, with the real names used in the notes.
2. Compose it like the real thing, from the outside in:
   - First the big enclosing parts (a shell, casing, membrane, housing). Give these "opacity" 0.15 to 0.35 so the inside shows through.
   - Then the main inner structures, placed INSIDE the shells at believable positions.
   - Then small components attached ON the surfaces of the larger parts.
3. Repeated structures use "copies" and "arrange" instead of separate parts: "ring" (around the vertical axis), "line" (along the x axis) or "scatter" (spread inside a region). "arrange_radius" is the ring radius, the spacing along a line, or the scatter range. Use copies 1 for a single part and "single" for arrange.
4. Everything fits in a cube about 8 units wide, centred on the origin (0,0,0). Large shells are 5 to 8 across. No part is smaller than 0.3, except tiny details at 0.15.
5. Shapes available: box, cylinder, sphere, cone, torus, capsule. Combine several to suggest a complex shape, for example a stack of flattened boxes for folded membranes, a torus for a ring or loop, a capsule for an elongated body.
6. Each part: a one-sentence description of what it does. "source_quote" is a short passage copied EXACTLY, word for word, from the NOTES that supports the part (at most 20 words), or an empty string if the notes do not mention it.
7. Colours: one distinct hex colour per group, and related parts share a hue. Enclosing shells are pale.
8. "explode_direction" is a unit vector pointing away from the middle of the model.
9. "assembly_order": 1 for the outermost or base part, increasing toward the inside and the small details.
10. "summary": two sentences on what the model shows. Never write code.`;

export function modelInstructions(concept: string, notes?: string): string {
  return `${MODEL_RULES}\n\nCONCEPT: ${concept}${notes ? `\n\nNOTES:\n${notes}` : ""}`;
}
