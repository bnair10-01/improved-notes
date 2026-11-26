import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  authMessage, isPermanent, rememberNext, signInWithEmail, signInWithGoogle, signUpWithEmail, takeNext, useAuth,
} from "@/lib/auth";
import { GoogleMark } from "@/components/GoogleMark";
import { IS_NATIVE } from "@/lib/firebase";

function safePath(p: unknown) {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") ? p : "/history";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: safePath(s["redirect"]) }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && isPermanent(user)) navigate({ to: safePath(takeNext() ?? redirect), replace: true });
  }, [ready, user, navigate, redirect]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      rememberNext(redirect);
      await fn();
    } catch (err) {
      toast.error(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-sm px-4 py-12">
        <h1 className="font-serif text-2xl font-semibold">{mode === "in" ? "Sign in" : "Create account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One account on every device. Anything you captured as a guest comes with you.
        </p>

        {!IS_NATIVE && (
          <div className="mt-6 space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              style={{ background: "#FFFFFF", borderColor: "#747775", color: "#1F1F1F" }}
              onClick={() => run(signInWithGoogle)}
              disabled={busy}
            >
              <GoogleMark />
              Continue with Google
            </Button>
          </div>
        )}

        <div className="my-4 text-center text-xs text-muted-foreground">{IS_NATIVE ? "Sign in with email" : "or with email"}</div>

        <form
          onSubmit={(e) => { e.preventDefault(); run(() => (mode === "in" ? signInWithEmail(email, password) : signUpWithEmail(email, password))); }}
          className="space-y-3"
        >
          <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</Button>
        </form>

        <button className="mt-4 w-full text-sm text-muted-foreground underline underline-offset-4" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </main>
    </div>
  );
}
