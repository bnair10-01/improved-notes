import { Working } from "@/components/fun/Doodle";
import { takeCaptureTopic } from "@/lib/capture-context";
import { dialogFile } from "@/lib/dialogs";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { writeBatch } from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { commit, newId, nowIso, userDoc } from "@/lib/db";
import { uploadFile } from "@/lib/notes";
import { ensureSignedIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTime, MAX_AUDIO_BYTES, MAX_AUDIO_SEC, validateAudioFile } from "@/lib/audio";
import { readAudioDuration } from "@/lib/audio-browser";

export function AddAudioDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const elapsed = useRef(0);
  const tick = useRef(0);
  const generation = useRef(0);
  const recorded = useRef(false);
  function release() {
    generation.current++;
    const r = recorder.current;
    if (r) { r.onstop = null; r.ondataavailable = null; if (r.state !== "inactive") r.stop(); }
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null; recorder.current = null;
  }
  useEffect(() => {
    if (!open) { release(); setState("idle"); setFile(null); setError(""); setSeconds(0); setStarting(false); }
    return () => release();
  }, [open]);
  useEffect(() => {
    if (state !== "recording") return;
    const id = window.setInterval(() => {
      const value = (elapsed.current + performance.now() - tick.current) / 1000;
      setSeconds(value);
      if (value >= MAX_AUDIO_SEC) stop();
    }, 250);
    return () => window.clearInterval(id);
  }, [state]);
  // A file dropped or picked on Home arrives already chosen.
  useEffect(() => { const f = dialogFile(); if (open && f) void selectFile(f); }, [open]);
  async function selectFile(next: File | undefined) {
    if (!next) return;
    const id = ++generation.current;
    setError(""); setFile(null); setBusy(true);
    try {
      const invalid = validateAudioFile(next); if (invalid) throw new Error(invalid);
      const sec = await readAudioDuration(next);
      const issue = validateAudioFile(next, sec); if (issue) throw new Error(issue);
      if (id === generation.current) { setFile(next); setDuration(sec); recorded.current = false; }
    } catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : "Couldn't open this audio."); }
    finally { setBusy(false); }
  }
  async function start() {
    setError(""); setStarting(true);
    const id = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Recording isn't supported here. Upload an audio file instead.");
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (id !== generation.current) { mic.getTracks().forEach(t => t.stop()); return; }
      stream.current = mic;
      const mime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(m => MediaRecorder.isTypeSupported(m));
      const r = mime ? new MediaRecorder(mic, { mimeType: mime }) : new MediaRecorder(mic);
      recorder.current = r;
      const chunks: Blob[] = []; let bytes = 0;
      r.ondataavailable = e => { if (e.data.size) { chunks.push(e.data); bytes += e.data.size; if (bytes >= MAX_AUDIO_BYTES && r.state !== "inactive") stop(); } };
      r.onerror = () => { setError("Recording stopped unexpectedly. Please try again."); release(); setState("idle"); };
      r.onstop = () => {
        mic.getTracks().forEach(t => t.stop());
        if (id !== generation.current) return;
        const type = r.mimeType || chunks[0]?.type || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const next = new File(chunks, `Recording.${ext}`, { type });
        const sec = elapsed.current / 1000;
        const issue = validateAudioFile(next, sec);
        if (issue) { setError(issue); setFile(null); } else { setFile(next); setDuration(sec); recorded.current = true; }
        setState("idle"); recorder.current = null;
      };
      setFile(null); elapsed.current = 0; tick.current = performance.now(); setSeconds(0);
      r.start(1000); setState("recording");
    } catch (e) {
      stream.current?.getTracks().forEach(t => t.stop());
      setError(e instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(e.name) ? "Microphone access was denied. Allow microphone access in your browser settings, or upload a file instead." : e instanceof Error ? e.message : "Couldn't start recording.");
    } finally { setStarting(false); }
  }
  function stop() {
    const r = recorder.current;
    if (!r || r.state === "inactive") return;
    if (r.state === "recording") elapsed.current += performance.now() - tick.current;
    r.stop(); setState("idle");
  }
  function pauseResume() {
    const r = recorder.current; if (!r) return;
    if (r.state === "recording") { elapsed.current += performance.now() - tick.current; r.pause(); setState("paused"); }
    else if (r.state === "paused") { tick.current = performance.now(); r.resume(); setState("recording"); }
  }
  async function save() {
    if (!file || busy) return;
    setBusy(true); setError("");
    const noteId = newId(); let path: string | undefined;
    try {
      const issue = validateAudioFile(file, duration); if (issue) throw new Error(issue);
      const user = await ensureSignedIn();
      path = `users/${user.uid}/audio/${noteId}/audio.${file.name.split(".").pop()!.toLowerCase()}`;
      await uploadFile(path, file, file.type || "application/octet-stream");
      // The note and its audio record are written together, so there is never a note without its file.
      const now = nowIso(), batch = writeBatch(db);
      batch.set(userDoc("notes", noteId), { kind: "audio", title: recorded.current ? `Recording ${new Date().toLocaleString()}` : file.name, markdown: "", tags: [], folder_id: takeCaptureTopic(), pinned: false, deleted_at: null, source_note_ids: [], created_at: now, updated_at: now, rev: 1 });
      batch.set(userDoc("attachments", newId()), { note_id: noteId, type: "audio", storage_path: path, position: 0, metadata: { duration, mime: file.type, bookmarks: [] }, created_at: now });
      await commit(batch.commit());
    } catch (e) {
      if (path) await deleteObject(storageRef(storage, path)).catch(() => undefined);
      setError(e instanceof Error ? e.message : "Couldn't save audio. Please try again."); setBusy(false); return;
    }
    await queryClient.invalidateQueries({ queryKey: ["vault"] });
    setBusy(false); onOpenChange(false);
    await navigate({ to: "/vault/$noteId", params: { noteId } });
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Add audio note</DialogTitle><DialogDescription>Upload or record up to 90 minutes, 100 MB. Transcription is optional.</DialogDescription></DialogHeader>
    <Tabs defaultValue="upload"><TabsList className="w-full"><TabsTrigger value="upload" disabled={state !== "idle" || starting}>Upload</TabsTrigger><TabsTrigger value="record" disabled={busy}>Record</TabsTrigger></TabsList>
      <TabsContent value="upload"><label className="grid gap-2 text-sm">Audio file<input type="file" accept=".mp3,.m4a,.wav,.webm,.ogg" disabled={busy} onChange={e => void selectFile(e.target.files?.[0])} className="w-full rounded-md border p-3" /></label></TabsContent>
      <TabsContent value="record" className="space-y-3"><p className="font-mono" role="timer" aria-label="Recording duration">{formatTime(seconds)}</p><div className="flex flex-wrap gap-2">{state === "idle" ? <Button onClick={() => void start()} disabled={starting || busy}>{starting ? "Opening microphone…" : "Record"}</Button> : <><Button variant="outline" onClick={pauseResume}>{state === "paused" ? "Resume" : "Pause"}</Button><Button onClick={stop}>Stop</Button></>}</div></TabsContent>
    </Tabs>
    {file && <p className="break-all text-sm">{file.name} · {formatTime(duration)}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {busy && <Working kind="wave" quips="audio" steps={["Preparing your audio…", "Getting it ready to listen…", "Saving it to your notes…"]} />}
    <Button disabled={!file || busy || starting || state !== "idle"} onClick={() => void save()}>{busy ? "Preparing audio…" : "Save audio note"}</Button>
  </DialogContent></Dialog>;
}
