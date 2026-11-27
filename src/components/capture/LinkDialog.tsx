import { takeCaptureTopic } from "@/lib/capture-context";
import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UrlCapture } from "@/components/capture/UrlCapture";
import { useVault } from "@/lib/vault";

/** Paste a website or YouTube link from anywhere. It lands in the topic you were in, or in one you name. */
export function LinkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: vault } = useVault();
  const folderId = useMemo(() => takeCaptureTopic(), []);
  const folderName = folderId ? vault?.folders.find((f) => f.id === folderId)?.name : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a website or YouTube link</DialogTitle>
          <DialogDescription>{folderName ? `It will be divided into notes and added to “${folderName}”, or a new topic if you prefer.` : "It will be divided into separate notes under a topic you name."}</DialogDescription>
        </DialogHeader>
        <UrlCapture kind="link" folderId={folderId} {...(folderName ? { folderName } : {})} />
      </DialogContent>
    </Dialog>
  );
}
