import { lazy, Suspense } from "react";
import { openDialog, useOpenDialog } from "@/lib/dialogs";

const ImportSlidesDialog = lazy(() => import("@/components/slides/ImportSlidesDialog").then((m) => ({ default: m.ImportSlidesDialog })));
const AddAudioDialog = lazy(() => import("@/components/audio/AddAudioDialog").then((m) => ({ default: m.AddAudioDialog })));
const LinkDialog = lazy(() => import("@/components/capture/LinkDialog").then((m) => ({ default: m.LinkDialog })));
const NewModelDialog = lazy(() => import("@/components/model3d/NewModelDialog").then((m) => ({ default: m.NewModelDialog })));

export function DialogHost() {
  const k = useOpenDialog();
  const close = (o: boolean) => { if (!o) openDialog(null); };
  return (
    <Suspense fallback={null}>
      {k === "slides" && <ImportSlidesDialog open onOpenChange={close} />}
      {k === "model" && <NewModelDialog open onOpenChange={close} />}
      {k === "link" && <LinkDialog open onOpenChange={close} />}
      {k === "audio" && <AddAudioDialog open onOpenChange={close} />}
    </Suspense>
  );
}
