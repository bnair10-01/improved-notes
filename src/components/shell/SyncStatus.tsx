import { useEffect, useState } from "react";
import { CloudOff, CloudUpload } from "lucide-react";
import { usePendingUploads } from "@/lib/upload-queue";

/** Tells people their work is safe on this device when the network is down or files are still uploading. */
export function SyncStatus() {
  const waiting = usePendingUploads();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (online && waiting === 0) return null;
  const text = !online
    ? `Offline. Everything is saved on this device${waiting ? ` (${waiting} file${waiting > 1 ? "s" : ""} will upload later)` : " and will sync when you reconnect"}.`
    : `Uploading ${waiting} file${waiting > 1 ? "s" : ""}…`;
  return (
    <span role="status" title={text} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
      {online ? <CloudUpload className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
      <span className="hidden sm:inline">{online ? "Uploading" : "Offline"}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
