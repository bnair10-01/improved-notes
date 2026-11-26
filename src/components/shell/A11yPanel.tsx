import { useEffect, useState } from "react";
import { Accessibility, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { A11Y_DEFAULT, SIZES, applyA11y, readA11y, type A11y } from "@/lib/a11y";

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-1 rounded-lg bg-secondary p-1">
        {options.map(([v, l]) => (
          <button key={String(v)} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={`min-h-9 flex-1 rounded-md px-1 text-xs ${value === v ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function A11yPanel() {
  const [a, setA] = useState<A11y>(A11Y_DEFAULT);
  useEffect(() => setA(readA11y()), []);
  const set = (p: Partial<A11y>) => { const n = { ...a, ...p }; setA(n); applyA11y(n); };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="min-h-10 min-w-10" aria-label="Accessibility settings"><Accessibility /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Reading & accessibility</p>
          <Button variant="ghost" size="sm" onClick={() => set(A11Y_DEFAULT)}><RotateCcw /> Reset</Button>
        </div>
        <Seg label="Font" value={a.font} onChange={(font) => set({ font })} options={[["default", "Default"], ["readable", "Readable"], ["dyslexic", "Dyslexia-friendly"]]} />
        <Seg label="Text size" value={a.size} onChange={(size) => set({ size })} options={SIZES.map((s) => [s, `${s}%`])} />
        <Seg label="Line spacing" value={a.spacing} onChange={(spacing) => set({ spacing })} options={[["normal", "Normal"], ["relaxed", "Relaxed"], ["loose", "Loose"]]} />
        {([["contrast", "High contrast"], ["motion", "Reduce motion"], ["focus", "Focus mode (hide extras)"]] as const).map(([k, l]) => (
          <label key={k} className="flex min-h-9 items-center justify-between text-sm">{l}<Switch checked={a[k]} onCheckedChange={(v) => set({ [k]: v })} /></label>
        ))}
        <p className="text-xs text-muted-foreground">Saved on this device and used on every page. Read-aloud is on each note.</p>
      </PopoverContent>
    </Popover>
  );
}
