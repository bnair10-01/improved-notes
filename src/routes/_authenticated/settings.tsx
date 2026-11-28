import { AppearanceControls } from "@/components/ThemePicker";
import { AccountCard } from "@/components/AccountActions";
import { DataSection } from "@/components/DataSection";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LearningQuiz } from "@/components/learner/LearningQuiz";
import { A11Y_DEFAULT, applyA11y, readA11y, SIZES, type A11y } from "@/lib/a11y";
import { isLearningStyle, saveLearningStyle, STYLES, STYLE_LABELS, useLearningStyle } from "@/lib/learning";
import { buildExportEntries, downloadBlob } from "@/lib/export";
import { setShareEnabled, useShareLinks } from "@/lib/sharing";
import { useVault } from "@/lib/vault";
import { buildBackup, restoreBackup } from "@/lib/backup";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Improved Notes" }, { name: "description", content: "Personalize your learning preferences and manage exports and sharing." }] }),
  component: SettingsPage,
});
function SettingsPage() {
  const profile = useLearningStyle();
  const vault = useVault();
  const links = useShareLinks();
  const client = useQueryClient();
  const [a11y, setA11y] = useState<A11y>({ ...A11Y_DEFAULT });
  const [quiz, setQuiz] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setA11y(readA11y()); }, []);
  const update = (patch: Partial<A11y>) => {
    const next = { ...a11y, ...patch }; setA11y(next);
    try { applyA11y(next); } catch { setMessage("Preferences applied, but this browser couldn't save them on this device."); }
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await action(); }
    catch { setMessage("We couldn't finish that. Please try again."); }
    finally { setBusy(false); }
  };
  const [progress, setProgress] = useState("");
  async function exportEverything() {
    setBusy(true); setProgress("Starting…");
    try {
      const bytes = await buildBackup(setProgress);
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/zip" }), `improved-notes-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      toast.success("Backup downloaded. Keep it somewhere safe.");
    } catch { toast.error("Couldn't build the backup. Please try again."); } finally { setBusy(false); setProgress(""); }
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    setBusy(true); setProgress("Reading backup…");
    try {
      const r = await restoreBackup(await file.arrayBuffer(), setProgress);
      await client.invalidateQueries();
      toast.success(`Restored ${r.added} item${r.added === 1 ? "" : "s"}, ${r.files} file${r.files === 1 ? "" : "s"} and ${r.versions} earlier version${r.versions === 1 ? "" : "s"}.${r.skipped ? ` ${r.skipped} already existed and were left as they are.` : ""}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't restore that backup."); } finally { setBusy(false); setProgress(""); }
  }
  const field = "mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 text-foreground";
  return <div className="min-h-[calc(100dvh-var(--tabbar))] bg-background text-foreground">
    <AppHeader />
    <main className="stagger mx-auto max-w-3xl space-y-6 px-4 py-6">
      <h1 className="font-serif text-3xl font-semibold">Settings</h1>
      <AccountCard />
      <section aria-labelledby="learning-heading" className="paper-sheet space-y-4 p-4 sm:p-6">
        <h2 id="learning-heading" className="text-lg font-semibold">Learning preferences</h2>
        <p className="text-sm text-muted-foreground">A starting point, not a label. Try any approach that helps you.</p>
        {profile.isPending && <p role="status">Loading preference…</p>}
        {profile.isError && <p role="alert">Couldn't load your preference. <button className="underline" onClick={() => void profile.refetch()}>Retry</button></p>}
        <label className="block text-sm">Preferred approach<select className={field} disabled={busy || !profile.isSuccess} value={profile.data ?? ""} onChange={(event) => {
          const style = event.target.value;
          if (isLearningStyle(style)) void run(async () => { await saveLearningStyle(style); await client.invalidateQueries({ queryKey: ["learning-style"] }); setMessage("Learning preference saved."); });
        }}><option value="" disabled>Choose a preference</option>{STYLES.map((style) => <option key={style} value={style}>{STYLE_LABELS[style]}</option>)}</select></label>
        <Button variant="outline" onClick={() => setQuiz(true)}>Retake the quiz</Button>
      </section>
      <section aria-labelledby="appearance-heading" className="paper-sheet space-y-3 p-4 sm:p-6">
        <h2 id="appearance-heading" className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">Switch between light and dark, and pick a colour theme for each.</p>
        <AppearanceControls />
      </section>
      <section aria-labelledby="accessibility-heading" className="paper-sheet space-y-4 p-4 sm:p-6">
        <h2 id="accessibility-heading" className="text-lg font-semibold">Accessibility</h2>
        <p className="text-sm text-muted-foreground">Saved on this device and applied immediately.</p>
        <label className="block text-sm">Font<select className={field} value={a11y.font} onChange={(event) => { const value = event.target.value; if (value === "default" || value === "readable" || value === "dyslexic") update({ font: value }); }}>
          <option value="default">Default</option><option value="readable">Readable</option><option value="dyslexic">Dyslexic-friendly</option>
        </select></label>
        <label className="block text-sm">Text size<select className={field} value={a11y.size} onChange={(event) => update({ size: Number(event.target.value) })}>{SIZES.map((size) => <option key={size} value={size}>{size}%</option>)}</select></label>
        <label className="block text-sm">Line spacing<select className={field} value={a11y.spacing} onChange={(event) => { const value = event.target.value; if (value === "normal" || value === "relaxed" || value === "loose") update({ spacing: value }); }}>
          <option value="normal">Normal</option><option value="relaxed">Relaxed</option><option value="loose">Loose</option>
        </select></label>
        {([['contrast', 'High contrast'], ['motion', 'Reduce motion'], ['focus', 'Reading focus']] as const).map(([key, label]) => <label key={key} className="flex min-h-11 items-center justify-between gap-4 text-sm">{label}<Switch checked={a11y[key]} onCheckedChange={(checked) => update({ [key]: checked })} aria-label={label} /></label>)}
        <Button variant="outline" onClick={() => update(A11Y_DEFAULT)}>Reset accessibility</Button>
      </section>
      <DataSection />
      <section aria-labelledby="backup-heading" className="paper-sheet space-y-3 p-4 sm:p-6">
        <h2 id="backup-heading" className="text-lg font-semibold">Back up everything</h2>
        <p className="text-sm text-muted-foreground">Your notes are saved to your account and kept on every device you sign in on. This makes a copy that is entirely yours: every note (including Trash), version history, study cards, photos, audio and slides, plus readable Markdown.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy} onClick={() => void exportEverything()}>Download full backup</Button>
          <label className="inline-flex"><span className="sr-only">Restore from a backup file</span>
            <input type="file" accept=".zip,application/zip" disabled={busy} className="max-w-64 text-sm" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ""; }} /></label>
        </div>
        <p className="text-xs text-muted-foreground">Restoring adds what's missing. It never overwrites or deletes anything you already have.</p>
        {progress && <p role="status" className="text-sm">{progress}</p>}
      </section>
      <section aria-labelledby="export-heading" className="paper-sheet space-y-3 p-4 sm:p-6">
        <h2 id="export-heading" className="text-lg font-semibold">Your notes, to keep</h2>
        <p className="text-sm text-muted-foreground">Download Markdown files in their folders. Trashed notes are excluded.</p>
        {vault.isError && <p role="alert">Couldn't load your vault. <button className="underline" onClick={() => void vault.refetch()}>Retry</button></p>}
        <Button disabled={busy || !vault.isSuccess} onClick={() => void run(async () => {
          if (!vault.data) throw new Error("Vault unavailable");
          const { default: JSZip } = await import("jszip");
          const zip = new JSZip();
          const entries = buildExportEntries(vault.data.notes, vault.data.folders);
          if (!entries.length) { setMessage("There are no notes to export yet."); return; }
          for (const entry of entries) zip.file(entry.path, entry.markdown);
          downloadBlob(await zip.generateAsync({ type: "blob" }), "improved-notes-vault.zip");
          setMessage("Vault export downloaded.");
        })}>{busy ? "Working…" : "Export my vault"}</Button>
      </section>
      <section aria-labelledby="shares-heading" className="paper-sheet space-y-3 p-4 sm:p-6">
        <h2 id="shares-heading" className="text-lg font-semibold">Active share links</h2>
        <p className="text-sm text-muted-foreground">Anyone with a link can read that note. Turn it off to revoke access.</p>
        {links.isPending && <p role="status">Loading share links…</p>}
        {links.isError && <p role="alert">Couldn't load share links. <button className="underline" onClick={() => void links.refetch()}>Retry</button></p>}
        {links.isSuccess && !links.data.some((link) => link.enabled) && <p className="text-sm">No active share links.</p>}
        <ul className="space-y-2">{links.data?.filter((link) => link.enabled).map((link) => {
          const title = vault.data?.notes.find((note) => note.id === link.note_id)?.title ?? "Shared note";
          return <li key={link.token} className="flex min-h-11 items-center justify-between gap-3 border-t border-border py-3"><span className="min-w-0 break-words text-sm">{title}</span><Switch checked disabled={busy} aria-label={`Share ${title}`} onCheckedChange={(enabled) => void run(async () => { await setShareEnabled(link.token, enabled); await client.invalidateQueries({ queryKey: ["share-links"] }); setMessage("Share link turned off."); })} /></li>;
        })}</ul>
      </section>
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
      <Dialog open={quiz} onOpenChange={setQuiz}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Find a fresh starting point</DialogTitle><DialogDescription>Choose what feels helpful right now. You can always change it.</DialogDescription></DialogHeader>{quiz && <LearningQuiz onComplete={() => { setQuiz(false); setMessage("Learning preference saved."); }} onSkip={() => setQuiz(false)} />}</DialogContent></Dialog>
    </main>
  </div>;
}
