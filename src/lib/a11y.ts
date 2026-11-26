/** Accessibility preferences, saved per device and applied to <html> before paint. */
export type A11y = { font: "default" | "readable" | "dyslexic"; size: number; spacing: "normal" | "relaxed" | "loose"; contrast: boolean; motion: boolean; focus: boolean };
export const A11Y_DEFAULT: A11y = { font: "default", size: 100, spacing: "normal", contrast: false, motion: false, focus: false };
export const SIZES = [90, 100, 112, 125, 140] as const;
const KEY = "cleanmap-a11y";

export function parseA11y(raw: string | null): A11y {
  try {
    const v = JSON.parse(raw ?? "{}") as Partial<A11y>;
    return {
      font: v.font === "readable" || v.font === "dyslexic" ? v.font : "default",
      size: SIZES.includes(v.size as never) ? (v.size as number) : 100,
      spacing: v.spacing === "relaxed" || v.spacing === "loose" ? v.spacing : "normal",
      contrast: v.contrast === true, motion: v.motion === true, focus: v.focus === true,
    };
  } catch { return { ...A11Y_DEFAULT }; }
}

export const LINE_HEIGHT: Record<A11y["spacing"], number> = { normal: 1, relaxed: 1.18, loose: 1.36 };

/** The attributes and inline styles put on <html>. */
export function a11yAttrs(a: A11y) {
  return {
    "data-font": a.font, "data-contrast": a.contrast ? "high" : "normal", "data-motion": a.motion ? "reduce" : "normal", "data-focus": a.focus ? "on" : "off", "data-size": a.size >= 125 ? "large" : "normal",
    style: { fontSize: `${a.size}%`, "--lh": String(LINE_HEIGHT[a.spacing]) },
  };
}

export function applyA11y(a: A11y) {
  const d = document.documentElement, at = a11yAttrs(a);
  for (const [k, v] of Object.entries(at)) if (k !== "style") d.setAttribute(k, v as string);
  d.style.fontSize = at.style.fontSize;
  d.style.setProperty("--lh", at.style["--lh"]);
  localStorage.setItem(KEY, JSON.stringify(a));
}
/** Until someone chooses, follow the device's own "reduce motion" and "more contrast" settings. */
const fromSystem = (): A11y => {
  const mq = (q: string) => typeof matchMedia !== "undefined" && matchMedia(q).matches;
  return { ...A11Y_DEFAULT, motion: mq("(prefers-reduced-motion: reduce)"), contrast: mq("(prefers-contrast: more)") };
};
export const readA11y = () => {
  const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
  return raw === null ? fromSystem() : parseA11y(raw);
};

export const A11Y_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('${KEY}'),a=JSON.parse(raw||'{}'),d=document.documentElement;if(raw===null){a.motion=matchMedia('(prefers-reduced-motion: reduce)').matches;a.contrast=matchMedia('(prefers-contrast: more)').matches}var S=[90,100,112,125,140];d.setAttribute('data-font',a.font==='readable'||a.font==='dyslexic'?a.font:'default');d.setAttribute('data-contrast',a.contrast?'high':'normal');d.setAttribute('data-motion',a.motion?'reduce':'normal');d.setAttribute('data-focus',a.focus?'on':'off');if(S.indexOf(a.size)>-1)d.style.fontSize=a.size+'%';d.setAttribute('data-size',a.size>=125?'large':'normal');d.style.setProperty('--lh',{relaxed:1.18,loose:1.36}[a.spacing]||1)}catch(e){}})();`;

/** Split text into sentences for read-aloud. */
export function sentences(text: string): string[] {
  return (text.replace(/[#*_>`\[\]]/g, " ").replace(/\s+/g, " ").match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
}
