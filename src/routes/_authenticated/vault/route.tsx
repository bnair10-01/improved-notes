import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, PanelLeft } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { openPalette } from "@/components/shell/CommandPalette";
import { VaultSidebar } from "@/components/vault/VaultSidebar";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/_authenticated/vault")({
  head: () => ({
    meta: [
      { title: "Vault — Improved Notes" },
      { name: "description", content: "All your notes, folders and links in one place." },
      { property: "og:title", content: "Vault — Improved Notes" },
      { property: "og:description", content: "A linked vault of your notes, with folders, tags and a graph." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VaultLayout,
});

function VaultLayout() {
  const { data, isLoading } = useVault();
  const [drawer, setDrawer] = useState(false);
  // The graph is a full-width view of its own; the notes sidebar would only repeat what the Notes page already has.
  const onGraph = useRouterState({ select: (st) => st.location.pathname.startsWith("/vault/graph") });

  return (
    <div className="flex h-[calc(100dvh-var(--tabbar))] flex-col">
      <AppHeader />
      {isLoading || !data ? (
        <div className="flex flex-1 justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {!onGraph && <aside data-distraction className="hidden w-72 shrink-0 border-r lg:block"><VaultSidebar vault={data} /></aside>}
          {!onGraph && <Sheet open={drawer} onOpenChange={setDrawer}>
            <SheetContent side="left" className="w-80 p-0"><SheetTitle className="sr-only">Vault</SheetTitle><VaultSidebar vault={data} onNavigate={() => setDrawer(false)} /></SheetContent>
          </Sheet>}
          <main className="flex min-w-0 flex-1 flex-col">
            {!onGraph && <div className="flex items-center gap-2 border-b px-3 py-1.5 lg:hidden">
              <Button variant="ghost" size="sm" onClick={() => setDrawer(true)}><PanelLeft /> Notes</Button>
              <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={openPalette}>Search</Button>
            </div>}
            <Outlet />
          </main>
        </div>
      )}
    </div>
  );
}
