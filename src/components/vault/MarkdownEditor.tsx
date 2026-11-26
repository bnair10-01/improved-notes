import { useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { VNote } from "@/lib/vault";

const SLASH = [
  { label: "Heading 1", text: "# " },
  { label: "Heading 2", text: "## " },
  { label: "Heading 3", text: "### " },
  { label: "Bullet list", text: "- " },
  { label: "Numbered list", text: "1. " },
  { label: "Checklist", text: "- [ ] " },
  { label: "Callout", text: "> [!note] " },
  { label: "Quote", text: "> " },
  { label: "Divider", text: "---\n" },
];

type Menu = { type: "slash" | "link"; query: string; start: number } | null;

/** Plain markdown textarea with a "/" block menu and a "[[" note picker. */
export function MarkdownEditor({ value, onChange, notes }: { value: string; onChange: (v: string) => void; notes: VNote[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [sel, setSel] = useState(0);

  const items = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    if (menu.type === "slash") return SLASH.filter((s) => s.label.toLowerCase().includes(q)).map((s) => ({ label: s.label, insert: s.text }));
    const hits = notes.filter((n) => !n.deleted_at && n.title.toLowerCase().includes(q)).slice(0, 8).map((n) => ({ label: n.title, insert: `[[${n.title}]]` }));
    if (menu.query.trim() && !hits.some((h) => h.label.toLowerCase() === q)) hits.push({ label: `Create "${menu.query.trim()}"`, insert: `[[${menu.query.trim()}]]` });
    return hits;
  }, [menu, notes]);

  function detect(v: string, caret: number) {
    const before = v.slice(0, caret);
    const link = /\[\[([^\[\]\n]*)$/.exec(before);
    if (link) { setMenu({ type: "link", query: link[1] ?? "", start: caret - link[0].length }); setSel(0); return; }
    const line = before.slice(before.lastIndexOf("\n") + 1);
    const slash = /^\/(\w*)$/.exec(line);
    if (slash) { setMenu({ type: "slash", query: slash[1] ?? "", start: caret - line.length }); setSel(0); return; }
    setMenu(null);
  }

  function pick(i: number) {
    const it = items[i];
    const el = ref.current;
    if (!it || !menu || !el) return;
    let end = el.selectionStart;
    if (menu.type === "link" && value.slice(end, end + 2) === "]]") end += 2;
    const next = value.slice(0, menu.start) + it.insert + value.slice(end);
    onChange(next);
    setMenu(null);
    const pos = menu.start + it.insert.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  }

  return (
    <div className="relative h-full">
      <Textarea
        ref={ref}
        value={value}
        placeholder="Start writing… type / for blocks, [[ to link a note"
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onKeyDown={(e) => {
          if (!menu || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % items.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + items.length) % items.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(sel); }
          else if (e.key === "Escape") setMenu(null);
        }}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
        className="h-full resize-none rounded-none border-0 bg-transparent px-5 py-4 font-mono text-sm shadow-none focus-visible:ring-0"
        aria-label="Note markdown"
      />
      {menu && items.length > 0 && (
        <div role="listbox" aria-label={menu.type === "slash" ? "Blocks" : "Link a note"} className="absolute left-4 top-3 z-20 w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">{menu.type === "slash" ? "Insert block" : "Link to note"}</p>
          {items.map((it, i) => (
            <button key={it.label} role="option" aria-selected={i === sel} onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              className={`block w-full truncate px-3 py-1.5 text-left text-sm ${i === sel ? "bg-accent text-accent-foreground" : ""}`}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
