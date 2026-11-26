/** Opens a clean, print-ready page of the transcript; the browser's print dialog saves it as PDF. */
export function exportPdf(title: string, html: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page{margin:18mm}
body{font-family:Georgia,'Times New Roman',serif;color:#1d1b18;line-height:1.6;max-width:720px;margin:24px auto;padding:0 16px;font-size:12pt}
h1{font-size:20pt;margin:0 0 .6em}h2{font-size:15pt}h3{font-size:13pt}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:10.5pt}
th,td{border:1px solid #bbb;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f1ede6}
blockquote{border-left:3px solid #999;margin:.8em 0;padding:.3em .9em;background:#f6f3ee}
.uncertain-mark{background:#fde7b0}
</style></head><body><h1>${esc(title)}</h1>${html}
<script>window.onload=()=>{setTimeout(()=>window.print(),150)}<\/script></body></html>`);
  w.document.close();
  return true;
}
