/* eslint-disable @typescript-eslint/no-explicit-any */
export const UNCERTAIN_RE = /\[(?:illegible|[^[\]\n]{1,40}\?)\]/g;

/** Wraps [illegible] and [word?] tokens in <mark class="uncertain-mark">. */
export function remarkUncertain() {
  return (tree: any) => {
    const walk = (node: any) => {
      if (!node.children) return;
      const out: any[] = [];
      for (const child of node.children) {
        if (child.type === "text" && UNCERTAIN_RE.test(child.value)) {
          UNCERTAIN_RE.lastIndex = 0;
          let last = 0;
          for (const m of child.value.matchAll(UNCERTAIN_RE)) {
            const i = m.index ?? 0;
            if (i > last) out.push({ type: "text", value: child.value.slice(last, i) });
            out.push({
              type: "emphasis",
              data: { hName: "mark", hProperties: { className: "uncertain-mark" } },
              children: [{ type: "text", value: m[0] }],
            });
            last = i + m[0].length;
          }
          if (last < child.value.length) out.push({ type: "text", value: child.value.slice(last) });
        } else {
          UNCERTAIN_RE.lastIndex = 0;
          walk(child);
          out.push(child);
        }
      }
      node.children = out;
    };
    walk(tree);
  };
}
