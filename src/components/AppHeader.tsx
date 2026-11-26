import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ThemePicker } from "./ThemePicker";
import { A11yPanel } from "./shell/A11yPanel";
import { HelpDialog } from "./shell/HelpDialog";
import { DialogHost } from "./shell/DialogHost";
import { OnboardingDialog } from "./learner/OnboardingDialog";
import { Settings } from "lucide-react";
import { MobileTabBar } from "./shell/MobileTabBar";
import { SyncStatus } from "./shell/SyncStatus";
import { NAV } from "@/lib/nav";
import { isPermanent, signOut as signOutUser, useAuth } from "@/lib/auth";

export function AppHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const avatarUrl = user?.photoURL ?? null;
  const displayName = user?.displayName || user?.email?.split("@")[0] || (user?.isAnonymous ? "Guest" : "Account");
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const link = "rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground";
  const active = { className: "rounded-md px-2.5 py-1.5 text-sm bg-secondary text-foreground" };

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutUser();
    navigate({ to: "/auth", search: { redirect: "/history" }, replace: true });
  }

  return (
    <>
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/70 backdrop-blur-md">
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:px-5 sm:py-3">
        <Link to="/" className="flex min-w-0 items-center gap-2 whitespace-nowrap font-serif text-lg font-semibold">
          <NotebookPen className="h-5 w-5 shrink-0 text-primary" />
          <span data-brand-name className="truncate">Improved Notes</span>
        </Link>
        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {isPermanent(user) && <div data-header-links className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => <Link key={n.to} to={n.to} className={link} activeProps={active} activeOptions={{ exact: n.exact }}>{n.label}</Link>)}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          </div>}
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
    {user && <><MobileTabBar /><DialogHost /><OnboardingDialog /></>}
    </>
  );
}
