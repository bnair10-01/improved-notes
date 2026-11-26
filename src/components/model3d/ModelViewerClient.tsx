import { lazy, Suspense } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import type { ModelViewerProps } from './ModelViewer';
const Viewer = lazy(() => import('./ModelViewer'));
/** All application callers should use this SSR-safe entry point. */
export default function ModelViewerClient(props: ModelViewerProps) {
  return <ClientOnly fallback={<p role="status">Loading model…</p>}><Suspense fallback={<p role="status">Loading model…</p>}><Viewer {...props} /></Suspense></ClientOnly>;
}
