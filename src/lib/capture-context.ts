/** Where the next imported material should land: the topic of the note the person was writing in. Read once, then cleared. */
let topic: string | null = null;
export const setCaptureTopic = (folderId: string | null) => { topic = folderId; };
export const takeCaptureTopic = (): string | null => { const t = topic; topic = null; return t; };
