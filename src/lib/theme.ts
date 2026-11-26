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

/** Runs before paint (inline in <head>) so the saved theme shows without a flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('theme-mode');if(m!=='light'&&m!=='dark'){m=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var t=localStorage.getItem('theme-'+m)||(m==='dark'?'noir':'mono');var d=document.documentElement;d.classList.toggle('dark',m==='dark');d.setAttribute('data-theme',t)}catch(e){}})();`;

export function applyTheme(mode: Mode, theme: string) {
  const d = document.documentElement;
  d.classList.toggle("dark", mode === "dark");
  d.setAttribute("data-theme", theme);
  localStorage.setItem("theme-mode", mode);
  localStorage.setItem(`theme-${mode}`, theme);
}

export function readTheme(): { mode: Mode; theme: string } {
  const d = document.documentElement;
  const mode: Mode = d.classList.contains("dark") ? "dark" : "light";
  return { mode, theme: d.getAttribute("data-theme") ?? DEFAULT_THEME[mode] };
}

export function savedThemeFor(mode: Mode) {
  return localStorage.getItem(`theme-${mode}`) ?? DEFAULT_THEME[mode];
}
