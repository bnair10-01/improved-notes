import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { rememberNext, signOut as signOutUser, useAuth } from "@/lib/auth";
import { resetSession } from "@/lib/session";

/**
 * Sign in and sign out, in one place for the account menu and for Settings. A guest is asked before signing out, because
 * a guest's notes can't be reopened once the guest account is gone; signing in first keeps them.
 */
export function useAccountActions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const guest = !!user?.isAnonymous;

  const signIn = () => { rememberNext("/"); void navigate({ to: "/auth", search: { redirect: "/" } }); };
  async function signOut() {
    setConfirming(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    resetSession();
    await signOutUser();
    void navigate({ to: "/", replace: true });
  }
  const askSignOut = () => (guest ? setConfirming(true) : void signOut());

  const dialog = (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of your guest account?</AlertDialogTitle>
          <AlertDialogDescription>Guest notes can't be reopened after you sign out. Sign in first and they come with you to every device.</AlertDialogDescription>
        </AlertDialogHeader>
        {/* One column on a phone, evenly spaced, the safe choice first; a row on wider screens. */}
        <AlertDialogFooter className="flex-col gap-2.5 sm:flex-row sm:justify-end sm:space-x-0">
          <AlertDialogAction onClick={() => { setConfirming(false); signIn(); }} className="mt-0 min-h-11 w-full sm:w-auto">Sign in first</AlertDialogAction>
          <AlertDialogAction onClick={() => void signOut()} className="mt-0 min-h-11 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto">Sign out anyway</AlertDialogAction>
          <AlertDialogCancel className="mt-0 min-h-11 w-full sm:w-auto">Stay</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { user, guest, signIn, askSignOut, dialog };
}

const row = "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-secondary active:bg-secondary";

/** The account card in Settings: who you are, and clear sign-in and sign-out buttons (easy to hit on a phone). */
export function AccountCard() {
  const { user, guest, signIn, askSignOut, dialog } = useAccountActions();
  if (!user) return null;
  return (
    <section aria-labelledby="account-heading" className="paper-sheet space-y-3 p-4 sm:p-6" data-account-card>
      <h2 id="account-heading" className="text-lg font-semibold">Account</h2>
      <p className="text-sm text-muted-foreground">{guest ? "You're using a guest account. Sign in to keep your notes on every device." : `Signed in as ${user.email ?? user.displayName ?? "you"}.`}</p>
      <div className="flex flex-wrap gap-2">
        {guest && <button type="button" className={`${row} w-auto border`} onClick={signIn}><LogIn className="h-4 w-4" /> Sign in</button>}
        <button type="button" className={`${row} w-auto border`} onClick={askSignOut}><LogOut className="h-4 w-4" /> Sign out</button>
      </div>
      {dialog}
    </section>
  );
}
