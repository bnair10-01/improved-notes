import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { readTheme, THEMES, transitionTheme, type Mode } from "@/lib/theme";

type State = { mode: Mode; theme: string };

/** The current look, kept in step with the device and with every picker on the page. */
function useThemeState() {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    const sync = () => setState(readTheme());
    sync();
    window.addEventListener("theme-change", sync);
    return () => window.removeEventListener("theme-change", sync);
  }, []);
  return [state, (theme: string) => state && transitionTheme(state.mode, theme)] as const;
}

/** The colour themes for the device's current mode, as swatches. */
function ThemeSwatches({ state, set }: { state: State; set: (theme: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {THEMES[state.mode].map((t) => {
        const on = state.theme === t.id;
        return (
          <button key={t.id} type="button" onClick={() => set(t.id)} aria-pressed={on}
            className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-xs hover:bg-accent ${on ? "border-ring" : ""}`}>
            <span className="relative flex h-8 w-full items-end justify-end overflow-hidden rounded-md p-1" style={{ background: t.swatch[0] }}>
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: t.swatch[1] }} />
              {on && <Check className="pop absolute left-1 top-1 h-3.5 w-3.5" style={{ color: t.swatch[1] }} />}
            </span>
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

const note = (m: Mode) => `Light or dark follows your device, which is in ${m} mode now. This sets the ${m} colours; the other mode keeps its own.`;

/** In the top bar: a palette button for the colour themes. Light and dark themselves come from the device. */
export function ThemePicker() {
  const [state, set] = useThemeState();
  if (!state) return <div className="h-10 w-10" aria-hidden />;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="min-h-10 min-w-10" aria-label={`Colour theme (${state.mode} mode, from your device)`}><Palette /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="mb-2 text-xs text-muted-foreground">{note(state.mode)}</p>
        <ThemeSwatches state={state} set={set} />
      </PopoverContent>
    </Popover>
  );
}

/** For Settings. */
export function AppearanceControls() {
  const [state, set] = useThemeState();
  if (!state) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm" data-system-mode>{note(state.mode)}</p>
      <ThemeSwatches state={state} set={set} />
    </div>
  );
}
