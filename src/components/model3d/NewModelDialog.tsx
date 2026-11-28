import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { writeBatch } from 'firebase/firestore';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { commit, newId, nowIso, userDoc } from '@/lib/db';
import { uploadFile } from '@/lib/notes';
import { ensureSignedIn } from '@/lib/auth';
import { describeConcept, type ConceptText } from '@/lib/ai/tasks';
import { generateReferenceImage, type ReferenceImage } from '@/lib/ai/illustrate';
import { modelConcept } from '@/lib/model3d';
import { Button } from '@/components/ui/button';
import { Working } from '@/components/fun/Doodle';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type NewModelDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; sourceNote?: { id: string; title: string; markdown: string; folderId?: string | null } };

/** The markdown that goes with a picture: what it shows, then its parts, each with the line of your notes it came from. */
export const conceptMarkdown = (text: ConceptText, link?: string) =>
  `${text.summary}\n\n${text.parts.map((p) => `- **${p.name}**: ${p.description}${p.source_quote ? ` (“${p.source_quote}”)` : ''}`).join('\n')}${link ? `\n\n[[${link}]]` : ''}`;

/** "Picture of a concept": Nano Banana draws a clean labelled-free illustration while a fast model writes what it shows, and the two become one note. */
export function NewModelDialog({ open, onOpenChange, sourceNote }: NewModelDialogProps) {
  const [concept, setConcept] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const lock = useRef(false), qc = useQueryClient(), navigate = useNavigate();

  async function run() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setPreview(null);
    try {
      const what = sourceNote ? modelConcept(sourceNote.title, concept) : concept;
      const notes = sourceNote ? sourceNote.markdown.slice(0, 30000) : undefined;
      const pictureP: Promise<ReferenceImage> = generateReferenceImage(what, notes);
      void pictureP.then((p) => setPreview(`data:${p.mime};base64,${p.base64}`)).catch(() => undefined);
      const [picture, described] = await Promise.all([pictureP, describeConcept({ concept: what, ...(notes ? { context: notes } : {}) })]);
      if (!described.ok) throw new Error(described.error);
      await create(described.text, picture);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function create(text: ConceptText, picture: ReferenceImage) {
    const user = await ensureSignedIn();
    const id = newId();
    const path = `users/${user.uid}/models/${id}/reference.${picture.mime.includes('jpeg') ? 'jpg' : 'png'}`;
    let uploaded = false;
    try {
      await uploadFile(path, Uint8Array.from(atob(picture.base64), (c) => c.charCodeAt(0)), picture.mime); uploaded = true;
      // The note, its picture record and its link to the note it came from are saved in one atomic write.
      const now = nowIso(), batch = writeBatch(db);
      batch.set(userDoc('notes', id), { kind: 'model3d', title: text.title, markdown: conceptMarkdown(text, sourceNote?.title), model_spec: null, folder_id: sourceNote?.folderId ?? null, tags: [], pinned: false, deleted_at: null, source_note_ids: sourceNote ? [sourceNote.id] : [], created_at: now, updated_at: now, rev: 1 });
      batch.set(userDoc('attachments', newId()), { note_id: id, type: 'model_reference', storage_path: path, position: 1, metadata: { mime_type: picture.mime, ai_generated: true }, created_at: now });
      if (sourceNote) batch.set(userDoc('links', newId()), { from_note_id: id, to_note_id: sourceNote.id, kind: 'wikilink', label: null, created_at: now });
      await commit(batch.commit());
    } catch (e) {
      if (uploaded) await deleteObject(storageRef(storage, path)).catch(() => undefined);
      throw e;
    }
    await qc.invalidateQueries({ queryKey: ['vault'] });
    onOpenChange(false);
    await navigate({ to: '/vault/$noteId', params: { noteId: id } });
  }

  return <Dialog open={open} onOpenChange={value => { if (!lock.current) onOpenChange(value); }}><DialogContent className="max-h-[90dvh] overflow-auto">
    <DialogHeader><DialogTitle>Picture of a concept</DialogTitle><DialogDescription>{sourceNote ? `Draws a picture of “${sourceNote.title || 'this note'}” from what you wrote. Add a focus only if you want one.` : 'Describe something to see: the parts of a bicycle hub, a plant cell, how a heart pumps.'}</DialogDescription></DialogHeader>
    <div className="space-y-3">
      <label className="block text-sm">{sourceNote ? 'Anything specific? (optional)' : 'What would you like to see?'}
        <textarea className="mt-2 w-full rounded border bg-background p-2 text-base sm:text-sm" maxLength={1000} value={concept} onChange={e => setConcept(e.target.value)} disabled={busy} placeholder={sourceNote ? 'For example: focus on how energy is made' : 'For example, the parts of a bicycle hub'} />
      </label>
      <p className="text-xs text-muted-foreground">Nano Banana draws the picture and a note lists what's in it, using your own words where it can. Simplified, not to scale. Review AI-generated details.</p>
      <Button className="min-h-11 w-full sm:min-h-0 sm:w-auto" disabled={busy || (!sourceNote && !concept.trim())} onClick={() => void run()}>{busy ? 'Drawing…' : 'Draw the picture'}</Button>
    </div>
    {busy && <div className="space-y-3">
      {preview && <img src={preview} alt="The picture being saved" className="enter-pop mx-auto max-h-56 rounded-lg border bg-white object-contain" />}
      <Working kind={preview ? 'write' : 'sketch'} quips="model3d" steps={preview ? ['Writing what the picture shows…', 'Matching the parts to your notes…', 'Saving it…'] : ['Sketching the picture…', 'Picking the parts worth showing…', 'Colouring it in…']} />
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </DialogContent></Dialog>;
}
