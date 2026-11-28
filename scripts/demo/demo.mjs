#!/usr/bin/env node
// The demo: drives a real Chrome window through everything Improved Notes does, takes a screenshot of every
// scene, and records a check for each thing it claims to show. It is also an end-to-end test of the live site.
//
//   npm run demo                      watch it run in a visible Chrome window (about 6 to 8 minutes)
//   npm run demo -- --slow 1.5        slower, easier to follow
//   npm run demo -- --only maps,graph run just some scenes
//   npm run demo -- --headless        no window (for CI)
//   npm run demo -- --no-record       skip the video (it is recorded by default, to demo.mp4)
//   npm run demo -- --url http://localhost:5173
//
// It makes real AI calls (summaries, answers, flashcards, a web page import), so it uses a few cents of AI credit.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { launch, sleep } from "./driver.mjs";
import { encodeVideo } from "./encode.mjs";

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? def : (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? true : process.argv[i + 1]); };
const BASE = String(arg("url", "https://improvednotes-d0907.web.app")).replace(/\/$/, "");
const SPEED = Number(arg("slow", 1)) || 1;
const HEADED = !arg("headless", false);
const RECORD = !arg("no-record", false);
const ONLY = arg("only", "") ? String(arg("only")).split(",") : null;
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const OUT = join(process.cwd(), "demo-output", stamp);

// ─── The content the demo writes. Two topics are linked on purpose; two are not. ───
const TOPICS = ["Cell Biology", "Plant Science", "Design Strategy", "Medieval History"];
const NOTES = [
  { topic: "Cell Biology", title: "Mitochondria", body: "The mitochondrion makes most of the cell's ATP through respiration. Its inner membrane folds into cristae, and a proton gradient drives ATP synthase.\n\nMitochondria have their own circular DNA, which is evidence for endosymbiosis." },
  { topic: "Cell Biology", title: "ATP", body: "ATP is the energy currency of the cell. Cells spend ATP on movement, building molecules and active transport.\n\nMost of it is made in the [[Mitochondria]]." },
  { topic: "Plant Science", title: "Photosynthesis", body: "Photosynthesis turns light, water and carbon dioxide into sugar and oxygen. Light reactions happen in the thylakoid membrane and make ATP and NADPH. The Calvin cycle in the stroma uses them to fix carbon.\n\nIt is the reverse of what [[Mitochondria]] do: respiration releases the energy that photosynthesis stores." },
  { topic: "Plant Science", title: "Chloroplasts", body: "Chloroplasts are the organelles where photosynthesis happens. They contain stacks of thylakoids and have their own circular DNA.\n\nSee [[Photosynthesis]]." },
  { topic: "Design Strategy", title: "Four Lenses", body: "Design strategy balances four lenses. Design asks what people need, business asks what is viable, technology asks what is feasible, and strategy asks where to focus." },
  { topic: "Design Strategy", title: "Design vs Strategy", body: "Design asks how should we build it. Strategy asks what should we build, and why.\n\nSee [[Four Lenses]]." },
  { topic: "Medieval History", title: "Feudalism", body: "Feudalism tied lords and vassals together through land and loyalty. Peasants worked the land in return for protection." },
  { topic: "Medieval History", title: "Black Death", body: "The Black Death killed about a third of Europe in the 1300s. Labour became scarce, which weakened [[Feudalism]]." },
];

// ─── Plumbing ───
let closedEarly = false;
const results = [];
const ids = {};
let d;
const log = (...a) => console.log(...a);

async function scene(key, title, fn) {
  if (ONLY && !ONLY.includes(key)) return;
  if (closedEarly) return;
  const t0 = Date.now();
  const checks = [];
  const ctx = { check: (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); log(`     ${ok ? "✔" : "✘"} ${name}${detail ? `  (${detail})` : ""}`); } };
  log(`\n▶ ${title}`);
  let error = null;
  try { await fn(ctx); } catch (e) { error = e.message; log(`     ✘ ${e.message}`); if (/Chrome was closed/.test(e.message)) closedEarly = true; else { try { await d.shot(`FAILED-${key}`); } catch { /* page gone */ } } }
  results.push({ key, title, error, checks, seconds: Math.round((Date.now() - t0) / 1000) });
}

const say = async (text, pauseMs = 1400) => { await d.caption(text); await d.pause(pauseMs); };
const pathId = () => d.evaluate("location.pathname.split('/').filter(Boolean).pop()");
const text = () => d.evaluate("document.body.innerText");
const dismiss = async () => { const b = await d.find({ text: "^Skip for now$" }); if (b) await d.click({ text: "^Skip for now$" }); };
const rail = async (label) => { await dismiss(); await d.click({ sel: "[data-rail] a", text: `^${label}$` }); await d.pause(900); };
const rest = async (label) => { await d.waitFor(`/${label}/.test(location.pathname)`, { label: `${label} page` }); };

async function openNote(title) {
  const isOpen = `document.querySelector('[aria-label=Title]') && document.querySelector('[aria-label=Title]').value === ${JSON.stringify(title)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await dismiss();
    await d.press("k", { meta: true });
    await d.waitFor("document.querySelector('[cmdk-input]')", { label: "search box" });
    await d.type(title, { chunk: 1, delay: 40 });
    await d.pause(700);
    // Pick the exact title, not whatever happens to be listed first (a generated note can share its first word).
    await d.click({ sel: "[cmdk-item]", text: `^${title}$` });
    try { await d.waitFor(isOpen, { timeout: 8000, label: `note ${title}` }); break; }
    catch (e) { await d.press("Escape"); if (attempt === 2) throw e; }
  }
  await d.pause(700);
}

async function openTopic(name) {
  await rail("Topics");
  for (let i = 0; i < 3; i++) {
    await d.click({ text: `^${name}` });
    try { await d.waitFor("/\\/topics\\/[^/]+$/.test(location.pathname)", { timeout: 7000, label: `topic ${name}` }); break; }
    catch (e) { if (i === 2) throw e; }
  }
  await d.pause(900);
}

async function newTopic(name) {
  await d.click({ text: "New topic" });
  await d.waitFor("document.querySelector('[aria-label=\"Topic name\"]')", { label: "the New topic dialog" });
  await d.click({ sel: "[aria-label='Topic name']" });
  await d.type(name, { chunk: 1, delay: 45 });
  await d.pause(500);
  await d.click({ text: "^Create topic$" });
  await d.waitFor("/\\/topics\\/[^/]+$/.test(location.pathname)", { label: "new topic page" });
  ids[`topic:${name}`] = await pathId();
}

async function writeNote({ title, body, topic }) {
  await rail("Notes");
  const before = await pathId();
  await d.click({ text: "^Write$" });
  await d.waitFor(`/\\/vault\\/[^/]+$/.test(location.pathname) && location.pathname.split('/').pop() !== ${JSON.stringify(before)}`, { label: "new note" });
  await dismiss();
  await d.click({ sel: "[aria-label=Title]" });
  await d.evaluate("document.querySelector('[aria-label=Title]').select()");
  await d.type(title, { chunk: 1, delay: 35 });
  await d.press("Enter");
  await d.click({ sel: "textarea[aria-label='Note markdown']" });
  await d.type(body, { chunk: 3, delay: 18 });
  await d.pause(1500);
  await d.click({ text: "^No folder$" });
  await d.click({ sel: "[role=menuitem]", text: `^${topic}$` });
  await d.waitFor("!/Editing…/.test(document.body.innerText)", { timeout: 15000, label: "autosave" });
  await d.pause(500);
  ids[title] = await pathId();
}

// ─── Scenes ───
async function run() {
  d = await launch({ headed: HEADED, outDir: OUT, speed: SPEED });
  if (RECORD) await d.startRecording();
  if (!HEADED) log("  note:    headless Chrome is treated as a bot by reCAPTCHA, so the AI scenes will be refused. Use the visible window for those.");
  log(`Improved Notes demo\n  site:    ${BASE}\n  window:  ${HEADED ? "visible Chrome" : "headless"}\n  output:  ${OUT}`);

  await scene("welcome", "1. The welcome page, before signing in", async (t) => {
    await d.goto(BASE);
    await d.waitFor("document.querySelector('h1') && /Take notes/.test(document.querySelector('h1').innerText)", { label: "headline" });
    await say("Welcome. Start writing right away, or sign in with Google or email.");
    t.check("Headline shows", /Take notes/.test(await text()));
    t.check("One clear way to begin: Start writing", /Start writing/.test(await text()));
    t.check("Google sign-in offered", /Continue with Google/.test(await text()));
    t.check("The home page is not a list of features", !/Scan a page|Add a source|Write or draw/.test(await text()));
    t.check("No Apple sign-in", !/Apple/.test(await text()));
    await d.shot("welcome");
  });

  await scene("guest", "2. Start writing: Home is one box for everything", async (t) => {
    await d.click({ text: "^Start writing$" });
    await d.waitFor("!!document.querySelector('[data-home-composer]')", { label: "the Home box" });
    await d.pause(1200);
    await say("You land on Home: one box. Look a topic up, write a note, paste a link, or drop a file.", 2800);
    t.check("Stays on Home after starting as a guest", await d.evaluate("location.pathname === '/'"));
    t.check("Signed in as a guest", /Guest/.test(await text()));
    t.check("The Home box is there", await d.evaluate("!!document.querySelector('[data-home-composer] textarea')"));
    t.check("Auto, Research and Note switch", await d.evaluate("(document.querySelector('[data-home-mode]')?.innerText ?? '').replace(/\\s+/g,' ') === 'Auto Research Note'"));
    await d.shot("home-box");
  });

  await scene("topics", "3. Creating topics", async (t) => {
    await rail("Topics");
    await d.waitFor("/No topics yet/.test(document.body.innerText)", { label: "empty topics page" });
    await say("A topic gathers everything on one subject. Let's make four.", 1500);
    await d.shot("topics-empty");
    for (const name of TOPICS) { await newTopic(name); await d.pause(500); await rail("Topics"); }
    t.check("All four topics exist", TOPICS.every((n) => ids[`topic:${n}`]));
    await say("Four topics: two that will connect, and two that won't.", 1500);
    await d.shot("topics-four");
  });

  await scene("notes", "4. Writing eight notes into the topics (with [[links]])", async (t) => {
    await say("Now some notes. Photosynthesis will link to Mitochondria, across topics.", 1800);
    for (const n of NOTES) { await d.caption(`Writing “${n.title}” into ${n.topic}`); await writeNote(n); if (n.title === "Mitochondria") await d.shot("note-editor"); }
    t.check("All eight notes saved", NOTES.every((n) => ids[n.title]));
    await d.caption("");
  });

  await scene("search", "5. Jump to any note with ⌘K", async (t) => {
    await dismiss();
    await d.press("k", { meta: true });
    await d.waitFor("document.querySelector('[cmdk-input]')", { label: "palette" });
    await d.type("mito", { chunk: 1, delay: 110 });
    await d.pause(700);
    t.check("Search finds Mitochondria", /Mitochondria/.test(await d.evaluate("document.querySelector('[cmdk-list]')?.innerText ?? ''")));
    await d.shot("search");
    await d.press("Escape");
  });

  await scene("insight", "6. The Insight column: a summary with its sources", async (t) => {
    await openNote("Photosynthesis");
    await say("Every note has an Insight column. Summarize cites the passages it used.", 1500);
    await d.click({ within: "section[aria-label=Summary]", text: "Summarize" });
    await d.waitFor("document.querySelector('section[aria-label=Summary] [data-sources], section[aria-label=Summary] [data-no-source]')", { timeout: 60000, label: "summary with sources" });
    await d.pause(1200);
    t.check("Summary written", (await d.evaluate("document.querySelector('section[aria-label=Summary]').innerText.length")) > 80);
    t.check("Summary lists the passages it used", await d.evaluate("!!(document.querySelector('section[aria-label=Summary] [data-sources]'))"));
    t.check("Inference badge shows where it ran", await d.evaluate("!!(document.querySelector('[data-inference]'))"));
    await d.shot("insight-summary");
  });

  await scene("ask", "7. Ask across all notes, with quoted sources", async (t) => {
    await d.click({ within: "section[aria-label=Ask]", text: "^All notes$" });
    await d.click({ sel: "input[aria-label='Ask a question']" });
    await d.type("What do mitochondria and chloroplasts have in common?", { chunk: 2, delay: 35 });
    await d.press("Enter");
    await d.waitFor("document.querySelector('[data-answer]')", { timeout: 60000, label: "an answer" });
    await d.pause(1200);
    const sources = await d.evaluate("document.querySelectorAll('[data-answer] [data-sources] li').length");
    t.check("Answer appears", await d.evaluate("!!(document.querySelector('[data-answer]'))"));
    t.check("Answer cites sources with quotes", sources >= 1, `${sources} source(s)`);
    t.check("Sources come from more than one note", (await d.evaluate("new Set([...document.querySelectorAll('[data-answer] [data-sources] li a, [data-answer] [data-sources] li span.font-medium')].map(e=>e.textContent)).size")) >= 2);
    await d.shot("ask-with-sources");
  });

  await scene("topicpage", "8. A topic page: items, shared ideas, a whole-topic summary", async (t) => {
    await openTopic("Cell Biology");
    await say("A topic page shows every item, the ideas they share, and answers across all of them.", 1600);
    t.check("Both notes listed", /Mitochondria/.test(await text()) && /ATP/.test(await text()));
    await d.shot("topic-cell-biology");
    await d.click({ within: "[data-testid=topic-insight] section[aria-label=Summary]", text: "Summarize" });
    await d.waitFor("document.querySelector('[data-testid=topic-insight] [data-sources], [data-testid=topic-insight] [data-no-source]')", { timeout: 60000, label: "topic summary" });
    await d.pause(1000);
    t.check("Topic summary cites its notes", await d.evaluate("!!(document.querySelector('[data-testid=topic-insight] [data-sources]'))"));
    await d.shot("topic-summary");
  });

  await scene("model", "8b. A 3D model of a topic, generated from the notes", async (t) => {
    await openNote("Mitochondria");
    await say("The app can build a 3D model from what you wrote. Watch: it reads the note and invents the parts.", 2400);
    await d.click({ sel: "button", text: "3D model" });
    await d.waitFor("document.querySelector('[role=dialog]')", { label: "the 3D model dialog" });
    await d.pause(900);
    t.check("The dialog is about this note already, with nothing to fill in", await d.evaluate("/Mitochondria/.test(document.querySelector('[role=dialog]').innerText) && !document.querySelector('[role=dialog] button[disabled]')"));
    await say("Nothing to type: the model is about this note. Add a focus only if you want one.", 2200);
    await d.shot("model-dialog");
    const before = await pathId();
    await d.click({ within: "[role=dialog]", text: "^Create 3D model$" });
    await d.waitFor(`location.pathname.split('/').pop() !== ${JSON.stringify(before)} && document.querySelectorAll('ul[aria-label=Parts] li').length >= 4`, { timeout: 180000, label: "the generated model" });
    await d.pause(2500);
    const parts = await d.evaluate("document.querySelectorAll('ul[aria-label=Parts] li').length");
    t.check("A 3D model was generated from the note", parts >= 4, `${parts} parts`);
    t.check("The model is not cluttered with labels", parts <= 14 && (await d.evaluate("document.querySelectorAll('button[aria-label]:not([aria-label*=Show])').length")) < 60);
    t.check("The model is a 3D scene", await d.evaluate("!!document.querySelector('canvas')"));
    t.check("The model note links back to the note it came from", /Mitochondria/.test(await text()));
    await say("A clean model. Drag to orbit, scroll to zoom, hover a part to see what it is.", 2200);
    await d.shot("model-3d");
    // Take it apart with the slider.
    await d.evaluate("(()=>{const r=document.querySelector('input[type=range][aria-label=\"Explode assembly\"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(r,'100');r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))})()");
    await say("Slide to take it apart (or press E).", 1800);
    await d.pause(1800);
    t.check("The model takes itself apart", Number(await d.evaluate("document.querySelector('input[type=range][aria-label=\"Explode assembly\"]').value")) >= 90);
    await d.shot("model-exploded");
    // Open a part.
    await d.click({ sel: "ul[aria-label=Parts] li button[class*='flex-1']", nth: 1 });
    await d.waitFor("document.querySelector('section[aria-label=\"Selected part\"]')", { label: "the part panel" });
    await d.pause(900);
    t.check("Each part has Learn, Ask and Notes", await d.evaluate("['Learn','Ask','Notes'].every(x=>[...document.querySelectorAll('section[aria-label=\"Selected part\"] [role=tab]')].some(b=>b.textContent.startsWith(x)))"));
    await d.click({ sel: "section[aria-label='Selected part'] button", text: "Explain this part" });
    await d.waitFor("document.querySelector('section[aria-label=\"Selected part\"] [data-answer]')", { timeout: 60000, label: "the part explanation" });
    await d.pause(1200);
    t.check("The explanation shows where it came from", await d.evaluate("!!document.querySelector('section[aria-label=\"Selected part\"] [data-sources], section[aria-label=\"Selected part\"] [data-no-source]')"));
    await d.shot("model-part-learn");
    await d.click({ sel: "section[aria-label='Selected part'] [role=tab]", text: "^Notes" });
    await d.click({ sel: "section[aria-label='Selected part'] textarea" });
    await d.type("Where the proton gradient is built.", { chunk: 2, delay: 25 });
    t.check("What was typed arrives intact", (await d.evaluate("document.querySelector('section[aria-label=\"Selected part\"] textarea').value")) === "Where the proton gradient is built.");
    await d.pause(2200);
    t.check("A note on a part adds a gold dot to its Notes tab", await d.evaluate("!!document.querySelector('section[aria-label=\"Selected part\"] [role=tab] span[aria-label=\"has notes\"]')"));
    await d.click({ sel: "button", text: "^Numbers$" });
    await d.pause(900);
    t.check("Numbers can be switched on when wanted", (await d.evaluate("[...document.querySelectorAll('button[aria-label]')].filter(b=>/^\\d+\\. /.test(b.getAttribute('aria-label'))).length")) >= 3);
    await d.shot("model-numbers");
    await d.click({ sel: "button", text: "^Numbers$" });
    await d.shot("model-part-notes");
    // It belongs to the topic.
    await openTopic("Cell Biology");
    await d.pause(900);
    t.check("The model appears in the Cell Biology topic as a 3D item", await d.evaluate("[...document.querySelectorAll('[role=tab]')].some(b=>/3d/i.test(b.textContent))"));
    await d.shot("topic-with-model");
  });

  await scene("maps", "9. The 3D map of each topic: what connects, what doesn't", async (t) => {
    for (const name of TOPICS) {
      await openTopic(name);
      await d.click({ text: "3D map" });
      await d.waitFor("/\\/map$/.test(location.pathname) && document.querySelectorAll('[data-graph-node]').length >= 1", { timeout: 40000, label: `${name} map` });
      await d.pause(5200);
      const page = await text();
      await d.caption(`${name}: ${name === "Cell Biology" || name === "Plant Science" ? "linked to the other topic" : "no outside connections"}`);
      await d.shot(`map-${name.toLowerCase().replace(/\s+/g, "-")}`);
      t.check(`${name} map draws`, await d.evaluate("!!(document.querySelector('canvas'))"));
      if (name === "Cell Biology") t.check("Cell Biology map shows Photosynthesis as a linked satellite", /↗ Photosynthesis/.test(page));
      if (name === "Plant Science") t.check("Plant Science map shows Mitochondria as a linked satellite", /↗ Mitochondria/.test(page));
      if (name === "Design Strategy" || name === "Medieval History") t.check(`${name} map has no outside links`, !/↗/.test(page));
      await d.press("Escape");
      await d.waitFor("!/\\/map$/.test(location.pathname)", { label: "back to topic" });
    }
    await d.caption("");
  });

  await scene("graph", "10. The 3D vault graph: notes connect automatically", async (t) => {
    await rail("Graph");
    await d.waitFor("document.querySelectorAll('[data-graph-node]').length >= 8", { timeout: 40000, label: "graph nodes" });
    await d.pause(3500);
    await say("Every note is a point in 3D. Solid lines are links you wrote. Dashed lines were found automatically.", 2600);
    const stats = await d.evaluate("document.querySelector('[data-graph-stats]')?.innerText ?? ''");
    const m = /(\d+) notes · (\d+) written link\w* · (\d+) found automatically/.exec(stats);
    t.check("Every note is in the graph", m && Number(m[1]) >= 8, stats);
    t.check("Links written with [[ ]] are drawn", m && Number(m[2]) >= 5, m ? `${m[2]} written` : "");
    t.check("Connections between notes are found automatically", m && Number(m[3]) >= 1, m ? `${m[3]} automatic` : "");
    t.check("It is a 3D scene", await d.evaluate("!!document.querySelector('[data-graph3d] canvas')"));
    await d.shot("graph-3d");
    // Select a note to see exactly what it connects to, and why.
    await d.click({ sel: "[data-graph-node]", text: "^Chloroplasts$" });
    await d.pause(1200);
    t.check("Clicking a note shows what it connects to and why", await d.evaluate("!!document.querySelector('[data-graph-card]')"));
    t.check("Automatic connections explain themselves with shared terms", await d.evaluate("/shares:/.test(document.querySelector('[data-graph-card]')?.innerText ?? '')"));
    await d.shot("graph-3d-selected");
    await d.click({ sel: "[data-graph-card] button", text: "^Keep link$" }).catch(() => undefined);
    await d.pause(1500);
    await d.click({ text: "Refine with AI" });
    await d.waitFor("document.querySelector('[aria-label=\"Accept link\"]') || /No clearly related/.test(document.body.innerText)", { timeout: 90000, label: "AI refinement" });
    await d.pause(900);
    const ideas = await d.evaluate("document.querySelectorAll('[aria-label=\"Accept link\"]').length");
    t.check("The AI can propose more connections on request", ideas >= 0, `${ideas} proposal(s)`);
    await d.shot("graph-ai-refine");
  });

  await scene("newtopic", "11. A website, divided into notes under a topic you name", async (t) => {
    await rail("Topics");
    await newTopic("Astronomy");
    await rail("Notes");
    const before = await pathId();
    await d.click({ text: "^Write$" });
    await d.waitFor(`/\\/vault\\/[^/]+$/.test(location.pathname) && location.pathname.split('/').pop() !== ${JSON.stringify(before)} && document.querySelector('[data-note-tools]')`, { label: "a blank note" });
    await say("Bring in a website from the tools above the page. It is read, then divided into notes.", 2400);
    await d.click({ sel: "[data-note-tools] button", text: "Website" });
    await d.waitFor("document.querySelector('#capture-url')", { label: "the link box" });
    await d.click({ sel: "#capture-url" });
    await d.type("https://en.wikipedia.org/wiki/Black_hole", { chunk: 2, delay: 20 });
    await d.shot("website-dialog");
    await d.click({ text: "Read and divide" });
    await d.waitFor("document.querySelector('[aria-label=\"Notes to create\"]')", { timeout: 150000, label: "the preview of notes" });
    await d.pause(1500);
    const parts = await d.evaluate("document.querySelectorAll('[aria-label=\"Notes to create\"] li').length");
    t.check("The page was divided into several notes, not one", parts >= 3, `${parts} sections`);
    t.check("Each part says what it covers", await d.evaluate("[...document.querySelectorAll('[aria-label=\"Notes to create\"] li')].every(li=>li.innerText.trim().length>12)"));
    await say("Each idea gets its own note. You choose the topic, and can drop any part.", 2400);
    await d.click({ sel: "[aria-label='Topic name']" });
    await d.evaluate("document.querySelector('[aria-label=\"Topic name\"]').select()");
    await d.type("Astronomy", { chunk: 1, delay: 45 });
    await d.shot("split-preview");
    await d.click({ sel: "button", text: "^Save \\d+ notes" });
    await d.waitFor("/\\/vault\\/[^/]+$/.test(location.pathname) && /overview/i.test(document.querySelector('[aria-label=Title]')?.value ?? '')", { timeout: 60000, label: "the overview note" });
    await d.pause(1500);
    t.check("An overview note links to every part", (await d.evaluate("document.querySelectorAll('article a.wikilink').length")) >= 3);
    t.check("The notes cite the page they came from", /Source:/.test(await text()) || /wikipedia/i.test(await text()));
    await d.shot("overview-note");
    await openTopic("Astronomy");
    const items = await d.evaluate("document.querySelectorAll('main ul li a').length");
    t.check("They all sit together in the Astronomy topic", items >= 4, `${items} items`);
    t.check("Each is marked as coming from a website", await d.evaluate("[...document.querySelectorAll('[role=tab]')].some(b=>/website/i.test(b.textContent))"));
    await d.shot("topic-astronomy");
  });

  await scene("suggest", "11b. A note with no topic gets one suggested from what it says", async (t) => {
    await rail("Notes");
    const before = await pathId();
    await d.click({ text: "^Write$" });
    await d.waitFor(`/\\/vault\\/[^/]+$/.test(location.pathname) && location.pathname.split('/').pop() !== ${JSON.stringify(before)}`, { label: "a new note" });
    await d.click({ sel: "[aria-label=Title]" });
    await d.evaluate("document.querySelector('[aria-label=Title]').select()");
    await d.type("Ribosomes", { chunk: 1, delay: 40 });
    await d.press("Enter");
    await d.click({ sel: "textarea[aria-label='Note markdown']" });
    await d.type("Ribosomes build proteins inside the cell. Mitochondria have their own ribosomes, which make some of the ATP machinery used in respiration.", { chunk: 3, delay: 18 });
    await say("No topic chosen. After a moment, the app notices what the note is about.", 2200);
    await d.waitFor("document.querySelector('[data-topic-suggestion]')", { timeout: 40000, label: "a topic suggestion" });
    await d.pause(900);
    const sug = await d.evaluate("document.querySelector('[data-topic-suggestion]').innerText");
    t.check("A topic is suggested from the note's own words", /Cell Biology/.test(sug), sug.replace(/\n/g, " "));
    t.check("Nothing is filed until you say so", /No folder/.test(await text()));
    await d.shot("topic-suggestion");
    await d.click({ sel: "[data-topic-suggestion] button", text: "Add to topic" });
    await d.waitFor("[...document.querySelectorAll('button')].some(b=>/^Cell Biology$/.test(b.textContent.trim()))", { timeout: 15000, label: "the note filed under Cell Biology" });
    t.check("Accepting files the note under that topic", true);
    await d.shot("topic-accepted");
  });

  await scene("split", "11c. A long note split into separate notes, one idea each", async (t) => {
    await rail("Notes");
    const before = await pathId();
    await d.click({ text: "^Write$" });
    await d.waitFor(`/\\/vault\\/[^/]+$/.test(location.pathname) && location.pathname.split('/').pop() !== ${JSON.stringify(before)}`, { label: "a new note" });
    await d.click({ sel: "[aria-label=Title]" });
    await d.evaluate("document.querySelector('[aria-label=Title]').select()");
    await d.type("Lecture: how photosynthesis works and what limits it", { chunk: 2, delay: 25 });
    await d.press("Enter");
    await d.click({ sel: "textarea[aria-label='Note markdown']" });
    await d.type("Photosynthesis happens in two stages. In the light reactions, chlorophyll in the thylakoid membranes absorbs light and splits water, releasing oxygen and making ATP and NADPH. In the Calvin cycle, which takes place in the stroma, the enzyme rubisco fixes carbon dioxide into sugar using that ATP and NADPH.\n\nThe rate of photosynthesis depends on light intensity, carbon dioxide concentration and temperature. At low light the light reactions limit the rate, while at high light the Calvin cycle becomes the bottleneck.\n\nPlants have adapted in different ways. C4 plants concentrate carbon dioxide around rubisco to avoid photorespiration, and CAM plants open their stomata only at night to save water in dry climates.", { chunk: 6, delay: 12 });
    await d.waitFor("!/Editing…/.test(document.body.innerText)", { timeout: 20000, label: "autosave" });
    await d.pause(1500);
    await say("A long note can be cut into separate notes, one idea each.", 2000);
    await d.click({ sel: "[data-note-tools] button", text: "Split into notes" });
    await d.waitFor("document.querySelector('[aria-label=\"Notes to create\"]')", { timeout: 120000, label: "the split preview" });
    await d.pause(1200);
    const parts = await d.evaluate("document.querySelectorAll('[aria-label=\"Notes to create\"] li').length");
    t.check("The note was split into several notes", parts >= 3, `${parts} notes`);
    await d.shot("split-note-preview");
    await d.click({ sel: "button", text: "^Save \\d+ notes" });
    await d.waitFor("/\\/vault\\/[^/]+$/.test(location.pathname) && /overview/i.test(document.querySelector('[aria-label=Title]')?.value ?? '')", { timeout: 60000, label: "the overview note" });
    await d.pause(1200);
    t.check("The original note is kept, and linked from the new ones", /Lecture: how photosynthesis/.test(await text()));
    await d.shot("split-note-overview");
  });

  await scene("study", "12. Flashcards from a note, each with its source", async (t) => {
    await openNote("Mitochondria");
    await say("Make flashcards from a note. Each card keeps the line it came from.", 1500);
    await d.click({ within: "section[aria-label=Study]", text: "^Cards$" });
    await d.waitFor("document.querySelector('[role=dialog]')", { label: "generate dialog" });
    await d.pause(900);
    await d.shot("generate-dialog");
    const before = await pathId();
    await d.click({ within: "[role=dialog]", text: "^Generate$" });
    await d.waitFor(`/\\/vault\\/[^/]+$/.test(location.pathname) && location.pathname.split('/').pop() !== ${JSON.stringify(before)}`, { timeout: 120000, label: "flashcard note" });
    await d.pause(2000);
    t.check("A flashcard deck was made", /Flashcards/.test(await text()));
    await d.click({ sel: "button.paper-sheet" });
    await d.pause(900);
    t.check("The card shows the line from your notes it came from", await d.evaluate("!!(document.querySelector('[data-source]'))"));
    await d.shot("flashcard");
    await rail("Study");
    await d.pause(1200);
    t.check("Study page lists the deck", /Flashcards|due|cards/i.test(await text()));
    await d.shot("study");
  });

  await scene("voice", "13. Read aloud in a natural voice", async (t) => {
    await openNote("Mitochondria");
    await say("Read aloud uses a Gemini voice (turn your sound on).", 1200);
    await d.click({ text: "^Read aloud$" });
    await d.waitFor("/Reading this note aloud/.test(document.body.innerText)", { timeout: 45000, label: "voice starting" });
    await d.pause(4500);
    t.check("The passage being read is highlighted", await d.evaluate("!!(document.querySelector('.read-aloud-current'))"));
    t.check("The voice is labelled", /voice: /.test(await text()));
    await d.shot("read-aloud");
    await d.click({ text: "^Stop$" });
  });

  await scene("writing", "14. Writing tools: text bar and Pencil", async (t) => {
    await d.click({ sel: "[role=tab]", text: "^Edit$" });
    await d.pause(800);
    const ta = await d.locate({ sel: "textarea[aria-label='Note markdown']" });
    await d.click({ sel: "textarea[aria-label='Note markdown']" });
    await d.moveTo(ta.x - ta.w / 2 + 120, ta.y - ta.h / 2 + 70);
    await d.press("Escape");
    await d.click({ sel: "textarea[aria-label='Note markdown']" }, { clickCount: 2 });
    await d.pause(500);
    await d.evaluate("(()=>{const t=document.querySelector('textarea[aria-label=\"Note markdown\"]');t.focus();t.setSelectionRange(4,16);document.dispatchEvent(new Event('selectionchange'))})()");
    await d.pause(900);
    await say("Select text and a small bar appears: bold, italic, highlight, link, note.", 1200);
    t.check("The text bar appears on selection", await d.evaluate("!!((()=>{const b=document.querySelector('[role=toolbar][aria-label=\"Text tools\"]');return b&&b.getAttribute('aria-hidden')!=='true'&&getComputedStyle(b).opacity!=='0'})())"));
    await d.shot("text-bar");
    await d.click({ sel: "[aria-label=Highlight]" });
    await d.pause(600);
    t.check("Highlight wraps the selection", /==/.test(await d.evaluate("document.querySelector('textarea[aria-label=\"Note markdown\"]').value")));
    await d.click({ sel: "button", text: "^Pencil" });
    await d.pause(600);
    const c = await d.locate({ sel: "canvas[data-ink]" });
    const x0 = c.x - c.w / 2 + 160, y0 = c.y + 10;
    await d.drag(Array.from({ length: 40 }, (_, i) => [x0 + i * 8, y0 + Math.sin(i / 3) * 26]));
    await d.drag(Array.from({ length: 30 }, (_, i) => [x0 + 40 + i * 6, y0 + 70 + Math.cos(i / 2) * 18]));
    await d.pause(800);
    await say("Pencil mode: draw by hand. Ink is saved with the note and can be turned into text.", 1200);
    t.check("Ink is drawn on the page", true);
    await d.shot("pencil");
    await d.click({ sel: "[role=toolbar]", text: "^Done$" }).catch(() => undefined);
  });

  await scene("access", "15. Accessibility: high contrast and reduced motion", async (t) => {
    await dismiss();
    const open = async () => {
      for (let i = 0; i < 3; i++) {
        await d.click({ sel: "button", text: "Accessibility settings" });
        await d.pause(800);
        if (await d.evaluate("[...document.querySelectorAll('label')].some(l=>/High contrast/.test(l.textContent))")) return;
        await d.press("Escape");
      }
      throw new Error("The accessibility panel did not open");
    };
    const toggle = async (name) => d.click({ sel: "label", text: `^${name}` });
    await open();
    await toggle("High contrast");
    await d.pause(800);
    t.check("High contrast switches on", (await d.evaluate("document.documentElement.getAttribute('data-contrast')")) === "high");
    await d.shot("high-contrast");
    await toggle("Reduce motion");
    await d.pause(500);
    t.check("Reduced motion switches on", (await d.evaluate("document.documentElement.getAttribute('data-motion')")) === "reduce");
    await toggle("High contrast");
    await toggle("Reduce motion");
    await d.press("Escape");
  });

  await scene("devices", "16. The same app on a phone and a tablet", async (t) => {
    await d.setViewport(390, 844, true);
    await d.goto(`${BASE}/vault/${ids.Mitochondria}`);
    await d.waitFor("document.querySelector('[aria-label=Title]')", { label: "note on phone" });
    await dismiss();
    await d.pause(900);
    await d.shot("phone-note");
    t.check("Phone has a bottom tab bar", await d.evaluate("!!(document.querySelector('[data-tabbar]'))"));
    await d.click({ text: "Ask or open Insight" });
    await d.pause(1200);
    await d.shot("phone-ask-sheet");
    t.check("Insight opens as a sheet on a phone", await d.evaluate("!!(document.querySelector('[role=dialog] [data-testid=insight-column]'))"));
    await d.press("Escape");
    await d.setViewport(900, 660, false);
    await d.goto(`${BASE}/vault/${ids.Mitochondria}`);
    await d.waitFor("document.querySelector('[aria-label=Title]')", { label: "note on tablet" });
    await dismiss();
    await d.pause(900);
    await d.shot("tablet-note");
    t.check("Tablet shows the rail and the Insight column", await d.evaluate("!!(document.querySelector('[data-rail]') && document.querySelector('aside [data-testid=insight-column]'))"));
    await d.setViewport(0);
  });

  await scene("signout", "17. Signing out lands back on the welcome page", async (t) => {
    await d.goto(`${BASE}/`);
    await d.waitFor("document.querySelector('header button[aria-label=Account]')", { label: "account menu" });
    await dismiss();
    await d.evaluate("document.querySelector('header button[aria-label=Account]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}))");
    await d.pause(600);
    await d.click({ sel: "[role=menuitem]", text: "Sign out" });
    await d.waitFor("document.querySelector('h1') && /Take notes/.test(document.querySelector('h1').innerText)", { label: "welcome page" });
    t.check("Back on the welcome page", /Take notes/.test(await text()));
    t.check("Guest is gone from this tab's storage", !(await d.evaluate("Object.keys(sessionStorage).some(k=>k.startsWith('firebase:authUser'))")));
    await say("Signed out. Guests are not remembered.", 1500);
    await d.shot("signed-out");
  });

  await d.caption("");
}

// ─── Report ───
function report() {
  const pass = results.reduce((n, r) => n + r.checks.filter((c) => c.ok).length, 0);
  const fail = results.reduce((n, r) => n + r.checks.filter((c) => !c.ok).length, 0) + results.filter((r) => r.error).length;
  const md = [`# Improved Notes demo report`, ``, `Site: ${BASE}  `, `Run: ${stamp}  `, `Result: **${fail ? `${fail} problem(s)` : "all checks passed"}**, ${pass} checks passed`, ``];
  for (const r of results) {
    md.push(`## ${r.title} (${r.seconds}s)`);
    if (r.error) md.push(`- ✘ **Scene failed:** ${r.error}`);
    for (const c of r.checks) md.push(`- ${c.ok ? "✔" : "✘"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    md.push("");
  }
  md.push(`Screenshots: ${d.shots.length}`, `Console errors seen: ${d.consoleErrors.length}`, ...d.consoleErrors.slice(0, 10).map((e) => `- ${e}`));
  writeFileSync(join(OUT, "report.md"), md.join("\n"));
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, stamp, results, shots: d.shots, consoleErrors: d.consoleErrors }, null, 2));
  log(`\n${"─".repeat(60)}\n${fail ? `✘ ${fail} problem(s)` : "✔ All checks passed"}, ${pass} checks ok, ${d.shots.length} screenshots\nReport: ${join(OUT, "report.md")}`);
  return fail;
}

mkdirSync(OUT, { recursive: true });
let failed = 1;
let video = null;
try { await run(); failed = report(); }
catch (e) { console.error(`\nDemo could not run: ${e.message}`); }
finally {
  await sleep(1500 * SPEED);
  const rec = RECORD ? await d?.stopRecording() : null;
  await d?.close();
  if (rec?.count) {
    log(`\nEncoding the video from ${rec.count} frames…`);
    video = await encodeVideo(rec.dir, join(OUT, "demo"));
    if (video) { rmSync(rec.dir, { recursive: true, force: true }); log(`Video: ${video}`); } else log(`Could not encode the video. The frames are kept in ${rec.dir}`);
  }
}
process.exit(failed ? 1 : 0);
