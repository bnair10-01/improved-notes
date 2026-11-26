import { useEffect, useRef, useState } from "react";
import { getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { getBlob, ref as storageRef } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { commit, userCol, userDoc } from "@/lib/db";
import { signedUrls } from "@/lib/notes";
import { Button } from "@/components/ui/button";
import { activeSegment, formatTime, markdownToSegments, segmentsToMarkdown, type Bookmark, type Segment } from "@/lib/audio";
import { wavChunks } from "@/lib/audio-browser";
import { transcribeAudio, cleanUpTranscript } from "@/lib/ai/tasks";
type Json = string | number | boolean | null | Json[] | { [k: string]: Json | undefined };
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}
type Attachment = { id: string; storage_path: string; metadata: Json };
function object(value: Json): Record<string, Json | undefined> { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function uncertainty(text: string) { return text.split(/(\[illegible\]|\[[^\]\n]+\?\])/g).map((part, i) => /^\[.*\]$/.test(part) ? <mark key={i} className="uncertain-mark">{part}</mark> : part); }
export default function AudioView({ noteId, markdown, onMarkdownChange }: { noteId: string; markdown: string; onMarkdownChange: (md: string) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const scope = useRef(0);
  const transcribe = transcribeAudio;
  const cleanup = cleanUpTranscript;
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [retry, setRetry] = useState(0);
  const metadata = object(attachment?.metadata ?? null);
  const bookmarks: Bookmark[] = Array.isArray(metadata['bookmarks']) ? metadata['bookmarks'].flatMap(b => {
    const item = object(b); return typeof item['t'] === "number" && Number.isFinite(item['t']) && typeof item['comment'] === "string" ? [{ t: item['t'], comment: item['comment'] }] : [];
  }) : [];
  const raw: Segment[] = Array.isArray(metadata['raw_segments']) ? metadata['raw_segments'].flatMap(s => {
    const item = object(s);
    return typeof item['start'] === "number" && typeof item['end'] === "number" && typeof item['text'] === "string" ? [{ start: item['start'], end: item['end'], text: item['text'], ...(typeof item['speaker'] === "string" ? { speaker: item['speaker'] } : {}) }] : [];
  }) : [];
  const parsed = markdownToSegments(markdown);
  const segments = parsed.map((s, i) => raw[i]?.start === s.start ? { ...s, end: raw[i]!.end } : s);
  const current = activeSegment(segments, time);
  useEffect(() => {
    const id = ++scope.current;
    setLoading(true); setError(""); setAttachment(null); setUrl(""); setTime(0); setDuration(0); setPlaying(false); setBusy(false); setComment("");
    async function load() {
      try {
        const snap = await getDocs(query(userCol("attachments"), where("note_id", "==", noteId)));
        const found = snap.docs.map((d) => ({ id: d.id, ...(d.data() as { storage_path: string; metadata: Json; type: string; position?: number }) }))
          .filter((a) => a.type === "audio").sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
        if (!found) throw new Error("No audio attached to this note.");
        if (id !== scope.current) return;
        setAttachment({ id: found.id, storage_path: found.storage_path, metadata: found.metadata });
        const meta = object(found.metadata);
        if (typeof meta['duration'] === "number") setDuration(meta['duration']);
        const [signed] = await signedUrls([found.storage_path]);
        if (!signed) throw new Error("Couldn't load the audio file.");
        if (id === scope.current) setUrl(signed);
      } catch (e) { if (id === scope.current) setError(e instanceof Error ? e.message : "Couldn't load audio."); }
      finally { if (id === scope.current) setLoading(false); }
    }
    void load();
    return () => { scope.current++; };
  }, [noteId, retry]);
  async function updateMetadata(patch: Record<string, Json>) {
    if (!attachment) throw new Error("Audio is not loaded.");
    const id = scope.current;
    // Re-read before merging so unrelated metadata is not overwritten.
    const latest = await getDoc(userDoc("attachments", attachment.id));
    const next = { ...object((latest.get("metadata") ?? null) as Json), ...patch };
    await commit(updateDoc(userDoc("attachments", attachment.id), { metadata: next }));
    if (id === scope.current) setAttachment({ ...attachment, metadata: next });
  }
  function seek(t: number) { if (audio.current) { const next = Math.max(0, Math.min(duration, t)); audio.current.currentTime = next; setTime(next); } }
  async function toggle() {
    if (!audio.current) return;
    try { if (audio.current.paused) await audio.current.play(); else audio.current.pause(); }
    catch { setError("Couldn't play audio. Reload it and try again."); }
  }
  async function run(kind: "transcribe" | "cleanup" | "bookmark") {
    if (!attachment || busy) return;
    const id = scope.current;
    setBusy(true); setError(""); setProgress("");
    try {
      if (kind === "bookmark") {
        await updateMetadata({ bookmarks: [...bookmarks, { t: time, comment: comment.trim().slice(0, 180) }].sort((a, b) => a.t - b.t) });
        if (id === scope.current) setComment("");
      } else if (kind === "cleanup") {
        // Preserve the original even when cleaning an imported timestamped transcript.
        if (!raw.length && parsed.length) await updateMetadata({ raw_segments: parsed.map(s => ({ ...s, end: Number.isFinite(s.end) ? s.end : duration })) });
        const result = await cleanup({ text: markdown });
        if (!result.ok) throw new Error(result.error);
        if (id === scope.current) onMarkdownChange(result.result);
      } else {
        setProgress("Preparing audio…");
        const blob = await getBlob(storageRef(storage, attachment.storage_path));
        const collected: Segment[] = [];
        if (blob.size > 18 * 1024 * 1024) {
          for await (const chunk of wavChunks(blob)) {
            if (id !== scope.current) return;
            setProgress(`Transcribing chunk ${chunk.index + 1} of ${chunk.total}…`);
            const result = await transcribe({ base64: chunk.base64, mime: chunk.mime, offsetSec: chunk.offsetSec });
            if (!result.ok) throw new Error(result.error);
            collected.push(...result.result);
          }
        } else {
          setProgress("Transcribing…");
          const mime = blob.type && blob.type !== "application/octet-stream" ? blob.type : String(object(attachment.metadata)["mime"] ?? "");
          const result = await transcribe({ base64: await blobToBase64(blob), mime });
          if (!result.ok) throw new Error(result.error);
          collected.push(...result.result);
        }
        if (id !== scope.current) return;
        collected.sort((a, b) => a.start - b.start);
        await updateMetadata({ raw_segments: collected });
        if (id === scope.current) { onMarkdownChange(segmentsToMarkdown(collected)); setProgress(collected.length ? "Transcript ready." : "No speech detected."); }
      }
    } catch (e) { if (id === scope.current) setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { if (id === scope.current) setBusy(false); }
  }
  if (loading) return <p role="status" className="p-4 text-muted-foreground">Loading audio…</p>;
  return <section className="space-y-5" aria-label="Audio note">
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" disabled={busy} onClick={() => setRetry(n => n + 1)}>Reload audio</Button></div>}
    {url && <><audio ref={audio} src={url} preload="metadata" onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onLoadedMetadata={e => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration); e.currentTarget.playbackRate = speed; }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError("Couldn't load playback. Reload the audio to renew its private link.")} />
      <div className="space-y-3 rounded-xl border bg-card p-4" role="group" aria-label="Audio player" onKeyDown={e => { if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(e.target.tagName)) return; if (e.key === " ") { e.preventDefault(); void toggle(); } if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); seek(time + (e.key === "ArrowLeft" ? -10 : 10)); } }} tabIndex={0}>
        <div className="flex flex-wrap items-center gap-2"><Button variant="outline" aria-label="Back 10 seconds" onClick={() => seek(time - 10)}>−10s</Button><Button onClick={() => void toggle()}>{playing ? "Pause" : "Play"}</Button><Button variant="outline" aria-label="Forward 10 seconds" onClick={() => seek(time + 10)}>+10s</Button><label className="ml-auto text-sm">Speed <select className="rounded border bg-background p-2" value={speed} onChange={e => { const value = Number(e.target.value); setSpeed(value); if (audio.current) audio.current.playbackRate = value; }}>{[0.75, 1, 1.25, 1.5, 1.75, 2].map(n => <option key={n} value={n}>{n}×</option>)}</select></label></div>
        <input aria-label="Playback position" type="range" min={0} max={duration || 1} step={0.1} value={Math.min(time, duration)} className="w-full accent-primary" onChange={e => seek(Number(e.target.value))} onKeyDown={e => { if (e.key === " ") { e.preventDefault(); void toggle(); } }} aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`} />
        <p className="text-sm tabular-nums text-muted-foreground">{formatTime(time)} / {formatTime(duration)}</p>
      </div>
      <div className="space-y-2"><h3 className="font-medium">Bookmarks</h3><form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run("bookmark"); }}><input aria-label="Bookmark comment" maxLength={180} placeholder="Short comment (optional)" value={comment} onChange={e => setComment(e.target.value)} className="min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" /><Button type="submit" variant="outline" disabled={busy}>Bookmark</Button></form>{!bookmarks.length && <p className="text-sm text-muted-foreground">Save a moment to revisit later.</p>}<ul>{bookmarks.map((b, i) => <li key={`${b.t}-${i}`}><button type="button" onClick={() => seek(b.t)} className="min-h-11 text-left text-sm text-primary underline-offset-4 hover:underline">{formatTime(b.t)} {b.comment}</button></li>)}</ul></div>
    </>}
    {attachment && <div className="flex flex-wrap items-center gap-2"><Button disabled={busy} onClick={() => void run("transcribe")}>Transcribe</Button><span className="text-xs text-muted-foreground">Uses AI credits</span><Button variant="outline" disabled={busy || !markdown.trim()} onClick={() => void run("cleanup")}>Clean up transcript</Button>{raw.length > 0 && <Button variant="ghost" disabled={busy} onClick={() => onMarkdownChange(segmentsToMarkdown(raw))}>Restore original</Button>}<p className="w-full text-xs text-muted-foreground">Cleanup also uses AI credits. Transcribing again replaces the current transcript.</p></div>}
    <p role="status" className="text-sm text-muted-foreground">{progress}</p>
    {segments.length ? <ol aria-label="Transcript" className="space-y-1">{segments.map((s, i) => <li key={`${s.start}-${i}`}><button type="button" onClick={() => seek(s.start)} aria-current={i === current ? "true" : undefined} className={`w-full rounded-lg p-3 text-left text-sm focus-visible:outline focus-visible:outline-ring ${i === current ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}><span className="mr-2 font-mono text-xs text-muted-foreground">{formatTime(s.start)}</span>{s.speaker && <strong>{s.speaker}: </strong>}{uncertainty(s.text)}</button></li>)}</ol> : markdown.trim() ? <div className="whitespace-pre-wrap text-sm">{uncertainty(markdown)}</div> : <p className="text-sm text-muted-foreground">No transcript yet. Listen to your audio or choose Transcribe when you're ready.</p>}
  </section>;
}
