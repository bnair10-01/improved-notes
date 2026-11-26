import { Cloud, Cpu } from "lucide-react";
import { useInferenceStatus } from "@/lib/ai/status";

/** Shows where the last AI answer was produced: on this device (Gemini Nano) or in the cloud. */
export function InferenceBadge({ className = "" }: { className?: string }) {
  const { source } = useInferenceStatus();
  if (!source) return null;
  const local = source === "on_device";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${local ? "border-primary/50 text-foreground" : "text-muted-foreground"} ${className}`}
      title={local ? "Answered on this device. Nothing left your computer." : "Answered by Gemini in the cloud."}
      data-inference={source}
    >
      {local ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
      {local ? "On-device" : "Cloud"}
    </span>
  );
}
