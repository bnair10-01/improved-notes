import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { writeBatch } from 'firebase/firestore';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { commit, newId, nowIso, userDoc } from '@/lib/db';
import { uploadFile } from '@/lib/notes';
import { ensureSignedIn } from '@/lib/auth';
import { generateModelSpec } from '@/lib/ai/tasks';
import { generateReferenceImage, type ReferenceImage } from '@/lib/ai/illustrate';
import { validateSpec, type Spec, modelConcept } from '@/lib/model3d';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
export type NewModelDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; sourceNote?: { id: string; title: string; markdown: string; folderId?: string | null } };
export function NewModelDialog({ open, onOpenChange, sourceNote }: NewModelDialogProps) {
  const [concept, setConcept] = useState(''), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const lock = useRef(false), qc = useQueryClient(), navigate = useNavigate();
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await work(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function create(spec: Spec | null, upload?: File, picture?: ReferenceImage | null) {
    const user = await ensureSignedIn();
    const title = spec?.title ?? upload?.name.replace(/\.glb$/i, '') ?? '3D model';
    const markdown = `${spec?.summary ?? 'Uploaded 3D model.'}\n\n${spec?.parts.filter(p => !p.instance_of).map(p => { const n = spec.parts.filter(x => x.instance_of === p.id).length + 1; return `- **${p.name}**${n > 1 ? ` ×${n}` : ''}: ${p.description}${p.source_quote ? ` (“${p.source_quote}”)` : ''}`; }).join('\n') ?? ''}${sourceNote ? `\n\n[[${sourceNote.title}]]` : ''}`;
    const id = newId(), storagePath = `users/${user.uid}/models/${id}/model.glb`;
    const picturePath = `users/${user.uid}/models/${id}/reference.${picture?.mime.includes('jpeg') ? 'jpg' : 'png'}`;
    let uploaded = false;
    try {
      if (upload) { await uploadFile(storagePath, upload, 'model/gltf-binary'); uploaded = true; }
      if (picture) { await uploadFile(picturePath, Uint8Array.from(atob(picture.base64), c => c.charCodeAt(0)), picture.mime); uploaded = true; }
      // The model note, its file record and its link are saved in one atomic write.
      const now = nowIso(), batch = writeBatch(db);
      batch.set(userDoc('notes', id), { kind: 'model3d', title, markdown, model_spec: spec, folder_id: sourceNote?.folderId ?? null, tags: [], pinned: false, deleted_at: null, source_note_ids: sourceNote ? [sourceNote.id] : [], created_at: now, updated_at: now, rev: 1 });
      if (upload) batch.set(userDoc('attachments', newId()), { note_id: id, type: 'model_file', storage_path: storagePath, position: 0, metadata: { filename: upload.name, size: upload.size, mime_type: 'model/gltf-binary' }, created_at: now });
      if (picture) batch.set(userDoc('attachments', newId()), { note_id: id, type: 'model_reference', storage_path: picturePath, position: 1, metadata: { mime_type: picture.mime, ai_generated: true }, created_at: now });
      if (sourceNote) batch.set(userDoc('links', newId()), { from_note_id: id, to_note_id: sourceNote.id, kind: 'wikilink', label: null, created_at: now });
      await commit(batch.commit());
    } catch (e) {
      if (uploaded) { await deleteObject(storageRef(storage, storagePath)).catch(() => undefined); await deleteObject(storageRef(storage, picturePath)).catch(() => undefined); }
      throw e;
    }
    await qc.invalidateQueries({ queryKey: ['vault'] });
    onOpenChange(false);
    await navigate({ to: '/vault/$noteId', params: { noteId: id } });
  }
  return <Dialog open={open} onOpenChange={value => { if (!lock.current) onOpenChange(value); }}><DialogContent className="max-h-[90dvh] overflow-auto"><DialogHeader><DialogTitle>New 3D concept model</DialogTitle><DialogDescription>{sourceNote ? `Builds a model of “${sourceNote.title || 'this note'}” from what you wrote. Add a focus only if you want one.` : 'Describe a schematic or upload a GLB file.'}</DialogDescription></DialogHeader>
    <Tabs defaultValue="describe"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="describe">Describe</TabsTrigger><TabsTrigger value="upload">Upload GLB</TabsTrigger></TabsList>
      <TabsContent value="describe" className="space-y-3"><label className="block text-sm">{sourceNote ? 'Anything specific? (optional)' : 'What would you like to explore?'}<textarea className="mt-2 w-full rounded border bg-background p-2" maxLength={1000} value={concept} onChange={e => setConcept(e.target.value)} placeholder={sourceNote ? 'For example: focus on how energy is made' : 'For example, the parts of a bicycle hub'} /></label><p className="text-xs text-muted-foreground">First draws a reference picture (Nano Banana), then builds the 3D model to match it. Simplified, not to scale. Review AI-generated details.</p><Button disabled={busy || (!sourceNote && !concept.trim())} onClick={() => void run(async () => {
        const what = sourceNote ? modelConcept(sourceNote.title, concept) : concept;
        const notes = sourceNote ? sourceNote.markdown.slice(0, 30000) : undefined;
        // First a clean picture of the whole (Nano Banana), then the 3D model built to match it. No picture? The model still gets built.
        setMessage('Drawing a reference picture…');
        const picture = await generateReferenceImage(what, notes).catch(() => null);
        setMessage(picture ? 'Building the 3D model to match…' : 'Building the 3D model…');
        const response = await generateModelSpec({ concept: what, ...(notes ? { context: notes } : {}), ...(picture ? { reference: picture } : {}) });
        if (!response.ok) throw new Error(response.error);
        await create(validateSpec(response.spec), undefined, picture);
      })}>{busy ? 'Creating…' : sourceNote ? 'Create 3D model' : 'Create schematic'}</Button></TabsContent>
      <TabsContent value="upload" className="space-y-3"><label className="block text-sm">Self-contained GLB file (maximum 25 MB)<input className="mt-2 block w-full text-sm" type="file" accept=".glb,model/gltf-binary" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><p className="text-xs text-muted-foreground">Meshes become selectable parts. Single-mesh files cannot be exploded.</p><Button disabled={busy || !file} onClick={() => void run(async () => {
        if (!file) return;
        if (!/\.glb$/i.test(file.name) || file.size > 25 * 1024 * 1024 || file.size < 20) throw new Error('Choose a valid GLB file up to 25 MB.');
        const header = new DataView(await file.slice(0, 12).arrayBuffer());
        if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== file.size) throw new Error('This is not a valid GLB 2.0 file.');
        await create(null, file);
      })}>{busy ? 'Uploading…' : 'Upload model'}</Button></TabsContent>
    </Tabs>{message && <p role="status" className="text-sm">{message}</p>}
  </DialogContent></Dialog>;
}
