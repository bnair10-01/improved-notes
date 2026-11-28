export type Mode = "light" | "dark";
export const THEMES: Record<Mode, { id: string; name: string; swatch: [string, string] }[]> = {
  light: [
    { id: "mono", name: "Black & white", swatch: ["oklch(1 0 0)", "oklch(0 0 0)"] },
    { id: "paper", name: "Paper", swatch: ["oklch(0.965 0.014 85)", "oklch(0.42 0.07 175)"] },
    { id: "sage", name: "Sage", swatch: ["oklch(0.965 0.014 130)", "oklch(0.42 0.07 145)"] },
    { id: "rose", name: "Rose", swatch: ["oklch(0.965 0.014 30)", "oklch(0.42 0.1 12)"] },
    { id: "sky", name: "Sky", swatch: ["oklch(0.965 0.014 230)", "oklch(0.42 0.1 245)"] },
    { id: "lavender", name: "Lavender", swatch: ["oklch(0.965 0.014 300)", "oklch(0.42 0.1 290)"] },
    { id: "sand", name: "Sand", swatch: ["oklch(0.965 0.014 70)", "oklch(0.42 0.1 50)"] },
  ],
  dark: [
    { id: "noir", name: "Black & white", swatch: ["oklch(0 0 0)", "oklch(1 0 0)"] },
    { id: "ink", name: "Ink", swatch: ["oklch(0.2 0.014 70)", "oklch(0.76 0.08 170)"] },
    { id: "forest", name: "Forest", swatch: ["oklch(0.2 0.014 150)", "oklch(0.76 0.09 145)"] },
    { id: "plum", name: "Plum", swatch: ["oklch(0.2 0.014 320)", "oklch(0.76 0.1 335)"] },
    { id: "midnight", name: "Midnight", swatch: ["oklch(0.2 0.014 260)", "oklch(0.76 0.1 235)"] },
    { id: "ember", name: "Ember", swatch: ["oklch(0.2 0.014 45)", "oklch(0.76 0.12 40)"] },
    { id: "slate", name: "Slate", swatch: ["oklch(0.2 0.014 230)", "oklch(0.76 0.06 200)"] },
  ],
};
export const DEFAULT_THEME: Record<Mode, string> = { light: "mono", dark: "noir" };

/** Runs before paint (inline in <head>) so the theme shows without a flash. Light or dark always comes from the device; only the colour theme within it is chosen. */
export const THEME_INIT_SCRIPT = `(function(){try{var m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var t=localStorage.getItem('theme-'+m)||(m==='dark'?'noir':'mono');var d=document.documentElement;d.classList.toggle('dark',m==='dark');d.setAttribute('data-theme',t)}catch(e){}})();`;

export function applyTheme(mode: Mode, theme: string) {
  const d = document.documentElement;
  d.classList.toggle("dark", mode === "dark");
  d.setAttribute("data-theme", theme);
  localStorage.setItem(`theme-${mode}`, theme);
  window.dispatchEvent(new Event("theme-change"));
}

export function readTheme(): { mode: Mode; theme: string } {
  const d = document.documentElement;
  const mode: Mode = d.classList.contains("dark") ? "dark" : "light";
  return { mode, theme: d.getAttribute("data-theme") ?? DEFAULT_THEME[mode] };
}

export function savedThemeFor(mode: Mode) {
  return localStorage.getItem(`theme-${mode}`) ?? DEFAULT_THEME[mode];
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } };

/** Light or dark is whatever the device says. There is no manual override. */
export const systemMode = (): Mode => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** Apply a theme with a soft cross-fade. Under Reduce motion, or where the browser can't, it simply changes. */
export function transitionTheme(mode: Mode, theme: string) {
  const d = document.documentElement, doc = document as ViewTransitionDoc;
  const apply = () => applyTheme(mode, theme);
  if (!doc.startViewTransition || d.getAttribute("data-motion") === "reduce") { apply(); return; }
  d.setAttribute("data-theming", "fade");
  void doc.startViewTransition(apply).finished.finally(() => d.removeAttribute("data-theming"));
}

/** Follow the device live: when it flips between light and dark (sunset, a Control Centre toggle), so does the app. */
export function startSystemThemeSync() {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const sync = () => { const mode = systemMode(); if (readTheme().mode !== mode) transitionTheme(mode, savedThemeFor(mode)); };
  mq.addEventListener("change", sync);
  sync();
}
