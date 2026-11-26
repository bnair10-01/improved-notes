import { createFileRoute } from "@tanstack/react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppHeader } from "@/components/AppHeader";
import { getSharedNote } from "@/lib/sharing";

export const Route = createFileRoute("/s/$token")({
  loader: ({ params }) => getSharedNote(params.token),
  component: SharedNotePage,
  pendingComponent: () => <SharedFrame><p role="status">Opening your shared note…</p></SharedFrame>,
  errorComponent: ({ reset }) => <SharedFrame><h1 className="font-serif text-2xl">Couldn't load this note</h1><p className="mt-2 text-muted-foreground">Sharing is temporarily unavailable. Please try again.</p><button className="mt-4 min-h-11 rounded-md border border-border px-4" onClick={reset}>Try again</button></SharedFrame>,
});
function SharedFrame({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100dvh-var(--tabbar,0px))] bg-background text-foreground"><AppHeader /><main className="mx-auto max-w-3xl px-4 py-6 sm:py-10"><article className="paper-sheet min-w-0 break-words p-4 sm:p-8">{children}</article><footer className="mt-6 text-center text-sm text-muted-foreground">Shared from Improved Notes</footer></main></div>;
}
export function SharedNotePage() {
  const note = Route.useLoaderData();
  if (!note) return <SharedFrame><h1 className="font-serif text-2xl">This link is off or doesn't exist</h1><p className="mt-3 text-muted-foreground">Ask the person who shared it for a new link.</p></SharedFrame>;
  return <SharedFrame><h1 className="mb-6 font-serif text-3xl font-semibold">{note.title || "Untitled note"}</h1><div className="transcript overflow-x-auto"><Markdown remarkPlugins={[remarkGfm]}>{note.markdown ?? ""}</Markdown></div></SharedFrame>;
}
