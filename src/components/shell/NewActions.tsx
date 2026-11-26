import { useNavigate } from "@tanstack/react-router";
import { AudioLines, Box, Camera, Lightbulb, Presentation, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { createNote, useRefreshVault } from "@/lib/vault";
import { openDialog } from "@/lib/dialogs";

type Action = { key: string; label: string; hint: string; icon: typeof Camera; soon?: boolean };
export const NEW_ACTIONS: Action[] = [
  { key: "scan", label: "Scan handwriting", hint: "Photos of paper notes", icon: Camera },
  { key: "text", label: "Write a note", hint: "Type with [[links]]", icon: SquarePen },
  { key: "concept", label: "Blank concept", hint: "One idea to grow", icon: Lightbulb },
  { key: "slides", label: "Import slides", hint: "PDF or PowerPoint", icon: Presentation },
  { key: "audio", label: "Add audio", hint: "Record or upload", icon: AudioLines },
  { key: "model", label: "3D concept model", hint: "Explore it in 3D", icon: Box },
];

export function useNewAction() {
  const navigate = useNavigate();
  const refresh = useRefreshVault();
  return async (key: string) => {
    if (key === "scan") return navigate({ to: "/capture" });
    if (key === "text" || key === "concept") {
      try {
        const id = await createNote({ kind: key, title: key === "concept" ? "New concept" : "Untitled" });
        await refresh();
        navigate({ to: "/vault/$noteId", params: { noteId: id } });
      } catch { toast.error("Couldn't create the note."); }
      return;
    }
    if (key === "slides" || key === "audio" || key === "model") { openDialog(key); return; }
    toast("Coming soon");
  };
}

export function NewActionGrid({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const run = useNewAction();
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"}`}>
      {NEW_ACTIONS.map(({ key, label, hint, icon: Icon, soon }) => (
        <button key={key} type="button" disabled={soon} onClick={async () => { await run(key); onDone?.(); }}
          className="paper-sheet flex min-h-24 flex-col items-start gap-1.5 p-3 text-left transition-colors hover:ring-2 hover:ring-primary/30 disabled:opacity-60 disabled:hover:ring-0">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground"><Icon className="h-4.5 w-4.5" /></span>
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{soon ? "Coming soon" : hint}</span>
        </button>
      ))}
    </div>
  );
}
