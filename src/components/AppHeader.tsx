import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Plus, Search } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ThemePicker } from "./ThemePicker";
import { A11yPanel } from "./shell/A11yPanel";
import { HelpDialog } from "./shell/HelpDialog";
import { DialogHost } from "./shell/DialogHost";
import { Settings } from "lucide-react";
import { MobileTabBar } from "./shell/MobileTabBar";
import { SyncStatus } from "./shell/SyncStatus";
import { sectionName } from "@/lib/nav";
import { Rail } from "./shell/Rail";
import { CommandPalette, openPalette } from "./shell/CommandPalette";
import { NewActionGrid } from "./shell/NewActions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { signOut as signOutUser, useAuth } from "@/lib/auth";
import { resetSession } from "@/lib/session";

export function AppHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const section = sectionName(pathname);

  const avatarUrl = user?.photoURL ?? null;
  const displayName = user?.displayName || user?.email?.split("@")[0] || (user?.isAnonymous ? "Guest" : "Account");
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    resetSession();
    await signOutUser();
    navigate({ to: "/", replace: true });
  }

  return (
    <>
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/70 backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:px-5 md:min-h-[46px] md:grid-cols-[minmax(0,1fr)_minmax(0,340px)_auto] md:py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-2 whitespace-nowrap font-serif text-lg font-semibold md:hidden">
            <BrandMark className="h-6 w-6" />
            <span data-brand-name className="truncate">Improved Notes</span>
          </Link>
          {section && <span data-section className="hidden truncate text-[13px] text-foreground md:block">{section}</span>}
        </div>
        {user ? (
          <button onClick={openPalette} className="hidden items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-left text-[13px] text-muted-foreground md:flex" aria-label="Search, jump, or ask anything">
            <Search className="h-3.5 w-3.5" /><span className="flex-1 truncate">Search and jump</span><kbd className="rounded border px-1.5 font-mono text-[10.5px]">⌘K</kbd>
          </button>
        ) : <span className="hidden md:block" />}
        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {user && (
            <Popover>
              <PopoverTrigger asChild><button className="mr-1 hidden items-center gap-1 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background md:flex" aria-label="New"><Plus className="h-3.5 w-3.5" /> New</button></PopoverTrigger>
              <PopoverContent align="end" className="w-[min(92vw,640px)]"><NewActionGrid compact /></PopoverContent>
            </Popover>
          )}
          <SyncStatus />
          <HelpDialog />
          <A11yPanel />
          <ThemePicker />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-1.5" aria-label="Account">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover ring-1 ring-border" />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
                  )}
                  <span data-header-name className="hidden max-w-28 truncate text-sm font-medium sm:block">{displayName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <p className="truncate px-2 py-1.5 text-sm font-medium">{displayName}</p>
                <p className="truncate px-2 pb-1.5 text-xs text-muted-foreground">{user.email ?? (user.isAnonymous ? "Guest — sign in to sync across devices" : "Signed in")}</p>
                <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}><Settings /> Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={signOut}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </nav>
      </div>
    </header>
    <Rail initials={initials} avatarUrl={avatarUrl} />
    {user && <><MobileTabBar /><DialogHost /><CommandPalette /></>}
    </>
  );
}
