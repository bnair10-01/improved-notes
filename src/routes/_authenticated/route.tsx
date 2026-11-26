import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { auth } from "@/lib/firebase";
import { rememberNext, useAuth } from "@/lib/auth";

// Signed-in area. Guests (anonymous accounts) get the same notes, study and settings as anyone:
// their data lives under their own guest id and moves to a real account when they sign in.
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    await auth.authStateReady();
    if (!auth.currentUser) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = useAuth();
  return (
    <>
      {user?.isAnonymous && (
        <div role="status" className="border-b border-border/70 bg-secondary/60 px-4 py-2 text-center text-xs text-muted-foreground">
          You're using a guest account. Your notes stay in this browser until you{" "}
          <Link to="/auth" search={{ redirect: "/vault" }} onClick={() => rememberNext("/vault")} className="font-medium text-primary underline underline-offset-2">sign in</Link>
          {" "}to keep them on all your devices.
        </div>
      )}
      <Outlet />
    </>
  );
}
