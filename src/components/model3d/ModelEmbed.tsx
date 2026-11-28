import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useVault } from '@/lib/vault';
import { loadPicture } from './ModelNotePanel';

/** `![[model:Title]]` in a note: shows that concept note's picture, linking to the note. */
export default function ModelEmbed({ title }: { title: string }) {
  const vault = useVault();
  const note = vault.data?.notes.find(n => n.kind === 'model3d' && !n.deleted_at && n.title.trim().toLowerCase() === title.trim().toLowerCase());
  const pic = useQuery({ queryKey: ['concept-picture', note?.id], enabled: !!note, staleTime: 20 * 60 * 1000, queryFn: () => loadPicture(note!.id) });
  if (vault.isPending || (!!note && pic.isPending)) return <p role="status">Loading {title}…</p>;
  if (vault.error || pic.error) return <p role="alert">Could not load this picture.</p>;
  if (!note || !pic.data?.url) return <p className="text-sm text-muted-foreground">Picture “{title}” was not found.</p>;
  return (
    <Link to="/vault/$noteId" params={{ noteId: note.id }} className="block overflow-hidden rounded-xl border bg-white">
      <img src={pic.data.url} alt={`Picture of ${title}`} className="mx-auto max-h-96 w-full object-contain" loading="lazy" />
    </Link>
  );
}
