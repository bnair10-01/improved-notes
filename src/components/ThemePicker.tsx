import { useEffect, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { readTheme, savedThemeFor, THEMES, transitionTheme, type Mode } from "@/lib/theme";

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

/**
 * Light and dark as a switch. The thumb slides, the sun turns into the moon, and the new colours ripple out from it. It only flips the
 * look for now: the device's light or dark setting is what the app follows, at launch and whenever the device changes.
 */
function ThemeSwitch({ state }: { state: State }) {
  const dark = state.mode === "dark";
  return (
    <button type="button" role="switch" aria-checked={dark} aria-label={`Dark mode (follows your device; this flips it for now)`} data-theme-switch
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect(), mode: Mode = dark ? "light" : "dark";
        transitionTheme(mode, savedThemeFor(mode), { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      className="grid h-10 min-w-12 shrink-0 place-items-center rounded-full px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="theme-track" aria-hidden>
        <span className="theme-thumb"><Sun className="theme-sun" /><Moon className="theme-moon" /></span>
      </span>
    </button>
  );
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

/** In the top bar: the light/dark switch, plus (on wider screens) a palette button for the colour themes. */
export function ThemePicker() {
  const [state, set] = useThemeState();
  if (!state) return <div className="h-10 w-12" aria-hidden />;
  return (
    <>
    <ThemeSwitch state={state} />
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="hidden min-h-10 min-w-10 sm:inline-flex" aria-label={`Colour theme (${state.mode} mode, from your device)`}><Palette /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="mb-2 text-xs text-muted-foreground">{note(state.mode)}</p>
        <ThemeSwatches state={state} set={set} />
      </PopoverContent>
    </Popover>
    </>
  );
}

/** For Settings: the same switch and swatches, so phones (where the palette button is hidden) can pick a theme too. */
export function AppearanceControls() {
  const [state, set] = useThemeState();
  if (!state) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm"><p data-system-mode>{note(state.mode)}</p><ThemeSwitch state={state} /></div>
      <ThemeSwatches state={state} set={set} />
    </div>
  );
}
