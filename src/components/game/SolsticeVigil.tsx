import { useState, useEffect, useRef, useCallback } from "react";

// SOLSTICE VIGIL — a never-ending solo RPG.
// On-device LLM (Google AI Edge LiteRT-LM, Gemma 4 E2B) renders each scene.
// All game state is JS-owned + localStorage-persisted; the LLM never holds ground truth.
// Demo mode (?demo=1 or the demo button) plays the full loop with hand-written scenes, no AI, no download.

const MODEL_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm?download=true";
const MODEL_MAGIC = "LITERTLM"; // first 8 bytes of every .litertlm file; the engine checks this
const LITERT_CDN = "https://cdn.jsdelivr.net/npm/@litert-lm/core/+esm";
const CACHE_NAME = "solstice-vigil", SAVE_KEY = "solstice-vigil-save";
const PHASE_LENGTH = 5, EXTREME = 100, START_BALANCE = 0, STAGNATION_LIMIT = 3, HISTORY_TURNS = 6, ESCALATION = 0.05;

type Phase = "day" | "night";
type Archetype = "Threshold" | "Wanderer" | "Omen" | "Temptation" | "Lurch";
type Status = "title" | "checking" | "loading" | "playing" | "gameover" | "nosupport" | "error";
type Tone = "yang" | "yin" | "neutral";
type GameOverCause = "day" | "night";
interface Action { label: string; balanceShift: number; tone: Tone; }
interface Scene { archetype: Archetype; narration: string; actions: Action[]; }
interface TurnRecord { archetype: Archetype; phase: Phase; narration: string; chosenLabel: string; balanceShift: number; }
interface GameState { cycle: number; turn: number; phase: Phase; balance: number; lastTone: Tone | null; stagnationStreak: number; lastArchetype: Archetype | null; history: string[]; rawTurns: TurnRecord[]; }

const ARCHETYPES: Archetype[] = ["Threshold", "Wanderer", "Omen", "Temptation"];
const SHIFT_BOUNDS: Record<string, number> = { Threshold: 45, Temptation: 30, Wanderer: 35, Omen: 10, Lurch: 45 };

const SYSTEM_PROMPT = [
"You are the narrator of SOLSTICE VIGIL, a solo survival roleplaying game.",
"The world is frozen at the June solstice — the longest day — and a lone wanderer tries to keep the wheel of day and night in balance.",
"The wanderer must hold the balance; stray too far into the Long Day or the Hush of Night and the vigil ends. Tone: mythic, terse, old-school, second person ('You...').",
"Never mention game mechanics, meters, numbers, balance, turns, or archetypes by name.",
"Use solstice imagery: the Long Day, the Hush of Night, thresholds, the vigil, the Quick, aspects.",
"",
"You will be given the current state and an ARCHETYPE to render.",
"Write a single scene (2-4 sentences) of that archetype, then exactly 3 action choices.",
"Each action is a short verb phrase the wanderer might take.",
"",
"OUTPUT STRICTLY VALID JSON — nothing else, no markdown fences, no commentary:",
'{"narration":"<2-4 sentences>","actions":[{"label":"<short verb phrase>","balanceShift":<integer>,"tone":"yang|yin|neutral"},{"label":"...","balanceShift":<int>,"tone":"..."},{"label":"...","balanceShift":<int>,"tone":"..."}]}',
"",
"balanceShift rules (the engine clamps these, but propose sensibly):",
"yang tone pushes toward eternal DAY (use a NEGATIVE number); yin tone pushes toward eternal NIGHT (POSITIVE); neutral is small or zero.",
"Threshold: one bold yang (-30 to -45), one bold yin (+30 to +45), one neutral.",
"Temptation: biased to the CURRENT phase — if day, mostly yang; if night, mostly yin. Shifts ±15 to ±30.",
"Wanderer: a trade — one option with a notable cost (±20 to ±35) and two smaller options.",
"Omen: small shifts (-10 to +10) that foreshadow the coming phase.",
"Lurch: a forced crisis — actions that each shove hard (±30 to ±45), breaking the stagnation.",
"",
"Never invent or change state. Never narrate the wanderer's death or write 'Game over' — the engine decides endings. Keep each scene an open moment of choice.",
].join("\n");

const FALLBACK: Record<Archetype, (p: Phase) => Scene> = {
  Threshold: (p) => p === "day"
    ? { archetype: "Threshold", narration: "A bridge of frozen light spans a chasm where the sun has stopped sinking. A gatekeeper stands at its center, wreathed in halted flame, neither welcoming nor forbidding. \"Cross, or turn back,\" it says, and means both. The heat of noon presses against your back.", actions: [
        { label: "Stride boldly into the unsetting light", balanceShift: -38, tone: "yang" },
        { label: "Step aside into the waiting cool", balanceShift: 38, tone: "yin" },
        { label: "Stand a while at the threshold", balanceShift: 0, tone: "neutral" } ] }
    : { archetype: "Threshold", narration: "A threshold of black ice marks where the Hush begins. Two roads fork beneath a moon that has stopped climbing. A veiled figure offers no counsel, only the choice. Beyond the ice, something waits.", actions: [
        { label: "Press on across the black ice", balanceShift: -38, tone: "yang" },
        { label: "Descend into the deep Hush", balanceShift: 38, tone: "yin" },
        { label: "Linger at the frozen fork", balanceShift: 0, tone: "neutral" } ] },
  Wanderer: (p) => p === "day"
    ? { archetype: "Wanderer", narration: "A traveler sits beneath a tree that casts no moving shadow. \"The road east is quick,\" she says, \"but it takes more than it gives. The road west is slow, and asks little.\" She holds out a waterskin in the endless noon.", actions: [
        { label: "Take the quick east road, pay the price", balanceShift: -34, tone: "yang" },
        { label: "Follow the slow west road", balanceShift: 12, tone: "yin" },
        { label: "Share her water and rest", balanceShift: 6, tone: "neutral" } ] }
    : { archetype: "Wanderer", narration: "A pale wanderer beckons from a doorway lit by a single steady candle. \"Come in,\" she says. \"Warmth costs a little of your night. Or stay in the cold, and keep it all.\" The Hush presses at the windows.", actions: [
        { label: "Enter, surrender some of the night", balanceShift: -32, tone: "yang" },
        { label: "Stay out in the deep cold", balanceShift: 30, tone: "yin" },
        { label: "Bargain at the threshold", balanceShift: 8, tone: "neutral" } ] },
  Omen: (p) => p === "day"
    ? { archetype: "Omen", narration: "A child points at a sundial whose shadow has not moved in a long time. \"When the shadow stirs, the Hush comes,\" she says. The air tastes faintly of frost, though the sun still hangs at noon.", actions: [
        { label: "Lean into the coming cool", balanceShift: 8, tone: "yin" },
        { label: "Will the sun to hold", balanceShift: -8, tone: "yang" },
        { label: "Mark the omen and move on", balanceShift: 0, tone: "neutral" } ] }
    : { archetype: "Omen", narration: "In a frozen fountain, a reflection shows a sky that is not yet here — bright, gold, climbing. \"The Long Day returns,\" the water whispers. The Hush around you feels thin in places, as though dawn presses at its edges.", actions: [
        { label: "Welcome the foreseen dawn", balanceShift: -8, tone: "yang" },
        { label: "Deepen the present Hush", balanceShift: 8, tone: "yin" },
        { label: "Watch the reflection a moment", balanceShift: 0, tone: "neutral" } ] },
  Temptation: (p) => p === "day"
    ? { archetype: "Temptation", narration: "A brazier burns without fuel in the middle of the road, throwing heat that wants nothing but more heat. Voices in the flame promise swift power if you feed it. The noon is glad, and would be gladder still. It is so easy to burn.", actions: [
        { label: "Feed the brazier, embrace the blaze", balanceShift: -28, tone: "yang" },
        { label: "Stoke it further", balanceShift: -22, tone: "yang" },
        { label: "Walk past the fire", balanceShift: 10, tone: "yin" } ] }
    : { archetype: "Temptation", narration: "A pool of perfect stillness reflects a moon bright enough to read by. Something in the water invites you to sink into the quiet, to let the Hush take everything sharp and bright. The cold is a kindness, it whispers.", actions: [
        { label: "Sink into the still water", balanceShift: 28, tone: "yin" },
        { label: "Let the Hush deepen around you", balanceShift: 22, tone: "yin" },
        { label: "Turn from the pool", balanceShift: -10, tone: "yang" } ] },
  Lurch: (p) => p === "day"
    ? { archetype: "Lurch", narration: "The stuck sun SHUDDERS. Stagnation has angered the solstice, and the world lurches against your stillness — a cold wind tears out of the east, the first shadow in an age crawls across the ground. The vigil demands motion. The Hush comes crashing in.", actions: [
        { label: "Let the lurch carry you into night", balanceShift: 42, tone: "yin" },
        { label: "Spread your arms to the sudden cold", balanceShift: 36, tone: "yin" },
        { label: "Claw back toward the failing light", balanceShift: -30, tone: "yang" } ] }
    : { archetype: "Lurch", narration: "The frozen night CRACKS. You have been too still, and the solstice will not permit it — a shaft of impossible gold splits the black sky, the Hush shrieks and breaks. Dawn comes early, furious, uninvited. The wheel will turn whether you will it or not.", actions: [
        { label: "Let the lurch carry you into day", balanceShift: -42, tone: "yang" },
        { label: "Open your eyes to the sudden gold", balanceShift: -36, tone: "yang" },
        { label: "Pull the broken night around you", balanceShift: 30, tone: "yin" } ] },
};

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function clampShift(arch: string, v: number) { return clamp(Math.round(v), -SHIFT_BOUNDS[arch], SHIFT_BOUNDS[arch]); }
function freshState(): GameState {
  return { cycle: 0, turn: 0, phase: "day", balance: START_BALANCE, lastTone: null, stagnationStreak: 0, lastArchetype: null, history: [], rawTurns: [] };
}
function loadSave(): GameState | null {
  try { const r = localStorage.getItem(SAVE_KEY); return r ? (JSON.parse(r) as GameState) : null; } catch { return null; }
}
function saveState(s: GameState) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

function balanceDescriptor(b: number) {
  if (b <= -60) return "deep in the Long Day, the sun glutted and still";
  if (b <= -20) return "leaning toward the Long Day";
  if (b < 20) return "near balance, the wheel almost turning";
  if (b < 60) return "leaning toward the Hush of Night";
  return "deep in the Hush, the night endless";
}
function buildTurnPrompt(s: GameState, arch: Archetype) {
  const recent = s.rawTurns.slice(-HISTORY_TURNS)
    .map((t) => `(${t.phase}) ${t.narration.slice(0, 80)} -> chose: "${t.chosenLabel}" (${t.balanceShift > 0 ? "+" : ""}${t.balanceShift})`)
    .join("\n");
  return [
    `STATE — Day ${s.cycle + 1}. Phase: ${s.phase === "day" ? "DAY (the Long Day)" : "NIGHT (the Hush of Night)"}.`,
    `The world ${balanceDescriptor(s.balance)} (balance ${s.balance}).`,
    `Days survived so far: ${s.cycle}.`,
    recent ? `RECENT TURNS —\n${recent}` : "RECENT TURNS — (the vigil has just begun)",
    `TASK — Render a ${arch} encounter for the current ${s.phase.toUpperCase()} phase.`,
    `Output the JSON object now.`,
  ].join("\n");
}
function pickArchetype(s: GameState): Archetype {
  if (s.stagnationStreak >= STAGNATION_LIMIT) return "Lurch";
  const pool: Archetype[] = ARCHETYPES.filter((a) => a !== s.lastArchetype);
  const weights = pool.map((a) => {
    if (a === "Temptation") return s.phase === "day" ? 3 : (s.balance > 20 ? 2 : 1.4);
    if (a === "Omen") return s.phase === "night" ? 2.2 : 1.4;
    if (a === "Threshold") return Math.abs(s.balance) > 40 ? 2.4 : 1.6;
    if (a === "Wanderer") return 1.6;
    return 1;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[0];
}
function extractJson(raw: string): string | null {
  let t = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}
function parseScene(raw: string, arch: Archetype): Scene | null {
  const json = extractJson(raw);
  if (!json) return null;
  let obj: any;
  try { obj = JSON.parse(json); } catch { return null; }
  if (!obj || typeof obj.narration !== "string") return null;
  const actions: Action[] = (Array.isArray(obj.actions) ? obj.actions : [])
    .filter((a: any) => a && typeof a.label === "string")
    .slice(0, 3)
    .map((a: any) => ({ label: String(a.label).slice(0, 80), balanceShift: typeof a.balanceShift === "number" ? a.balanceShift : 0, tone: (["yang", "yin", "neutral"].includes(a.tone) ? a.tone : "neutral") as Tone }));
  if (actions.length < 2) return null;
  return { archetype: arch, narration: String(obj.narration).slice(0, 800), actions };
}
function hexToRgb(h: string) { const n = h.replace("#", ""); return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]; }
function lerp(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }
function mix(c1: string, c2: string, t: number) { const [r1, g1, b1] = hexToRgb(c1); const [r2, g2, b2] = hexToRgb(c2); return `rgb(${lerp(r1, r2, t)}, ${lerp(g1, g2, t)}, ${lerp(b1, b2, t)})`; }
const PAL: Record<string, string[]> = { dayBal: ["#fcd34d", "#fb923c", "#fde68a"], dayExt: ["#fef9c3", "#fef08a", "#ffffff"], nightBal: ["#1e1b4b", "#312e81", "#0f172a"], nightExt: ["#000000", "#020617", "#000000"] };
function worldBg(phase: Phase, balance: number) {
  const i = Math.abs(balance) / EXTREME;
  const pal = phase === "day" ? PAL.dayBal : PAL.nightBal;
  const ext = phase === "day" ? PAL.dayExt : PAL.nightExt;
  return { c1: mix(pal[0], ext[0], i), c2: mix(pal[1], ext[1], i), c3: mix(pal[2], ext[2], i) };
}
const PULSE = ["the world holds its breath…", "the wheel begins to turn…", "a threshold forms…", "the solstice stirs…", "the Quick remembers…"];
function pulse(n: number) { return PULSE[Math.floor(n / 6) % PULSE.length]; }
function webGpuAvailable() {
  try {
    if (new URLSearchParams(window.location.search).get("nowebgpu") === "1") return false;
  } catch { /* ignore */ }
  return "gpu" in navigator;
}

// Validate a fetched/cached model blob by its 8-byte magic number ("LITERTLM").
// Catches the real-world failure: an interrupted download or an HTML error page
// (e.g. "<!DOCTYPE html...") getting cached or passed to the engine, which then
// throws "Invalid magic number. Expected 'LITERTLM', got '<!DOCTYP'".
async function isValidModelBlob(blob: Blob): Promise<boolean> {
  if (blob.size < 8) return false;
  const buf = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  for (let i = 0; i < MODEL_MAGIC.length; i++) if (buf[i] !== MODEL_MAGIC.charCodeAt(i)) return false;
  return true;
}

export default function SolsticeVigil() {
  const [status, setStatus] = useState<Status>("title");
  const [state, setState] = useState<GameState>(freshState);
  const [scene, setScene] = useState<Scene | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [loadMsg, setLoadMsg] = useState("");
  const [streamHint, setStreamHint] = useState("");
  const [hasSave, setHasSave] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [demo, setDemo] = useState(false);
  const [gameOverCause, setGameOverCause] = useState<GameOverCause | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const engineRef = useRef<any>(null);
  const cancelRef = useRef(false);
  const busyRef = useRef(false);
  const demoRef = useRef(false);

  useEffect(() => {
    setHasSave(!!loadSave());
    try { if (new URLSearchParams(window.location.search).get("demo") === "1") demoRef.current = true; } catch { /* ignore */ }
  }, []);

  const fetchModel = useCallback(async (onProgress: (p: number, mb: number) => void) => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(MODEL_URL);
    if (cached) {
      const blob = await cached.blob();
      if (await isValidModelBlob(blob)) { onProgress(1, blob.size / 1e6); return blob; }
      // Cached entry is corrupt (an interrupted download or an HTML error page). Evict and re-fetch.
      try { await cache.delete(MODEL_URL); } catch { /* ignore */ }
    }
    const res = await fetch(MODEL_URL, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`Model download failed (HTTP ${res.status}). Check your connection and retry — or play in demo mode.`);
    const total = Number(res.headers.get("Content-Length") || 0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; if (value) { chunks.push(value); received += value.length; onProgress(total ? received / total : 0, received / 1e6); } }
    const blob = new Blob(chunks as BlobPart[]);
    if (!(await isValidModelBlob(blob))) {
      throw new Error("The model download returned an error page instead of the model file (the bytes did not start with the LITERTLM magic). This usually means the download was interrupted or the network blocked it. Retry, or play in demo mode — no download needed.");
    }
    try { await cache.put(MODEL_URL, new Response(blob)); } catch { /* ignore */ }
    return blob;
  }, []);

  const initEngine = useCallback(async () => {
    if (engineRef.current) return engineRef.current;
    const mod: any = await import(/* @vite-ignore */ LITERT_CDN);
    const Engine = mod.Engine || mod.default?.Engine;
    if (!Engine) throw new Error("LiteRT-LM Engine not found in module");
    setLoadMsg("Summoning the on-device model…");
    const blob = await fetchModel((p, mb) => { setLoadPct(p); setLoadMsg(p >= 1 ? `Warming the model… (${mb.toFixed(0)} MB cached)` : `Fetching the model… ${mb.toFixed(0)} MB`); });
    setLoadMsg("Warming the engine (WebGPU)…");
    const engine = await Engine.create({ model: blob.stream(), mainExecutorSettings: { maxNumTokens: 8192 } });
    engineRef.current = engine;
    return engine;
  }, [fetchModel]);
  const generateScene = useCallback(async (engine: any, s: GameState, arch: Archetype): Promise<Scene> => {
    const userMsg = buildTurnPrompt(s, arch);
    const makeConvo = (extra: string) => engine.createConversation({ preface: { messages: [{ role: "system", content: SYSTEM_PROMPT + (extra ? "\n\n" + extra : "") }] } });
    let raw = "";
    try {
      const convo = await makeConvo("");
      const stream = convo.sendMessageStreaming(userMsg);
      let ticks = 0;
      for await (const chunk of stream) {
        if (cancelRef.current) { try { convo.cancel(); } catch { /* ignore */ } break; }
        for (const item of chunk.content || []) if (item.type === "text" || item.text) raw += item.text;
        ticks++; if (ticks % 6 === 0) setStreamHint(pulse(ticks));
      }
    } catch { /* fall through to retry/fallback */ }
    setStreamHint("");
    let scene = parseScene(raw, arch);
    if (!scene) {
      let raw2 = "";
      try {
        const convo2 = await makeConvo("IMPORTANT: reply with ONLY the JSON object. No prose. No code fences. No explanation.");
        const stream2 = convo2.sendMessageStreaming(userMsg + "\n\nReply with ONLY the JSON object now.");
        for await (const chunk of stream2) { if (cancelRef.current) { try { convo2.cancel(); } catch { /* ignore */ } break; } for (const item of chunk.content || []) if (item.type === "text" || item.text) raw2 += item.text; }
      } catch { /* ignore */ }
      scene = parseScene(raw2, arch);
    }
    if (!scene) scene = FALLBACK[arch](s.phase);
    scene.actions = scene.actions.map((a) => ({ ...a, balanceShift: clampShift(arch, a.balanceShift) })).slice(0, 3);
    if (scene.actions.length < 2) scene = FALLBACK[arch](s.phase);
    scene.archetype = arch;
    return scene;
  }, []);

  const runTurn = useCallback(async (s: GameState) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setGenerating(true);
    setScene(null);
    setStreamHint(pulse(0));
    try {
      const arch = pickArchetype(s);
      let next: Scene;
      if (demoRef.current) {
        await new Promise((r) => setTimeout(r, 450));
        next = FALLBACK[arch](s.phase);
        next.actions = next.actions.map((a) => ({ ...a, balanceShift: clampShift(arch, a.balanceShift) })).slice(0, 3);
      } else {
        const engine = engineRef.current || (await initEngine());
        next = await generateScene(engine, s, arch);
      }
      next.archetype = arch;
      setScene(next);
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
      setStatus("error");
    } finally {
      busyRef.current = false;
      setGenerating(false);
      setStreamHint("");
    }
  }, [generateScene, initEngine]);
  const start = useCallback(async (resume: boolean, useDemo = false) => {
    setErrorMsg("");
    const wantDemo = useDemo || demoRef.current;
    let s: GameState;
    if (resume) { const saved = loadSave(); s = saved && typeof saved.balance === "number" ? saved : freshState(); }
    else { clearSave(); s = freshState(); }
    if (wantDemo) {
      demoRef.current = true;
      setDemo(true);
      setState(s);
      setStatus("playing");
      await runTurn(s);
      return;
    }
    if (!webGpuAvailable()) { setStatus("nosupport"); return; }
    setStatus("loading");
    setState(s);
    try { await initEngine(); setStatus("playing"); await runTurn(s); }
    catch (e: any) { setErrorMsg(e?.message || String(e)); setStatus("error"); }
  }, [initEngine, runTurn]);

  const choose = useCallback(async (action: Action) => {
    if (!scene || generating) return;
    const chosen = scene;
    // Subtle escalation: the world grows more extreme each day, so the vigil eventually ends.
    const esc = 1 + ESCALATION * state.cycle;
    const newBalance = clamp(state.balance + Math.round(action.balanceShift * esc), -EXTREME, EXTREME);
    const newRaw: TurnRecord = { archetype: chosen.archetype, phase: state.phase, narration: chosen.narration, chosenLabel: action.label, balanceShift: action.balanceShift };
    let next: GameState = { ...state, turn: state.turn + 1, balance: newBalance, lastArchetype: chosen.archetype, rawTurns: [...state.rawTurns, newRaw].slice(-(HISTORY_TURNS + 2)), history: [...state.history, `${state.phase}: ${action.label}`].slice(-12) };
    if (chosen.archetype === "Lurch") next.stagnationStreak = 0;
    else if (action.tone === "neutral") next.stagnationStreak = Math.max(0, state.stagnationStreak - 1);
    else if (action.tone === state.lastTone) next.stagnationStreak = state.stagnationStreak + 1;
    else next.stagnationStreak = 1;
    next.lastTone = action.tone;
    if (next.turn % PHASE_LENGTH === 0) {
      const flippingTo = next.phase === "day" ? "night" : "day";
      if (flippingTo === "day") { next.cycle = next.cycle + 1; }
      next.phase = flippingTo;
    }
    const lost = Math.abs(next.balance) >= EXTREME;
    setState(next);
    saveState(next);
    setHasSave(true);
    if (lost) {
      setGameOverCause(next.balance <= -EXTREME ? "day" : "night");
      clearSave();
      setHasSave(false);
      setStatus("gameover");
      return;
    }
    await runTurn(next);
  }, [scene, generating, state, runTurn]);

  const interrupt = useCallback(() => { cancelRef.current = true; }, []);
  const restart = useCallback(() => { clearSave(); setHasSave(false); setState(freshState()); setScene(null); setGameOverCause(null); setShareCopied(false); setStatus("title"); }, []);
  const shareVigil = useCallback(async () => {
    const days = state.cycle;
    const daysText = days < 1 ? "less than a day" : `${days} day${days === 1 ? "" : "s"}`;
    const cause = gameOverCause === "day" ? "the Long Day" : "the Hush of Night";
    const text = `I held the solstice vigil for ${daysText} before ${cause} claimed me. How long can you hold the wheel?`;
    const url = "https://solstice-vigil-jalloron.zocomputer.io";
    try {
      if (navigator.share) { await navigator.share({ title: "Solstice Vigil", text, url }); return; }
    } catch { /* user cancelled or share unavailable — fall through to clipboard */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }
    catch { /* ignore */ }
  }, [state.cycle, gameOverCause]);
  const bg = worldBg(state.phase, state.balance);
  const meterPct = ((state.balance + EXTREME) / (2 * EXTREME)) * 100;
  return (
    <main
      style={{ "--w1": bg.c1, "--w2": bg.c2, "--w3": bg.c3, background: `linear-gradient(180deg, var(--w1), var(--w2) 55%, var(--w3))`, color: state.phase === "day" ? "#1c1917" : "#f5f1e8", transition: "background 900ms ease, color 900ms ease" } as React.CSSProperties}
      className="min-h-screen w-full font-sans relative overflow-hidden"
    >
      <div className="relative z-10 max-w-2xl mx-auto px-5 py-8 min-h-screen flex flex-col">
        {status === "title" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-7xl mb-4 select-none">{state.phase === "day" ? "☀" : "☾"}</div>
            <h1 className="text-5xl font-bold tracking-tight">SOLSTICE VIGIL</h1>
            <p className="mt-3 opacity-80 italic">hold the balance · the longest day, the endless turn</p>
            <p className="mt-6 max-w-md text-sm leading-relaxed opacity-85">
              The world has frozen at the June solstice. You are a lone wanderer trying to keep the wheel of day and night in balance. Stray too far into the Long Day or sink too deep into the Hush of Night, and the vigil ends. How many days can you hold the balance?
            </p>
            <p className="mt-5 text-xs opacity-60 max-w-sm">Narrated entirely on your device by Gemma 4 via Google AI Edge LiteRT-LM (WebGPU). Works best in Chrome 113+ on a machine with a GPU.</p>
            <div className="mt-8 flex flex-col gap-3 w-64">
              <button onClick={() => start(false)} className="px-5 py-3 rounded-lg font-semibold text-white shadow-lg" style={{ background: "linear-gradient(90deg,#b45309,#1e3a8a)" }}>Begin the vigil</button>
              {hasSave && <button onClick={() => start(true)} className="px-5 py-3 rounded-lg font-semibold border-2" style={{ borderColor: "currentColor" }}>Continue the vigil</button>}
              <button onClick={() => start(false, true)} className="mt-1 text-xs underline opacity-60 hover:opacity-100">Try demo mode (no AI, no download)</button>
            </div>
          </div>
        )}
        {(status === "loading") && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-6xl mb-6 animate-pulse select-none">☾</div>
            <div className="w-72 h-2 rounded-full bg-black/20 overflow-hidden mb-4">
              <div className="h-full transition-all duration-300" style={{ width: `${loadPct >= 1 ? 100 : Math.max(8, loadPct * 100)}%`, background: "linear-gradient(90deg,#fcd34d,#6366f1)" }} />
            </div>
            <p className="text-sm opacity-80">{loadMsg || "Preparing the vigil…"}</p>
            {loadPct < 1 && <p className="text-xs opacity-50 mt-2">First load fetches the on-device model (~2 GB, cached after). <button onClick={() => start(false, true)} className="underline">skip to demo mode</button></p>}
          </div>
        )}
        {status === "nosupport" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-5xl mb-4">🜂</div>
            <h2 className="text-2xl font-bold">This vigil needs WebGPU for live narration</h2>
            <p className="mt-3 max-w-sm opacity-80 text-sm">SOLSTICE VIGIL runs its narrator entirely on your device via WebGPU. For live AI narration, open it in Chrome 113+ on a machine with a GPU. You can still play in demo mode below — same game, hand-written scenes.</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => start(false, true)} className="px-4 py-2 rounded-lg font-semibold text-white" style={{ background: "linear-gradient(90deg,#b45309,#1e3a8a)" }}>Play in demo mode</button>
              <button onClick={restart} className="px-4 py-2 rounded-lg border-2" style={{ borderColor: "currentColor" }}>Back</button>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-5xl mb-4">⚠</div>
            <h2 className="text-2xl font-bold">The vigil stumbled</h2>
            <p className="mt-3 max-w-sm opacity-80 text-sm break-words">{errorMsg}</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => start(false)} className="px-4 py-2 rounded-lg font-semibold text-white" style={{ background: "linear-gradient(90deg,#b45309,#1e3a8a)" }}>Begin again</button>
              <button onClick={() => start(false, true)} className="px-4 py-2 rounded-lg border-2" style={{ borderColor: "currentColor" }}>Demo mode</button>
              <button onClick={restart} className="px-4 py-2 rounded-lg border-2" style={{ borderColor: "currentColor" }}>Back</button>
            </div>
          </div>
        )}
        {status === "gameover" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center" data-testid="gameover-screen">
            <div className="text-7xl mb-6 select-none animate-pulse">{gameOverCause === "day" ? "☀" : "☾"}</div>
            <h2 className="text-3xl font-bold mb-4">the vigil ends</h2>
            <p className="max-w-md leading-relaxed opacity-90">{gameOverCause === "day"
              ? "The Long Day claims you. The sun will not set, and you wander into the endless light until you are no more. The wheel has stopped."
              : "The Hush takes you. The night deepens without end, and you sink into the cold until you are no more. The wheel has stopped."}</p>
            <p className="mt-6 text-lg">You held the vigil for <span className="font-bold">{state.cycle < 1 ? "less than a day" : `${state.cycle} day${state.cycle === 1 ? "" : "s"}`}</span>.</p>
            <div className="flex gap-3 mt-8">
              <button onClick={shareVigil} className="px-5 py-3 rounded-lg font-semibold text-white shadow-lg" style={{ background: "linear-gradient(90deg,#b45309,#1e3a8a)" }}>{shareCopied ? "Copied!" : "Share your vigil"}</button>
              <button onClick={() => start(false)} className="px-5 py-3 rounded-lg font-semibold border-2" style={{ borderColor: "currentColor" }}>Begin again</button>
            </div>
          </div>
        )}
        {status === "playing" && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between text-xs uppercase tracking-widest opacity-80 mb-3">
              <span data-testid="day-count">Day {state.cycle + 1}</span>
              <span className="font-bold" data-testid="phase-label">{state.phase === "day" ? "☀ Long Day" : "☾ Hush of Night"}</span>
              <span>&nbsp;</span>
            </div>
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider opacity-70">
              <span>Day</span><span>Balance</span><span>Night</span>
            </div>
            <div className="relative h-3 rounded-full mb-1 overflow-hidden" style={{ background: "linear-gradient(90deg,#fcd34d,#f8fafc 50%,#312e81)" }} data-testid="balance-track">
              <div data-testid="balance-marker" className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full shadow-md flex items-center justify-center text-xs" style={{ left: `${meterPct}%`, background: state.phase === "day" ? "#fb923c" : "#1e1b4b", color: state.phase === "day" ? "#fff" : "#fde68a", transition: "left 700ms ease, background 700ms ease" }}>
                {state.phase === "day" ? "☀" : "☾"}
              </div>
            </div>
            <div className="flex justify-between items-center mb-5">
              <span className="text-[10px] opacity-50 italic" data-testid="balance-descriptor">{balanceDescriptor(state.balance)}</span>
              <div className="flex gap-3 items-center">
                {demo && <span className="text-[10px] opacity-70 border border-current/30 rounded px-1.5" data-testid="demo-badge">demo</span>}
                {Math.abs(state.balance) > 70 && <span className="text-[10px] animate-pulse opacity-90" data-testid="balance-warning">{state.balance < 0 ? "the light burns too bright…" : "the Hush presses too deep…"}</span>}
                {state.stagnationStreak >= 2 && <span className="text-[10px] animate-pulse opacity-80" data-testid="stagnation-warning">the solstice grows restless…</span>}
                <button onClick={restart} className="text-[10px] underline opacity-50 hover:opacity-100">restart</button>
              </div>
            </div>
            <div className="flex-1 flex flex-col">
              {generating && !scene && (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-70">
                  <p className="italic">{streamHint || "the world holds its breath…"}</p>
                  <button onClick={interrupt} className="mt-4 text-[10px] underline opacity-60 hover:opacity-100">interrupt</button>
                </div>
              )}
              {scene && (
                <div className="flex flex-col flex-1">
                  <p data-testid="narration" className="text-lg leading-relaxed mb-7" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>{scene.narration}</p>
                  <div data-testid="choices" className="flex flex-col gap-3 mt-auto" role="group" aria-label="Scene choices">
                    {scene.actions.map((a, i) => (
                      <button key={i} onClick={() => choose(a)} disabled={generating} className="text-left px-4 py-3 rounded-lg border-2 hover:scale-[1.01] active:scale-100 transition disabled:opacity-40" style={{ borderColor: "currentColor", background: "rgba(0,0,0,0.12)" }}>
                        <span className="text-sm">{a.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {generating && scene && <p className="mt-4 text-center text-xs italic opacity-50">{streamHint || "the wheel turns…"}</p>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
