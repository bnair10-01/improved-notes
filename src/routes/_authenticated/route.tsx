import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { auth } from "@/lib/firebase";
import { isPermanent } from "@/lib/auth";

// Signed-in area. Guests (anonymous accounts) can capture and keep notes, but
// the vault, study and settings sync across devices only for a real sign-in.
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    await auth.authStateReady();
    if (!isPermanent(auth.currentUser)) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  component: () => <Outlet />,
});
