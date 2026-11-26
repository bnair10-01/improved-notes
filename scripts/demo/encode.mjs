// Turns the frames saved during a demo run into a video, using Chrome's built-in video encoder (WebCodecs).
// No ffmpeg needed. Long idle stretches (waiting for the AI) are shortened to 3 seconds so the video moves.
//
//   node scripts/demo/encode.mjs <frames-dir> <output-file-without-extension>
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PAGE = `<!doctype html><meta charset=utf-8><body style="background:#000;color:#fff;font:14px system-ui"><p id=s>encoding…</p>
<script type="module">
import { Muxer as Mp4, ArrayBufferTarget as Mp4Target } from "/lib/mp4-muxer.mjs";
import { Muxer as Webm, ArrayBufferTarget as WebmTarget } from "/lib/webm-muxer.mjs";
const log = (m) => fetch("/log", { method: "POST", body: String(m) });
const W = 1280, H = 800, MAX_GAP = 3;
try {
  const frames = await (await fetch("/frames/frames.json")).json();
  if (!frames.length) throw new Error("no frames recorded");
  let cfg = null, kind = "mp4";
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42001f"]) {
    const c = { codec, width: W, height: H, bitrate: 3_500_000, framerate: 15 };
    if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; break; }
  }
  if (!cfg) { cfg = { codec: "vp09.00.10.08", width: W, height: H, bitrate: 3_000_000, framerate: 15 }; kind = "webm"; }
  const target = kind === "mp4" ? new Mp4Target() : new WebmTarget();
  const muxer = kind === "mp4"
    ? new Mp4({ target, video: { codec: "avc", width: W, height: H }, fastStart: "in-memory" })
    : new Webm({ target, video: { codec: "V_VP9", width: W, height: H } });
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => log("ERROR " + e.message) });
  enc.configure(cfg);
  const canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext("2d");
  let ts = 0;
  for (let i = 0; i < frames.length; i++) {
    const bmp = await createImageBitmap(await (await fetch("/frames/" + frames[i].f)).blob());
    const k = Math.min(W / bmp.width, H / bmp.height), w = bmp.width * k, h = bmp.height * k;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h); bmp.close();
    const gap = i + 1 < frames.length ? Math.min(MAX_GAP, Math.max(0.04, frames[i + 1].t - frames[i].t)) : 1.5;
    const vf = new VideoFrame(canvas, { timestamp: Math.round(ts * 1e6), duration: Math.round(gap * 1e6) });
    enc.encode(vf, { keyFrame: i % 30 === 0 }); vf.close(); ts += gap;
    while (enc.encodeQueueSize > 24) await new Promise((r) => setTimeout(r, 10));
    if (i % 250 === 0) await log("frame " + i + " / " + frames.length);
  }
  await enc.flush(); muxer.finalize();
  await fetch("/out?ext=" + kind, { method: "POST", body: target.buffer });
  await log("DONE " + Math.round(ts) + "s");
} catch (e) { await log("FAILED " + e.message); }
</script>`;

export async function encodeVideo(framesDir, outBase, { chrome } = {}) {
  const bin = chrome || process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const libs = { "/lib/mp4-muxer.mjs": join(root, "node_modules/mp4-muxer/build/mp4-muxer.mjs"), "/lib/webm-muxer.mjs": join(root, "node_modules/webm-muxer/build/webm-muxer.mjs") };
  let result; let resolve;
  const done = new Promise((r) => (resolve = r));
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/" || url.pathname === "/encode.html") { res.setHeader("content-type", "text/html"); return res.end(PAGE); }
    if (libs[url.pathname]) { res.setHeader("content-type", "text/javascript"); return createReadStream(libs[url.pathname]).pipe(res); }
    if (url.pathname.startsWith("/frames/")) {
      const f = join(framesDir, url.pathname.slice(8));
      if (!f.startsWith(framesDir) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
      return createReadStream(f).pipe(res);
    }
    if (req.method === "POST") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        if (url.pathname === "/log") { const m = body.toString(); process.stdout.write(`  encode: ${m}\n`); if (m.startsWith("FAILED") || m.startsWith("ERROR")) resolve(null); }
        if (url.pathname === "/out") { const file = `${outBase}.${url.searchParams.get("ext") === "webm" ? "webm" : "mp4"}`; writeFileSync(file, body); result = file; }
        if (url.pathname === "/log" && body.toString().startsWith("DONE")) resolve(result);
        res.end("ok");
      });
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const proc = spawn(bin, ["--headless=new", "--no-first-run", `--user-data-dir=/tmp/encode-chrome-${port}`, "--autoplay-policy=no-user-gesture-required", `http://127.0.0.1:${port}/encode.html`], { stdio: "ignore" });
  const timeout = setTimeout(() => resolve(null), 20 * 60_000);
  const file = await done;
  clearTimeout(timeout); proc.kill(); server.close();
  try { rmSync(`/tmp/encode-chrome-${port}`, { recursive: true, force: true }); } catch { /* temp */ }
  return file;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) { console.error("usage: node encode.mjs <frames-dir> <output-base>"); process.exit(2); }
  const f = await encodeVideo(dir, out);
  console.log(f ? `Video: ${f}` : "Encoding failed");
  process.exit(f ? 0 : 1);
}
