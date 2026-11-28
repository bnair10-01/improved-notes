import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogIn, LogOut, Search } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountActions } from "./AccountActions";
import { ThemePicker } from "./ThemePicker";
import { HelpDialog } from "./shell/HelpDialog";
import { DialogHost } from "./shell/DialogHost";
import { Settings } from "lucide-react";
import { MobileTabBar } from "./shell/MobileTabBar";
import { SyncStatus } from "./shell/SyncStatus";
import { CommandPalette, openPalette, touchFirst } from "./shell/CommandPalette";
import { SplitHost } from "./split/SplitHost";

export function AppHeader() {
  const { user, guest, signIn, askSignOut, dialog } = useAccountActions();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);

  const avatarUrl = user?.photoURL ?? null;
  const displayName = user?.displayName || user?.email?.split("@")[0] || (user?.isAnonymous ? "Guest" : "Account");
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const menuRow = "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary active:bg-secondary";

  return (
    <>
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/70 backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* The same top bar on a phone, a tablet and the web: the logo (home) on the left, then search, help, light/dark and your account. */}
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-3 py-2.5 sm:px-5">
        <Link to="/" aria-label="Improved Notes home" className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap font-serif text-lg font-semibold">
          <BrandMark className="h-6 w-6" />
          <span data-brand-name className="truncate">Improved Notes</span>
        </Link>
        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {user && (
            <Button variant="ghost" size="icon" className="min-h-10 min-w-10" aria-label="Search and jump" title={touchFirst() ? "Search (or pull down from the top)" : "Search (⌘K)"} onClick={openPalette} data-open-search><Search /></Button>
          )}
          <SyncStatus />
          <HelpDialog />
          <ThemePicker />
          {user ? (
            <Popover open={menu} onOpenChange={setMenu}>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-1.5" aria-label="Account">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover ring-1 ring-border" />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
                  )}
                  <span data-header-name className="hidden max-w-28 truncate text-sm font-medium sm:block">{displayName}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-1.5" data-account-menu>
                <p className="truncate px-3 pt-1.5 text-sm font-medium">{displayName}</p>
                <p className="truncate px-3 pb-1.5 text-xs text-muted-foreground">{user.email ?? (user.isAnonymous ? "Guest. Sign in to sync across devices" : "Signed in")}</p>
                <button type="button" className={menuRow} onClick={() => { setMenu(false); navigate({ to: "/settings" }); }}><Settings className="h-4 w-4" /> Settings</button>
                {guest && <button type="button" className={menuRow} onClick={() => { setMenu(false); signIn(); }}><LogIn className="h-4 w-4" /> Sign in to keep your notes</button>}
                <button type="button" className={menuRow} onClick={() => { setMenu(false); askSignOut(); }}><LogOut className="h-4 w-4" /> Sign out</button>
              </PopoverContent>
            </Popover>
          ) : null}
        </nav>
      </div>
    </header>
    {user && <><MobileTabBar /><DialogHost /><SplitHost /><CommandPalette />{dialog}</>}
    </>
  );
}
