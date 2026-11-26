const EVENT = "split-note";
/** Offer to split a long note into several. The SplitHost in the app header picks this up. */
export const openSplit = (noteId: string) => window.dispatchEvent(new CustomEvent(EVENT, { detail: noteId }));
export const SPLIT_EVENT = EVENT;
