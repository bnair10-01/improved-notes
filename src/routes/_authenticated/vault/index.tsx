import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Hint } from "@/components/shell/Hint";
import { openTarget, useVault } from "@/lib/vault";
import { sortNotes, type NoteSort } from "@/lib/sort";

export const Route = createFileRoute("/_authenticated/vault/")({
  head: () => ({
    meta: [
      { title: "Notes — Improved Notes" },
      { name: "description", content: "All your notes, sortable by recent edits, creation date or title." },
      { property: "og:title", content: "Notes — Improved Notes" },
      { property: "og:description", content: "All your notes, sortable by recent edits, creation date or title." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VaultHome,
});

const SORTS: [NoteSort, string][] = [["recent", "Recently edited"], ["created", "Newest"], ["title", "A–Z"]];

function VaultHome() {
  const { data } = useVault();
  const [sort, setSort] = useState<NoteSort>("recent");
  useEffect(() => { const s = localStorage.getItem("improvednotes-sort"); if (s === "created" || s === "title") setSort(s); }, []);
  const notes = sortNotes((data?.notes ?? []).filter((n) => !n.deleted_at), sort);
  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl overflow-y-auto overflow-x-hidden px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold">Notes</h1>
        <div role="radiogroup" aria-label="Sort notes" className="flex gap-1 rounded-lg bg-secondary p-1">
          {SORTS.map(([v, l]) => (
            <button key={v} role="radio" aria-checked={sort === v} onClick={() => { setSort(v); localStorage.setItem("improvednotes-sort", v); }}
              className={`min-h-8 rounded-md px-2.5 text-xs ${sort === v ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mt-3"><Hint id="vault">Link notes by typing [[ in a note. Press Ctrl/⌘ K to jump to any note, or open Graph to see how they connect.</Hint></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {notes.map((n) => (
          <Link key={n.id} {...openTarget(n)} className="paper-sheet block min-w-0 p-4 transition-colors hover:ring-2 hover:ring-primary/30">
            <p className="truncate font-medium">{n.title || "Untitled"}</p>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">{n.kind} · {new Date(sort === "created" ? n.created_at : n.updated_at).toLocaleDateString()}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.markdown.slice(0, 160) || "Empty note"}</p>
          </Link>
        ))}
      </div>
      {!notes.length && <div className="paper-sheet mt-4 p-8 text-center"><p className="font-serif text-lg">No notes yet</p><p className="mt-1 text-sm text-muted-foreground">Tap + (or New note in the sidebar) to write your first one.</p></div>}
    </div>
  );
}
