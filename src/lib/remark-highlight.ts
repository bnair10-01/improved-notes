/* eslint-disable @typescript-eslint/no-explicit-any */
/** Turns ==highlighted text== into <mark>. */
export function remarkHighlight() {
  return (tree: any) => {
    const walk = (node: any) => {
      if (!node.children) return;
      const out: any[] = [];
      for (const child of node.children) {
        if (child.type === "text" && /==[^=\n]+==/.test(child.value)) {
          let last = 0;
          for (const m of child.value.matchAll(/==([^=\n]+)==/g)) {
            const i = m.index ?? 0;
            if (i > last) out.push({ type: "text", value: child.value.slice(last, i) });
            out.push({ type: "emphasis", data: { hName: "mark", hProperties: { className: "hl-mark" } }, children: [{ type: "text", value: m[1] }] });
            last = i + m[0].length;
          }
          if (last < child.value.length) out.push({ type: "text", value: child.value.slice(last) });
        } else { walk(child); out.push(child); }
      }
      node.children = out;
    };
    walk(tree);
  };
}
