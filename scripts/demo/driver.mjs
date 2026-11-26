// A tiny Chrome driver for the demo: launches a real, visible Chrome window, shows a cursor and captions,
// clicks and types like a person would, and takes screenshots. No dependencies (Node's built-in WebSocket).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERLAY = `(()=>{const add=()=>{if(document.getElementById('demo-cursor')||!document.documentElement)return;
const c=document.createElement('div');c.id='demo-cursor';c.style.cssText='position:fixed;z-index:2147483647;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.92);border:2px solid #000;box-shadow:0 0 0 7px rgba(255,255,255,.22);left:-60px;top:-60px;pointer-events:none;transition:left .5s ease,top .5s ease,transform .18s';document.documentElement.appendChild(c);
const k=document.createElement('div');k.id='demo-caption';k.style.cssText='position:fixed;z-index:2147483647;left:50%;bottom:22px;transform:translateX(-50%);max-width:82vw;padding:10px 20px;border-radius:999px;background:rgba(0,0,0,.86);color:#fff;font:500 15px system-ui,sans-serif;opacity:0;transition:opacity .3s;pointer-events:none;border:1px solid #555;text-align:center';document.documentElement.appendChild(k)};
add();document.addEventListener('DOMContentLoaded',add);setInterval(add,500)})();`;

const FIND = `(q)=>{
  const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
  const sel=q.sel||'button,a,[role=tab],[role=menuitem],[role=radio],[role=switch],[role=option],label,summary,input,textarea,select';
  let els=[...document.querySelectorAll(sel)].filter(vis);
  if(q.within){const roots=[...document.querySelectorAll(q.within)];els=els.filter(e=>roots.some(r=>r.contains(e)))}
  if(q.text){const re=new RegExp(q.text,q.flags||'i');els=els.filter(e=>re.test(((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')+' '+(e.getAttribute('placeholder')||'')).trim()))}
  els.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length);
  const e=els[q.nth||0];if(!e)return null;
  e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();
  return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),text:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,60)}}`;

const KEYS = {
  Enter: { code: "Enter", vk: 13, text: "\r" }, Escape: { code: "Escape", vk: 27 }, Tab: { code: "Tab", vk: 9 },
  k: { code: "KeyK", vk: 75 }, a: { code: "KeyA", vk: 65 }, p: { code: "KeyP", vk: 80 }, e: { code: "KeyE", vk: 69 },
};

export async function launch({ headed = true, width = 1440, height = 900, chrome, outDir, speed = 1 }) {
  const bin = chrome || process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(bin)) throw new Error(`Chrome not found at ${bin}. Set CHROME_PATH.`);
  mkdirSync(outDir, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "demo-chrome-"));
  const port = 9600 + Math.floor(Math.random() * 300);
  const proc = spawn(bin, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height + 90}`, "--window-position=30,20",
    "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "--disable-popup-blocking",
    ...(headed ? [] : ["--headless=new"]), "about:blank",
  ], { stdio: "ignore" });

  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
  const page = targets?.find((t) => t.type === "page");
  if (!page) { proc.kill(); throw new Error("Could not connect to Chrome."); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  let id = 0; const pending = new Map(); const handlers = []; let closed = false;
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method) handlers.forEach((h) => h(d));
  };
  ws.onclose = () => { closed = true; for (const { rej } of pending.values()) rej(new Error("Chrome was closed")); pending.clear(); };
  const send = (method, params = {}) => new Promise((res, rej) => {
    if (closed) return rej(new Error("Chrome was closed"));
    const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params }));
  });

  const consoleErrors = [];
  const d = {
    outDir, send, consoleErrors, promptText: "", shots: [], speed, headed,
    pause: (ms) => sleep(ms * speed),
    async evaluate(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split("\n")[0] ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async goto(url) { await send("Page.navigate", { url }); await sleep(1500); },
    async waitFor(expr, { timeout = 30000, every = 300, label = "" } = {}) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { try { if (await d.evaluate(`!!(${expr})`)) return true; } catch { /* page navigating */ } await sleep(every); }
      throw new Error(`Timed out waiting for ${label || expr.slice(0, 70)}`);
    },
    async caption(text) { try { await d.evaluate(`(()=>{const k=document.getElementById('demo-caption');if(k){k.textContent=${JSON.stringify(text)};k.style.opacity=${text ? 1 : 0}}})()`); } catch { /* ignore */ } },
    async find(q) { return d.evaluate(`(${FIND})(${JSON.stringify(q)})`); },
    async locate(q, timeout = 15000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { const r = await d.find(q); if (r) return r; await sleep(250); }
      throw new Error(`Could not find ${JSON.stringify(q)}`);
    },
    async moveTo(x, y) {
      await d.evaluate(`(()=>{const c=document.getElementById('demo-cursor');if(c){c.style.left=(${x}-10)+'px';c.style.top=(${y}-10)+'px'}})()`);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await sleep(520 * speed);
    },
    async click(q, { clickCount = 1 } = {}) {
      const r = await d.locate(typeof q === "string" ? { text: q } : q);
      await d.moveTo(r.x, r.y);
      await d.evaluate(`(()=>{const c=document.getElementById('demo-cursor');if(c){c.style.transform='scale(.7)';setTimeout(()=>c.style.transform='',180)}})()`);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", buttons: 1, clickCount });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", buttons: 0, clickCount });
      await sleep(250 * speed);
      return r;
    },
    async type(text, { chunk = 2, delay = 22 } = {}) {
      for (let i = 0; i < text.length; i += chunk) { await send("Input.insertText", { text: text.slice(i, i + chunk) }); await sleep(delay * speed); }
    },
    async press(key, { meta = false, ctrl = false } = {}) {
      const k = KEYS[key] ?? { code: key, vk: key.charCodeAt(0) };
      const modifiers = (meta ? 4 : 0) | (ctrl ? 2 : 0);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers, ...(k.text && !meta ? { text: k.text } : {}) });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers });
      await sleep(150 * speed);
    },
    async drag(points) {
      const [first, ...rest] = points;
      await d.moveTo(first[0], first[1]);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: first[0], y: first[1], button: "left", buttons: 1, clickCount: 1 });
      for (const [x, y] of rest) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 }); await sleep(12); }
      const last = points[points.length - 1];
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last[0], y: last[1], button: "left", buttons: 0, clickCount: 1 });
    },
    async setViewport(w, h, mobile = false) {
      if (!w) return send("Emulation.clearDeviceMetricsOverride");
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
      await sleep(900);
    },
    async shot(name) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      const file = `${String(d.shots.length + 1).padStart(2, "0")}-${name}.png`;
      writeFileSync(join(outDir, file), Buffer.from(r.data, "base64"));
      d.shots.push(file);
      return file;
    },
    // Screen recording: save the tab's frames while the demo runs; encode.mjs turns them into a video afterwards.
    async startRecording({ fps = 12, quality = 62, maxWidth = 1280 } = {}) {
      const dir = join(outDir, "frames");
      mkdirSync(dir, { recursive: true });
      const frames = [];
      let last = -1, n = 0, t0 = -1;
      d._rec = { dir, frames };
      handlers.push((m) => {
        if (m.method !== "Page.screencastFrame") return;
        const { data, metadata, sessionId } = m.params;
        send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
        const t = metadata.timestamp;
        if (t0 < 0) t0 = t;
        if (last >= 0 && t - last < 1 / fps) return;
        last = t;
        const f = `${String(n++).padStart(6, "0")}.jpg`;
        writeFileSync(join(dir, f), Buffer.from(data, "base64"));
        frames.push({ f, t: t - t0 });
      });
      await send("Page.startScreencast", { format: "jpeg", quality, maxWidth, maxHeight: 900, everyNthFrame: 1 });
    },
    async stopRecording() {
      if (!d._rec) return null;
      try { await send("Page.stopScreencast"); } catch { /* page closed */ }
      writeFileSync(join(d._rec.dir, "frames.json"), JSON.stringify(d._rec.frames));
      return { dir: d._rec.dir, count: d._rec.frames.length };
    },
    async close() { try { ws.close(); } catch { /* closed */ } proc.kill(); },
  };

  handlers.push((m) => {
    if (m.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true, promptText: d.promptText }).catch(() => undefined);
    if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0] ?? m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
  });
  await send("Page.enable"); await send("Runtime.enable");
  // Behave as if the window is focused even when it is not, so menus stay open if you use other windows meanwhile.
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: OVERLAY });
  return d;
}
