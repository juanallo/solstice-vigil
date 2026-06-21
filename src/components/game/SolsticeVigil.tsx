import { useState, useEffect, useRef, useCallback } from "react";
import { ENCOUNTERS, encounterKindLabel, encounterTitle, type EncounterId } from "../../data/encounters";
import { IDENTITIES, identityTitle } from "../../data/identities";
import { useGameAudio } from "../../hooks/useGameAudio";
import {
  buildRareEncounterPrompt,
  dismissDiscovery,
  getRareFallbackScene,
  migrateEncounterFields,
  prepareRareTurn,
  recordEncounterOutcome,
  selectRareEncounter,
  wonderCount,
  type EncounterState,
} from "../../lib/encounters";
import {
  migrateIdentityFields,
  updateIdentity,
  type IdentityState,
  type PendingReveal,
} from "../../lib/identity";
import {
  buildTurnPrompt,
  balanceDescriptor,
  HISTORY_TURNS,
  SYSTEM_PROMPT_CONTINUITY,
  type Archetype,
  type Phase,
  type Tone,
  type TurnRecord,
} from "../../lib/prompt";
import {
  migrateStoryMemory,
  updateStoryMemory,
  type StoryMemory,
} from "../../lib/story-memory";

// SOLSTICE VIGIL — a never-ending solo RPG.
// On-device LLM (Google AI Edge LiteRT-LM, Gemma 4 E2B) renders each scene.
// All game state is JS-owned + localStorage-persisted; the LLM never holds ground truth.
// Demo mode (?demo=1 or the demo button) plays the full loop with hand-written scenes, no AI, no download.

const MODEL_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm?download=true";
const MODEL_MAGIC = "LITERTLM"; // first 8 bytes of every .litertlm file; the engine checks this
const LITERT_CDN = "https://cdn.jsdelivr.net/npm/@litert-lm/core/+esm";
const CACHE_NAME = "solstice-vigil", SAVE_KEY = "solstice-vigil-save";
// 1 choice per phase; 2 choices complete one scored day
const PHASE_LENGTH = 1, EXTREME = 100, START_BALANCE = 0, STAGNATION_LIMIT = 3, ESCALATION = 0.05;

type Status = "title" | "checking" | "loading" | "playing" | "reveal" | "discovery" | "gameover" | "nosupport" | "error";
type GameOverCause = "day" | "night";
interface Action {
  label: string;
  balanceShift: number;
  tone: Tone;
  memory?: { key: string; label: string };
}
interface Scene { archetype: Archetype; narration: string; actions: Action[]; encounterId?: EncounterId; }
interface GameState {
  cycle: number; turn: number; phase: Phase; balance: number;
  lastTone: Tone | null; stagnationStreak: number; lastArchetype: Archetype | null;
  rawTurns: TurnRecord[];
  storyMemory: StoryMemory;
  identity: IdentityState;
  pendingReveal: PendingReveal | null;
  lastRevealCycle: number;
  encounter: EncounterState;
}

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
"",
"NPCs may sense the wanderer's bearing and past names poetically when given IDENTITY context — but never mention meters, tiers, or game systems.",
"Rare encounters are mythic one-offs — specific characters, places, or events. When given a RARE ENCOUNTER, render that wonder faithfully. Never name rarity, odds, or mechanics. Weave the wanderer's history and prior meetings naturally.",
SYSTEM_PROMPT_CONTINUITY,
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
  return {
    cycle: 0, turn: 0, phase: "day", balance: START_BALANCE,
    lastTone: null, stagnationStreak: 0, lastArchetype: null,
    rawTurns: [],
    storyMemory: migrateStoryMemory({}),
    ...migrateIdentityFields({}),
    ...migrateEncounterFields({}),
  };
}
function loadSave(): GameState | null {
  try {
    const r = localStorage.getItem(SAVE_KEY);
    if (!r) return null;
    const raw = JSON.parse(r) as Partial<GameState>;
    if (typeof raw.balance !== "number") return null;
    return {
      cycle: raw.cycle ?? 0,
      turn: raw.turn ?? 0,
      phase: raw.phase ?? "day",
      balance: raw.balance,
      lastTone: raw.lastTone ?? null,
      stagnationStreak: raw.stagnationStreak ?? 0,
      lastArchetype: raw.lastArchetype ?? null,
      rawTurns: (raw.rawTurns ?? []).map((t) => ({
        ...t,
        tone: t.tone ?? (t.balanceShift < 0 ? "yang" : t.balanceShift > 0 ? "yin" : "neutral"),
      })),
      storyMemory: migrateStoryMemory(raw as Partial<GameState>),
      ...migrateIdentityFields(raw),
      ...migrateEncounterFields(raw as Partial<GameState>),
    };
  } catch { return null; }
}
function saveState(s: GameState) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

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
  const { audioEnabled, toggleAudio, unlockAudio } = useGameAudio(status === "title");

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

  const buildRareScene = useCallback((s: GameState, id: EncounterId): Scene => {
    const fb = getRareFallbackScene(id, s.phase, s);
    const actions = fb.actions.map((a) => ({
      label: a.label,
      balanceShift: clampShift("Wanderer", a.balanceShift),
      tone: a.tone,
      memory: a.memory,
    }));
    return {
      archetype: "Wanderer",
      narration: fb.narration,
      actions: actions.slice(0, 3),
      encounterId: id,
    };
  }, []);

  const generateRareScene = useCallback(async (engine: any, s: GameState, id: EncounterId): Promise<Scene> => {
    const userMsg = buildRareEncounterPrompt(s, id);
    const arch: Archetype = "Wanderer";
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
    } catch { /* fall through */ }
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
    if (!scene) return buildRareScene(s, id);
    scene.actions = scene.actions.map((a) => ({ ...a, balanceShift: clampShift(arch, a.balanceShift) })).slice(0, 3);
    if (scene.actions.length < 2) return buildRareScene(s, id);
    scene.encounterId = id;
    return scene;
  }, [buildRareScene]);

  const runTurn = useCallback(async (s: GameState, opts?: { regenerateActive?: boolean }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setGenerating(true);
    setScene(null);
    setStreamHint(pulse(0));
    try {
      let working = s;
      let rare = opts?.regenerateActive && s.encounter.activeEncounterId
        ? { id: s.encounter.activeEncounterId, isFirst: s.encounter.pendingDiscovery?.isFirst ?? !s.encounter.codex[s.encounter.activeEncounterId] }
        : selectRareEncounter(s);

      if (rare && !opts?.regenerateActive) {
        working = prepareRareTurn(s, rare);
        setState(working);
        saveState(working);
      }

      let next: Scene;
      if (rare) {
        if (demoRef.current) {
          await new Promise((r) => setTimeout(r, 450));
          next = buildRareScene(working, rare.id);
        } else {
          const engine = engineRef.current || (await initEngine());
          next = await generateRareScene(engine, working, rare.id);
        }
        setScene(next);
        if (working.encounter.pendingDiscovery) {
          setStatus("discovery");
        }
        return;
      }

      const arch = pickArchetype(working);
      if (demoRef.current) {
        await new Promise((r) => setTimeout(r, 450));
        next = FALLBACK[arch](working.phase);
        next.actions = next.actions.map((a) => ({ ...a, balanceShift: clampShift(arch, a.balanceShift) })).slice(0, 3);
      } else {
        const engine = engineRef.current || (await initEngine());
        next = await generateScene(engine, working, arch);
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
  }, [buildRareScene, generateRareScene, generateScene, initEngine]);
  const resumePlay = useCallback(async (s: GameState) => {
    if (s.pendingReveal) {
      setStatus("reveal");
      return;
    }
    if (s.encounter.pendingDiscovery) {
      setStatus("discovery");
      if (!scene) await runTurn(s, { regenerateActive: true });
      return;
    }
    setStatus("playing");
    await runTurn(s);
  }, [runTurn, scene]);

  const start = useCallback(async (resume: boolean, useDemo = false) => {
    unlockAudio();
    setErrorMsg("");
    const wantDemo = useDemo || demoRef.current;
    let s: GameState;
    if (resume) { const saved = loadSave(); s = saved && typeof saved.balance === "number" ? saved : freshState(); }
    else { clearSave(); s = freshState(); }
    if (wantDemo) {
      demoRef.current = true;
      setDemo(true);
      setState(s);
      await resumePlay(s);
      return;
    }
    if (!webGpuAvailable()) { setStatus("nosupport"); return; }
    setStatus("loading");
    setState(s);
    try { await initEngine(); await resumePlay(s); }
    catch (e: any) { setErrorMsg(e?.message || String(e)); setStatus("error"); }
  }, [initEngine, resumePlay, unlockAudio]);

  const choose = useCallback(async (action: Action) => {
    unlockAudio();
    if (!scene || generating) return;
    const chosen = scene;
    // Subtle escalation: the world grows more extreme over time, so the vigil eventually ends.
    const esc = 1 + ESCALATION * Math.floor(state.turn / 10);
    const newBalance = clamp(state.balance + Math.round(action.balanceShift * esc), -EXTREME, EXTREME);
    const newRaw: TurnRecord = { archetype: chosen.archetype, phase: state.phase, narration: chosen.narration, chosenLabel: action.label, balanceShift: action.balanceShift, tone: action.tone };
    let next: GameState = {
      ...state,
      turn: state.turn + 1,
      balance: newBalance,
      lastArchetype: chosen.archetype,
      rawTurns: [...state.rawTurns, newRaw].slice(-(HISTORY_TURNS + 2)),
      storyMemory: updateStoryMemory(state.storyMemory, {
        cycle: state.cycle,
        turn: state.turn + 1,
        phase: state.phase,
        narration: chosen.narration,
        chosenLabel: action.label,
      }),
    };
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
    next = updateIdentity(next);
    if (state.encounter.activeEncounterId) {
      next = recordEncounterOutcome(next, state.encounter.activeEncounterId, action);
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
    if (next.pendingReveal) {
      setStatus("reveal");
      return;
    }
    await runTurn(next);
  }, [scene, generating, state, runTurn, unlockAudio]);

  const interrupt = useCallback(() => { cancelRef.current = true; }, []);
  const restart = useCallback(() => {
    unlockAudio();
    clearSave(); setHasSave(false); setState(freshState()); setScene(null); setGameOverCause(null); setShareCopied(false); setStatus("title");
  }, [unlockAudio]);

  const shareText = useCallback(async (text: string) => {
    const url = "https://solstice-vigil-jalloron.zocomputer.io";
    try {
      if (navigator.share) { await navigator.share({ title: "Solstice Vigil", text, url }); return; }
    } catch { /* user cancelled or share unavailable — fall through to clipboard */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }
    catch { /* ignore */ }
  }, []);

  const shareVigil = useCallback(async () => {
    const days = state.cycle;
    const daysText = days < 1 ? "less than a day" : `${days} day${days === 1 ? "" : "s"}`;
    const cause = gameOverCause === "day" ? "the Long Day" : "the Hush of Night";
    const id = state.identity.current;
    const wonders = wonderCount(state);
    const wonderSuffix = wonders > 0
      ? ` and witnessed ${wonders} rare wonder${wonders === 1 ? "" : "s"} along the way`
      : "";
    const text = id
      ? `I held the solstice vigil for ${daysText} as the ${identityTitle(id)}${wonderSuffix} before ${cause} claimed me. How long can you hold the wheel?`
      : `I held the solstice vigil for ${daysText}${wonderSuffix} before ${cause} claimed me. How long can you hold the wheel?`;
    await shareText(text);
  }, [state, gameOverCause, shareText]);

  const shareIdentity = useCallback(async () => {
    const reveal = state.pendingReveal;
    if (!reveal) return;
    const title = identityTitle(reveal.id);
    const text = reveal.kind === "become"
      ? `Cycle ${reveal.cycle} — I have become a ${title} in SOLSTICE VIGIL.`
      : `Cycle ${reveal.cycle} — The world now knows me as the ${title} in SOLSTICE VIGIL.`;
    await shareText(text);
  }, [state.pendingReveal, shareText]);

  const shareEncounter = useCallback(async () => {
    const discovery = state.encounter.pendingDiscovery;
    if (!discovery) return;
    const title = encounterTitle(discovery.id);
    const text = discovery.isFirst
      ? `Cycle ${discovery.cycle} — I met ${title} in SOLSTICE VIGIL. A wonder seen by very few wanderers.`
      : `Cycle ${discovery.cycle} — ${title} appeared again in SOLSTICE VIGIL.`;
    await shareText(text);
  }, [state.encounter.pendingDiscovery, shareText]);

  const continueFromReveal = useCallback(async () => {
    unlockAudio();
    const next = { ...state, pendingReveal: null };
    setState(next);
    saveState(next);
    if (next.encounter.pendingDiscovery) {
      setStatus("discovery");
      if (!scene && next.encounter.activeEncounterId) {
        await runTurn(next, { regenerateActive: true });
      }
      return;
    }
    setStatus("playing");
    await runTurn(next);
  }, [state, runTurn, unlockAudio, scene]);

  const continueFromDiscovery = useCallback(async () => {
    unlockAudio();
    const next = dismissDiscovery(state);
    setState(next);
    saveState(next);
    setStatus("playing");
  }, [state, unlockAudio]);
  const bg = worldBg(state.phase, state.balance);
  const meterPct = ((state.balance + EXTREME) / (2 * EXTREME)) * 100;
  const phaseTint = Math.abs(state.balance) / EXTREME;
  const reveal = state.pendingReveal;
  const revealDef = reveal ? IDENTITIES[reveal.id] : null;
  const currentIdentity = state.identity.current ? IDENTITIES[state.identity.current] : null;
  const pastIdentityTitles = state.identity.history
    .filter((r) => r.id !== state.identity.current)
    .slice(-2)
    .map((r) => r.title);
  const discovery = state.encounter.pendingDiscovery;
  const discoveryDef = discovery ? ENCOUNTERS[discovery.id] : null;
  const witnessedWonders = wonderCount(state);
  return (
    <main
      className="sv-root"
      style={{ "--phase-tint": phaseTint } as React.CSSProperties}
    >
      <button
        type="button"
        className={`sv-audio-toggle${audioEnabled ? "" : " sv-audio-toggle--muted"}`}
        onClick={toggleAudio}
        aria-pressed={!audioEnabled}
        aria-label={audioEnabled ? "Turn off music" : "Turn on music"}
        data-testid="audio-toggle"
        data-muted={!audioEnabled}
      >
        <span className="sv-audio-toggle__icon" aria-hidden="true">♪</span>
      </button>
      <div className={`sv-container${status === "title" || status === "loading" || status === "nosupport" || status === "error" || status === "gameover" || status === "reveal" || status === "discovery" ? " sv-container--narrow" : ""}`}>
        {status === "title" && (
          <div className="sv-screen-center">
            <div className="sv-panel sv-panel--landing">
              <img
                src="/solstice-vigil-bg.webp"
                alt=""
                className="sv-panel-hero"
                draggable={false}
              />
              <div className="sv-panel-body">
                <div className="sv-divider" aria-hidden="true">
                  <img src="/logo.png" alt="" className="sv-logo" draggable={false} />
                </div>
                <h1 className="sv-title">SOLSTICE VIGIL</h1>
                <p className="sv-subtitle">hold the balance · the longest day, the endless turn</p>
                <p className="sv-body" style={{ marginTop: "1.5rem", maxWidth: "28rem", marginLeft: "auto", marginRight: "auto" }}>
                  The world has frozen at the June solstice. You are a lone wanderer trying to keep the wheel of day and night in balance. Stray too far into the Long Day or sink too deep into the Hush of Night, and the vigil ends. How many days can you hold the balance?
                </p>
                <p className="sv-note" style={{ marginTop: "1.25rem", maxWidth: "22rem", marginLeft: "auto", marginRight: "auto" }}>
                  Narrated entirely on your device by Gemma 4 via Google AI Edge LiteRT-LM (WebGPU). Works best in Chrome 113+ on a machine with a GPU.
                </p>
                <div className="sv-actions">
                  <button type="button" onClick={() => start(false)} className="sv-button-primary">
                    <span aria-hidden="true">☀</span>
                    Begin the vigil
                  </button>
                  {hasSave && (
                    <button type="button" onClick={() => start(true)} className="sv-button-secondary">
                      <span aria-hidden="true">☾</span>
                      Continue the vigil
                    </button>
                  )}
                  <button type="button" onClick={() => start(false, true)} className="sv-link-button">
                    Try demo mode (no AI, no download)
                  </button>
                </div>
                <p className="sv-footer-note">Your progress is saved locally on this device.</p>
              </div>
            </div>
          </div>
        )}
        {status === "loading" && (
          <div className="sv-screen-center">
            <div className="sv-panel">
              <div className="sv-loading-sigil" aria-hidden="true">☾</div>
              <div className="sv-progress">
                <div
                  className="sv-progress__bar"
                  style={{ width: `${loadPct >= 1 ? 100 : Math.max(8, loadPct * 100)}%` }}
                />
              </div>
              <p className="sv-body">{loadMsg || "Preparing the vigil…"}</p>
              {loadPct < 1 && (
                <p className="sv-note" style={{ marginTop: "0.75rem" }}>
                  First load fetches the on-device model (~2 GB, cached after).{" "}
                  <button type="button" onClick={() => start(false, true)} className="sv-link-button">
                    skip to demo mode
                  </button>
                </p>
              )}
            </div>
          </div>
        )}
        {status === "nosupport" && (
          <div className="sv-screen-center">
            <div className="sv-panel">
              <div className="sv-loading-sigil" aria-hidden="true">🜂</div>
              <h2 className="sv-heading">This vigil needs WebGPU for live narration</h2>
              <p className="sv-body" style={{ marginTop: "1rem", maxWidth: "24rem", marginLeft: "auto", marginRight: "auto" }}>
                SOLSTICE VIGIL runs its narrator entirely on your device via WebGPU. For live AI narration, open it in Chrome 113+ on a machine with a GPU. You can still play in demo mode below — same game, hand-written scenes.
              </p>
              <div className="sv-actions sv-actions--row">
                <button type="button" onClick={() => start(false, true)} className="sv-button-primary">
                  Play in demo mode
                </button>
                <button type="button" onClick={restart} className="sv-button-secondary">
                  Back
                </button>
              </div>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="sv-screen-center">
            <div className="sv-panel">
              <div className="sv-loading-sigil" aria-hidden="true">⚠</div>
              <h2 className="sv-heading">The vigil stumbled</h2>
              <p className="sv-body sv-note" style={{ marginTop: "1rem", maxWidth: "24rem", marginLeft: "auto", marginRight: "auto", wordBreak: "break-word" }}>
                {errorMsg}
              </p>
              <div className="sv-actions sv-actions--row">
                <button type="button" onClick={() => start(false)} className="sv-button-primary">
                  Begin again
                </button>
                <button type="button" onClick={() => start(false, true)} className="sv-button-secondary">
                  Demo mode
                </button>
                <button type="button" onClick={restart} className="sv-button-secondary">
                  Back
                </button>
              </div>
            </div>
          </div>
        )}
        {status === "gameover" && (
          <div className="sv-screen-center" data-testid="gameover-screen">
            <div className="sv-panel">
              <img src="/logo.png" alt="" className="sv-logo sv-logo--sigil" draggable={false} aria-hidden="true" />
              <h2 className="sv-heading">the vigil ends</h2>
              <p className="sv-body" style={{ marginTop: "1rem", maxWidth: "28rem", marginLeft: "auto", marginRight: "auto" }}>
                {gameOverCause === "day"
                  ? "The Long Day claims you. The sun will not set, and you wander into the endless light until you are no more. The wheel has stopped."
                  : "The Hush takes you. The night deepens without end, and you sink into the cold until you are no more. The wheel has stopped."}
              </p>
              <p className="sv-body" style={{ marginTop: "1.5rem" }}>
                You held the vigil for{" "}
                <strong>{state.cycle < 1 ? "less than a day" : `${state.cycle} day${state.cycle === 1 ? "" : "s"}`}</strong>.
              </p>
              {currentIdentity ? (
                <div className="sv-gameover-identity" data-testid="gameover-identity">
                  <img
                    src={currentIdentity.image}
                    alt=""
                    className="sv-gameover-identity__image"
                    draggable={false}
                  />
                  <p className="sv-gameover-identity__title">
                    The world knew you as the {currentIdentity.title}.
                  </p>
                  {pastIdentityTitles.length > 0 && (
                    <p className="sv-gameover-identity__past">
                      Once also: {pastIdentityTitles.join(", ")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="sv-note sv-gameover-identity-none" data-testid="gameover-identity-none" style={{ marginTop: "1.25rem" }}>
                  You had not yet taken a name.
                </p>
              )}
              <div className="sv-actions sv-actions--row">
                <button type="button" onClick={shareVigil} className="sv-button-primary">
                  {shareCopied ? "Copied!" : "Share your vigil"}
                </button>
                <button type="button" onClick={() => start(false)} className="sv-button-secondary">
                  Begin again
                </button>
              </div>
            </div>
          </div>
        )}
        {status === "reveal" && reveal && revealDef && (
          <div className="sv-screen-center" data-testid="identity-reveal-screen">
            <div className="sv-panel sv-panel--identity">
              <img
                src={revealDef.image}
                alt=""
                className="sv-panel-hero sv-identity-hero"
                draggable={false}
              />
              <div className="sv-panel-body">
                <p className="sv-identity-cycle" data-testid="identity-reveal-cycle">Cycle {reveal.cycle}</p>
                <h2 className="sv-identity-title" data-testid="identity-reveal-title">
                  {reveal.kind === "become"
                    ? <>You have become a {revealDef.title}.</>
                    : <>The world now knows you as the {revealDef.title}.</>}
                </h2>
                <div className="sv-actions sv-actions--row">
                  <button type="button" onClick={shareIdentity} className="sv-button-primary">
                    {shareCopied ? "Copied!" : "Share this moment"}
                  </button>
                  <button type="button" onClick={continueFromReveal} className="sv-button-secondary" data-testid="identity-continue">
                    Continue the vigil
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {status === "discovery" && discovery && discoveryDef && (
          <div className="sv-screen-center" data-testid="encounter-discovery-screen">
            <div className="sv-panel sv-panel--encounter">
              <img
                src={discoveryDef.image}
                alt=""
                className="sv-panel-hero sv-encounter-hero"
                draggable={false}
              />
              <div className="sv-panel-body">
                <p className="sv-encounter-cycle" data-testid="encounter-discovery-cycle">Cycle {discovery.cycle}</p>
                <h2 className="sv-encounter-title" data-testid="encounter-discovery-title">
                  {discovery.isFirst
                    ? <>First encounter with {discoveryDef.title}.</>
                    : <>{discoveryDef.title} appears again.</>}
                </h2>
                <p className="sv-encounter-subtitle" data-testid="encounter-discovery-subtitle">
                  {discovery.isFirst ? encounterKindLabel(discoveryDef.kind) : "The wheel remembers."}
                </p>
                <div className="sv-actions sv-actions--row">
                  <button type="button" onClick={shareEncounter} className="sv-button-primary" data-testid="encounter-share">
                    {shareCopied ? "Copied!" : "Share this moment"}
                  </button>
                  <button type="button" onClick={continueFromDiscovery} className="sv-button-secondary" data-testid="encounter-continue">
                    Continue the vigil
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {status === "playing" && (
          <div className={`game-shell game-shell--${state.phase}`} style={{ "--w1": bg.c1, "--w2": bg.c2, "--w3": bg.c3 } as React.CSSProperties}>
            <div className="sv-hud">
              <div className="sv-hud__left">
                <span className="sv-meta" data-testid="day-count">Day {state.cycle + 1}</span>
                {witnessedWonders > 0 && (
                  <span className="sv-wonders-count" data-testid="wonders-count">
                    {witnessedWonders} wonder{witnessedWonders === 1 ? "" : "s"} witnessed
                  </span>
                )}
              </div>
              <span className="sv-hud__phase" data-testid="phase-label">
                {state.phase === "day" ? "☀ Long Day" : "☾ Hush of Night"}
              </span>
              {currentIdentity ? (
                <div
                  className={`sv-hud__right sv-identity-badge sv-identity-badge--${currentIdentity.alignment}`}
                  data-testid="identity-badge"
                >
                  <img src={currentIdentity.image} alt="" className="sv-identity-portrait" draggable={false} />
                  <span className="sv-identity-badge__title" data-testid="identity-label">{currentIdentity.title}</span>
                </div>
              ) : (
                <span aria-hidden="true">&nbsp;</span>
              )}
            </div>
            <div className="sv-balance-labels">
              <span className="sv-meta">Day</span>
              <span className="sv-meta">Balance</span>
              <span className="sv-meta">Night</span>
            </div>
            <div className="sv-balance-track" data-testid="balance-track">
              <div
                data-testid="balance-marker"
                className="sv-balance-marker"
                style={{ left: `${meterPct}%` }}
                aria-hidden="true"
              >
                {state.phase === "day" ? "☀" : "☾"}
              </div>
            </div>
            <div className="sv-status-row">
              <span className="sv-hint" data-testid="balance-descriptor">{balanceDescriptor(state.balance)}</span>
              <div className="sv-status-actions">
                {demo && <span className="sv-demo-badge" data-testid="demo-badge">demo</span>}
                {Math.abs(state.balance) > 70 && (
                  <span className={`sv-warning${state.balance > 0 ? " sv-warning--night" : ""}`} data-testid="balance-warning">
                    {state.balance < 0 ? "the light burns too bright…" : "the Hush presses too deep…"}
                  </span>
                )}
                {state.stagnationStreak >= 2 && (
                  <span className="sv-warning" data-testid="stagnation-warning">the solstice grows restless…</span>
                )}
                <button type="button" onClick={restart} className="sv-link-button">restart</button>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {generating && !scene && (
                <div className="sv-screen-center">
                  <p className="sv-hint">{streamHint || "the world holds its breath…"}</p>
                  <button type="button" onClick={interrupt} className="sv-link-button" style={{ marginTop: "1rem" }}>
                    interrupt
                  </button>
                </div>
              )}
              {scene && (
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div className="sv-narrative-card">
                    <p data-testid="narration" className="sv-narrative">{scene.narration}</p>
                  </div>
                  <div data-testid="choices" className="sv-choices" role="group" aria-label="Scene choices">
                    {scene.actions.map((a, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => choose(a)}
                        disabled={generating}
                        className="sv-choice-button"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {generating && scene && (
                <p className="sv-hint" style={{ marginTop: "1rem", textAlign: "center" }}>
                  {streamHint || "the wheel turns…"}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
