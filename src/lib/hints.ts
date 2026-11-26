/** Dismissible usage tips, remembered per device. */
const KEY = "improvednotes-hints";
type State = { off?: boolean; dismissed?: string[] };
export function parseHints(raw: string | null): State { try { const v = JSON.parse(raw ?? "{}") as State; return { off: v.off === true, dismissed: Array.isArray(v.dismissed) ? v.dismissed.filter((x) => typeof x === "string") : [] }; } catch { return { off: false, dismissed: [] }; } }
export const shouldShowHint = (s: State, id: string) => !s.off && !(s.dismissed ?? []).includes(id);
export function dismissHint(s: State, id: string): State { return { ...s, dismissed: [...new Set([...(s.dismissed ?? []), id])] }; }
export const readHints = () => parseHints(localStorage.getItem(KEY));
export function writeHints(s: State) { localStorage.setItem(KEY, JSON.stringify(s)); window.dispatchEvent(new Event("hints-change")); }
