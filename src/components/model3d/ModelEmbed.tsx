import { useQuery } from '@tanstack/react-query';
import { useVault } from '@/lib/vault';
import { loadModel } from '@/lib/model3d-store';
import ModelViewerClient from './ModelViewerClient';
/** Read-only embed. Never relies on vault rows containing model_spec. */
export default function ModelEmbed({ title }: { title: string }) {
  const vault = useVault();
  const note = vault.data?.notes.find(n => n.kind === 'model3d' && !n.deleted_at && n.title.trim().toLowerCase() === title.trim().toLowerCase());
  const model = useQuery({
    queryKey: ['model3d-embed', note?.id, note?.updated_at], enabled: !!note,
    staleTime: 25 * 60 * 1000, refetchInterval: 25 * 60 * 1000,
    queryFn: async () => {
      if (!note) throw new Error('Model not found.');
      return loadModel(note.id);
    },
  });
  if (vault.isPending || (!!note && model.isPending)) return <p role="status">Loading {title}…</p>;
  if (vault.error || model.error) return <p role="alert">Could not load this model.</p>;
  if (!note || !model.data) return <p className="text-sm text-muted-foreground">Model “{title}” was not found.</p>;
  return <ModelViewerClient compact spec={model.data.spec} {...(model.data.glbUrl ? { glbUrl: model.data.glbUrl } : {})} />;
}
