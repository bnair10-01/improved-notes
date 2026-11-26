import { useEffect, useState } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { applyTheme, readTheme, savedThemeFor, THEMES, type Mode } from "@/lib/theme";

/** One button: shows light/dark; inside, switch mode and pick a theme for that mode. */
export function ThemePicker() {
  const [state, setState] = useState<{ mode: Mode; theme: string } | null>(null);
  useEffect(() => setState(readTheme()), []);
  if (!state) return <div className="h-10 w-10" aria-hidden />;
  const set = (mode: Mode, theme: string) => { applyTheme(mode, theme); setState({ mode, theme }); };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="min-h-10 min-w-10" aria-label={`Appearance: ${state.mode} mode`}>
          {state.mode === "dark" ? <Moon /> : <Sun />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div role="radiogroup" aria-label="Mode" className="flex gap-1 rounded-lg bg-secondary p-1">
          {(["light", "dark"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={state.mode === m} onClick={() => set(m, savedThemeFor(m))}
              className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm capitalize ${state.mode === m ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>
              {m === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {m}
            </button>
          ))}
        </div>
        <p className="mb-2 mt-3 text-xs text-muted-foreground">Theme</p>
        <div className="grid grid-cols-3 gap-2">
          {THEMES[state.mode].map((t) => {
            const on = state.theme === t.id;
            return (
              <button key={t.id} type="button" onClick={() => set(state.mode, t.id)} aria-pressed={on}
                className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-xs hover:bg-accent ${on ? "border-ring" : ""}`}>
                <span className="relative flex h-8 w-full items-end justify-end overflow-hidden rounded-md p-1" style={{ background: t.swatch[0] }}>
                  <span className="h-3.5 w-3.5 rounded-full" style={{ background: t.swatch[1] }} />
                  {on && <Check className="absolute left-1 top-1 h-3.5 w-3.5" style={{ color: t.swatch[1] }} />}
                </span>
                {t.name}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
