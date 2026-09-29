'use strict';

const KEY = 'fitworden.v1';
const AKEY = 'fitworden.active';
const DAY = 86400000;
const LEN = { kort: 'Kort', normaal: 'Normaal', lang: 'Lang' };
const RATINGS = [
  { v: 1, t: 'Te licht', s: 'Kon makkelijk meer' },
  { v: 2, t: 'Goed te doen', s: 'Uitdagend maar oké' },
  { v: 3, t: 'Pittig', s: 'Net gehaald' },
  { v: 4, t: 'Te zwaar', s: 'Moest inhouden' }
];
const LIB = [
  ['Conditie', ['mars', 'stepjack', 'boksen', 'uppercut', 'dbpunch', 'zwemslag', 'skater', 'kniecross', 'twist', 'frontkick', 'hakbil', 'hieltik', 'voorteentik', 'knieheffen', 'squatreach', 'squatboks', 'shuffle', 'grapevine', 'zijtik', 'trede', 'voetjes']],
  ['Benen & billen', ['squat', 'stoelsquat', 'pulssquat', 'sumo', 'zijlunge', 'lunge', 'splitsquat', 'curtsy', 'stepup', 'bridge', 'singlebridge', 'bilbrugmars', 'rdl', 'kickback', 'kuit', 'kuit1', 'zijbeen', 'zijstap', 'clam', 'wallsit']],
  ['Armen, schouders & rug', ['curl', 'hammer', 'concurl', 'press', 'arnold', 'lateral', 'frontraise', 'halo', 'reversefly', 'triceps', 'tricepsligg', 'trikickback', 'pullover', 'floorpress', 'borstfly', 'wallangel', 'handdoekrek']],
  ['Buik & romp', ['deadbug', 'liggendmars', 'crunch', 'reversecrunch', 'fietsen', 'tenentik', 'heeltaps', 'zijcrunch', 'staandevogel', 'zijbuig', 'houthakker', 'plankknie', 'zijplank']],
  ['Warming-up & afkoelen', ['armcirkel', 'heupcirkel', 'beenzwaai', 'uitlopen', 'str_quad', 'str_ham', 'str_kuit', 'str_bil', 'str_schouder', 'adem']]
];
const TIMED_START = { A1: 1, C1: 0, B2: 0 };
const WEIGHT_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
const WORDS = ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes'];

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));

let state = load();
let active = loadActive();
let ui = { tab: 'home', progTab: 'overview', foodTab: 'log', foodCat: 'Alles', foodDate: null, exSel: null, pv: null, edit: null };
let audioCtx = null, wakeLock = null, tickTimer = null, lastBeep = '', deferredInstall = null;

function defaultState() {
  return {
    v: 2, created: new Date().toISOString(),
    settings: { name: '', theme: 'auto', weights: [1, 2, 3], impact: false, plan: 'mix', weekGoal: 2, sound: true, vibrate: true, onboarded: false },
    profile: { kg: null, cm: null, age: null, sex: 'v', act: 1.375, goal: 0 },
    prog: { timed: {}, ex: {}, run: { lvl: 0, ok: 0 } },
    sessions: [], weights: [], sugg: [], favs: [], rot: 0, lastBackup: null,
    swaps: {}, deload: { active: false, start: null }, deloadSnooze: null, cycleStart: null, food: {}
  };
}
function isObjM(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function migrate(s) {
  s = s || {};
  const d = defaultState();
  const out = Object.assign(d, s);
  out.settings = Object.assign(defaultState().settings, s.settings || {});
  out.profile = Object.assign(defaultState().profile, s.profile || {});
  out.prog = Object.assign({ timed: {}, ex: {}, run: { lvl: 0, ok: 0 } }, s.prog || {});
  ['sessions', 'weights', 'sugg', 'favs'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
  ['swaps', 'food'].forEach(k => { if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {}; });
  if (!out.deload || typeof out.deload !== 'object') out.deload = { active: false, start: null };
  Object.keys(out.swaps).forEach(k => { if (!EX[k] || !EX[out.swaps[k]]) delete out.swaps[k]; });
  if (!isObjM(out.prog.ex)) out.prog.ex = {};
  if (!isObjM(out.prog.timed)) out.prog.timed = {};
  if (!isObjM(out.prog.run)) out.prog.run = { lvl: 0, ok: 0 };
  Object.keys(out.prog.ex).forEach(k => { if (!EX[k] || !isObjM(out.prog.ex[k])) delete out.prog.ex[k]; });
  out.prog.run.lvl = clamp(+out.prog.run.lvl || 0, 0, RUN_LEVELS.length - 1);
  Object.keys(out.prog.timed).forEach(k => { const t = out.prog.timed[k]; if (!isObjM(t)) delete out.prog.timed[k]; else t.lvl = clamp(+t.lvl || 0, 0, ladderFor(k).length - 1); });
  out.sugg = out.sugg.filter(x => isObjM(x) && x.id && (x.t !== 'ex' || EX[x.key]));
  if (!out.cycleStart) {
    const first = out.sessions.find(x => x.wid !== 'free');
    out.cycleStart = first ? first.date : null;
  }
  out.v = 2;
  return out;
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); return migrate(JSON.parse(raw)); }
  catch (e) {
    try { if (raw) localStorage.setItem(KEY + '.herstel', raw); } catch (x) {}
    return defaultState();
  }
}
function saveLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Opslaan mislukt: opslag vol?'); }
}
function save() { saveLocal(); cloudTouch(); }
function convertActive(a) {
  a.blocks = a.blocks.map(b => {
    if (b.type === 'flow') return { type: 'check', title: b.title, items: b.phases.filter(p => p.k === 'work').map(p => ({ ex: p.ex, sec: p.sec, done: !!b.done })), done: !!b.done, started: true };
    if (b.type === 'sets') { b.trans = b.trans || 90; b.items.forEach(it => { it.orig = it.orig || it.id; it.rest = it.rest || b.rest || 60; }); }
    if (b.type === 'timed') {
      if (!b.orig) b.orig = b.ex.slice();
      b.phases.forEach(p => { if (p.slot == null) { const i = b.ex.indexOf(p.ex); p.slot = i < 0 ? 0 : i; } });
    }
    return b;
  });
  delete a.restEnd; delete a.hold;
  a.timer = null;
  return a;
}
function loadActive() {
  try {
    const a = JSON.parse(localStorage.getItem(AKEY));
    if (!a || !a.blocks) return null;
    convertActive(a);
    if (a.running) {
      const left = a.tEnd - Date.now();
      const ph = curPhase(a);
      a.tLeft = left > 0 ? left : (ph ? ph.sec * 1000 : 0);
      a.running = false;
    }
    return a;
  } catch (e) { return null; }
}
function saveActive() {
  try { active ? localStorage.setItem(AKEY, JSON.stringify(active)) : localStorage.removeItem(AKEY); } catch (e) {}
}

function pad(n) { return String(n).padStart(2, '0'); }
function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + pad(sec % 60); }
function fmtMin(sec) { const m = Math.round(sec / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' u ' + pad(m % 60); }
function fmtRunSec(sec) { return sec % 60 === 0 ? (sec / 60) + ' min' : fmtTime(sec); }
function fmtSecShort(sec) { return sec >= 90 && sec % 30 === 0 ? num(sec / 60) + ' min' : sec + ' s'; }
function dateKey(d = new Date()) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function startOfWeek(d = new Date()) { d = new Date(d); d.setHours(0, 0, 0, 0); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d; }
function fmtDate(iso, opt) { return new Date(iso).toLocaleDateString('nl-NL', opt || { weekday: 'short', day: 'numeric', month: 'short' }); }
function num(v) { return String(v).replace('.', ','); }
function word(n) { return WORDS[n] || String(n); }
function parseNum(v) { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; }

function exName(id) { const e = EX[id]; return state.settings.impact && e.jump ? e.jump : e.name; }
function videoUrl(id) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(EX[id].q); }
function avail() { return [...state.settings.weights].sort((a, b) => a - b); }
function resolve(id) { const s = state.swaps[id]; return s && EX[s] ? s : id; }
function realSessions() { return state.sessions.filter(s => !s.deload); }

function getTimed(key) {
  if (!state.prog.timed[key]) state.prog.timed[key] = { lvl: TIMED_START[key] || 0, ok: 0 };
  return state.prog.timed[key];
}
function ladderFor(key) {
  for (const w of Object.values(WORKOUTS)) for (const b of w.blocks) if (b.key === key) return LADDERS[b.ladder];
  return LADDERS.circuit;
}
function getEx(id) {
  if (!state.prog.ex[id]) {
    const d = EX_DEFAULTS[id] || { reps: 10, sec: 20, sets: 2, min: 10, max: 15 };
    const e = EX[id];
    state.prog.ex[id] = { sets: d.sets || 2, ok: 0, w: e.db ? (avail()[0] || 0) : 0 };
    if (e.kind === 'time') state.prog.ex[id].sec = d.sec || 20; else state.prog.ex[id].reps = d.reps || 10;
  }
  return state.prog.ex[id];
}
function fmtEx(id, p) {
  const e = EX[id];
  const v = e.kind === 'time' ? p.sec + ' sec' : p.reps + '×';
  return p.sets + ' sets · ' + v + (e.side ? ' per kant' : '') + (p.w ? ' · ' + num(p.w) + ' kg' : '');
}
function fmtLadder(l) { return l.work + 's werk / ' + l.rest + 's rust × ' + l.rounds + ' rondes'; }
function fmtRun(l) { return l.walk ? fmtRunSec(l.run) + ' lopen / ' + fmtRunSec(l.walk) + ' wandelen × ' + l.reps : fmtRunSec(l.run) + ' aaneengesloten lopen'; }

function rotation() { return state.settings.plan === 'thuis' ? ['A', 'B', 'C'] : ['A', 'L', 'B', 'L', 'C', 'L']; }
function nextWid() { const r = rotation(); return r[state.rot % r.length]; }

function adjRounds(r, len) { return len === 'kort' ? Math.max(1, r - 1) : len === 'lang' ? r + 1 : r; }
function adjSets(s, len) { return len === 'kort' ? Math.max(1, s - 1) : len === 'lang' ? Math.min(4, s + 1) : s; }
function includeBlock(b, len) { return !(b.optional && len === 'kort'); }

function itemPlan(orig, len, rest, dl, forced) {
  const id = forced || resolve(orig); const p = getEx(id); const e = EX[id]; const d = EX_DEFAULTS[id] || {};
  let S = adjSets(p.sets, len);
  let target = e.kind === 'time' ? p.sec : p.reps;
  let w = p.w || 0;
  if (dl) {
    S = Math.min(2, S);
    const lighter = w ? avail().filter(x => x < w && x >= w * 0.75).pop() : null;
    if (lighter) w = lighter;
    else target = e.kind === 'time' ? Math.max(10, Math.floor(target * 0.85 / 5) * 5) : Math.max(4, Math.round(target * 0.85));
  }
  return { id, orig, kind: e.kind, target, w, planned: S, rest: d.rest || rest };
}

function resolveSlots(orig) {
  const res = orig.map(resolve);
  res.forEach((r, i) => { if (r !== orig[i] && res.some((x, j) => j !== i && x === r)) res[i] = orig[i]; });
  return res;
}

function planBlocks(wid, len) {
  const dl = state.deload.active;
  return WORKOUTS[wid].blocks.filter(b => includeBlock(b, len)).map(b => {
    if (b.type === 'check') return { type: 'check', title: b.title, items: b.items.map(([ex, sec]) => ({ ex, sec })) };
    if (b.type === 'timed') {
      const p = getTimed(b.key); const lad = ladderFor(b.key);
      const lvl = dl ? Math.max(0, p.lvl - 2) : p.lvl; const l = lad[lvl];
      let R = adjRounds(l.rounds, len); if (dl) R = Math.min(R, 2);
      return { type: 'timed', title: b.title, key: b.key, lvl, work: l.work, rest: l.rest, rounds: R, roundRest: b.roundRest, orig: b.ex.slice(), ex: resolveSlots(b.ex) };
    }
    if (b.type === 'sets') { const ids = resolveSlots(b.ex); return { type: 'sets', title: b.title, rest: b.rest, trans: b.trans || 90, items: b.ex.map((o, i) => itemPlan(o, len, b.rest, dl, ids[i])) }; }
    if (b.type === 'run') {
      const lvl = dl ? Math.max(0, state.prog.run.lvl - 1) : state.prog.run.lvl;
      return Object.assign({ type: 'run', lvl }, RUN_LEVELS[lvl]);
    }
    return null;
  }).filter(Boolean);
}

function estimate(wid, len) {
  let t = 0;
  for (const b of planBlocks(wid, len)) {
    if (b.type === 'check') t += b.items.reduce((s, i) => s + i.sec + 5, 0);
    if (b.type === 'timed') t += b.rounds * b.ex.length * (b.work + b.rest) - b.rounds * b.rest + (b.rounds - 1) * b.roundRest + 10;
    if (b.type === 'sets') b.items.forEach((it, i) => {
      const w = (it.kind === 'time' ? it.target : it.target * 3.5) * (EX[it.id].side ? 2 : 1);
      t += it.planned * w + (it.planned - 1) * it.rest + (i < b.items.length - 1 ? b.trans : 0);
    });
    if (b.type === 'run') t += 600 + b.reps * b.run + (b.reps - 1) * b.walk;
  }
  return t;
}

function timedPhases(b) {
  const phases = [{ k: 'prep', sec: 10, ex: b.ex[0], slot: 0 }];
  for (let r = 1; r <= b.rounds; r++) {
    b.ex.forEach((id, i) => {
      phases.push({ k: 'work', sec: b.work, ex: id, slot: i, r, last: i === b.ex.length - 1, side: !!EX[id].side });
      if (i < b.ex.length - 1) phases.push({ k: 'rest', sec: b.rest, ex: b.ex[i + 1], slot: i + 1, r });
    });
    if (r < b.rounds) phases.push({ k: 'rest', sec: b.roundRest, ex: b.ex[0], slot: 0, r, label: 'Rondepauze' });
  }
  return phases;
}
function setItemRuntime(it) {
  return Object.assign(it, { sets: Array.from({ length: it.planned }, () => ({ v: it.target, done: false })) });
}

function buildSession(wid, len) {
  const blocks = planBlocks(wid, len).map(b => {
    if (b.type === 'check') return { type: 'check', title: b.title, items: b.items.map(i => ({ ex: i.ex, sec: i.sec, done: false })), done: false, started: true };
    if (b.type === 'timed') return Object.assign(b, { phases: timedPhases(b), pi: 0, doneRounds: Array(b.rounds).fill(false), started: false, done: false });
    if (b.type === 'sets') return Object.assign(b, { items: b.items.map(setItemRuntime), done: false, started: true });
    if (b.type === 'run') {
      const phases = [{ k: 'prep', sec: 5 }, { k: 'walk', sec: 300, label: 'Inwandelen' }];
      for (let i = 1; i <= b.reps; i++) {
        phases.push({ k: 'run', sec: b.run, n: i });
        if (i < b.reps && b.walk) phases.push({ k: 'walk', sec: b.walk, n: i });
      }
      phases.push({ k: 'walk', sec: 300, label: 'Uitwandelen', cool: true });
      return Object.assign(b, { title: 'Wandel-hardloop', phases, pi: 0, doneRuns: 0, runSec: 0, started: false, done: false });
    }
    return b;
  });
  return { wid, len, deload: !!state.deload.active, started: Date.now(), bi: 0, blocks, running: false, tEnd: 0, tLeft: null, timer: null, finishing: false };
}

function curBlock(a = active) { return a && a.blocks[a.bi]; }
function curPhase(a = active) { const b = curBlock(a); return b && b.phases ? b.phases[b.pi] : null; }

function ensureAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.onstatechange = () => { if (audioCtx.state === 'running' && active) syncPlan(true); };
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}
function beep(freq = 880, dur = 0.12, vol = 0.25) {
  if (!state.settings.sound || !audioCtx) return;
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
const audioPlan = { sig: '', nodes: [], keep: null };
function planTone(at, freq, dur, vol = 0.25) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.start(at); o.stop(at + dur + 0.02);
  audioPlan.nodes.push({ o, at });
}
function clearPlan() {
  const now = audioCtx ? audioCtx.currentTime : 0;
  audioPlan.nodes.forEach(n => { if (n.at > now + 0.02) { try { n.o.stop(0); n.o.disconnect(); } catch (e) {} } });
  audioPlan.nodes = []; audioPlan.sig = '';
  if (audioPlan.keep) { try { audioPlan.keep.stop(); audioPlan.keep.disconnect(); } catch (e) {} audioPlan.keep = null; }
}
function syncPlan(force) {
  const a = active; const b = a && curBlock();
  const on = !!(a && !a.finishing && b && b.phases && b.started && !b.done && a.running && audioCtx && audioCtx.state !== 'closed' && state.settings.sound && !$('#runner').hidden);
  if (!on) { if (audioPlan.sig || audioPlan.keep) clearPlan(); return; }
  let end = a.tEnd; for (let i = b.pi + 1; i < b.phases.length; i++) end += b.phases[i].sec * 1000;
  const sig = a.bi + ':' + Math.round(end / 250);
  if (!force && sig === audioPlan.sig) return;
  clearPlan(); audioPlan.sig = sig;
  try {
    const base = audioCtx.currentTime, now = Date.now();
    let t = (a.tEnd - now) / 1000;
    for (let i = b.pi; i < b.phases.length; i++) {
      const p = b.phases[i]; const st = t - p.sec;
      if (p.side && p.k === 'work') { const h = st + p.sec / 2; if (h > 0.05) { planTone(base + h, 990, 0.08); planTone(base + h + 0.16, 990, 0.08); } }
      [3, 2, 1].forEach(c => { const at = t - c; if (at > 0.05 && at > st + 0.5) planTone(base + at, 660, 0.09); });
      const nx = b.phases[i + 1];
      if (t > 0.02) { if (nx) planTone(base + t, nx.k === 'work' || nx.k === 'run' ? 1046 : 740, 0.28); else { planTone(base + t, 523, 0.18); planTone(base + t + 0.2, 784, 0.35); } }
      if (nx) t += nx.sec;
    }
    const k = audioCtx.createOscillator(), g = audioCtx.createGain();
    k.frequency.value = 30; g.gain.value = 0.001; k.connect(g); g.connect(audioCtx.destination); k.start(); audioPlan.keep = k;
  } catch (e) { audioPlan.sig = ''; }
}
function buzz(p) { if (state.settings.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }
async function lockScreen() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}
function unlockScreen() { try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null; }

function toast(msg, ms = 2600, undo) {
  const t = $('#toast');
  ui.undo = undo || null;
  if (undo) { t.innerHTML = '<span>' + esc(msg) + '</span><button class="undo" data-action="undo">Ongedaan maken</button>'; ms = Math.max(ms, 6000); }
  else t.textContent = msg;
  t.hidden = false; t.classList.toggle('has-undo', !!undo);
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; ui.undo = null; }, ms);
}
function openSheet(html, keepScroll) {
  const m = $('#modal');
  const top = keepScroll && $('.sheet', m) ? $('.sheet', m).scrollTop : 0;
  m.innerHTML = '<div class="sheet' + (keepScroll ? ' noanim' : '') + '" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
  m.hidden = false;
  if (keepScroll) $('.sheet', m).scrollTop = top;
}
function closeSheet() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; ui.edit = null; if (ui.needRender) { ui.needRender = false; render(); } }
function confirmSheet(title, text, okLabel, onOk, danger) {
  confirmSheet.cb = onOk;
  openSheet('<h2>' + esc(title) + '</h2><p class="muted">' + esc(text) + '</p><div class="actions"><button class="btn block ' + (danger ? 'danger' : 'primary') + '" data-action="confirmOk">' + esc(okLabel) + '</button><button class="btn block ghost" data-action="closeSheet">Annuleren</button></div>');
}

function sessionsThisWeek() { const s = startOfWeek().getTime(); return state.sessions.filter(x => new Date(x.date).getTime() >= s); }
function needsBackup() {
  if (cloudOn()) return false;
  if (!state.sessions.length && !state.weights.length && !Object.keys(state.food).length) return false;
  return !state.lastBackup || Date.now() - new Date(state.lastBackup).getTime() > 7 * DAY;
}
function daysSince(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)); }

function cycleSessions() {
  const start = state.cycleStart ? new Date(state.cycleStart).getTime() : 0;
  return state.sessions.filter(s => s.wid !== 'free' && !s.deload && new Date(s.date).getTime() >= start);
}
function deloadDue() {
  if (state.deload.active || !state.cycleStart) return false;
  if (state.deloadSnooze && Date.now() < new Date(state.deloadSnooze).getTime()) return false;
  return daysSince(state.cycleStart) >= 42 && cycleSessions().length >= 15;
}
function deloadDaysLeft() { return Math.max(0, 7 - daysSince(state.deload.start)); }
function startDeload() { state.deload = { active: true, start: new Date().toISOString() }; state.deloadSnooze = null; save(); }
function stopDeload() { state.deload = { active: false, start: null }; state.cycleStart = new Date().toISOString(); state.deloadSnooze = null; save(); }
function checkDeloadEnd() {
  if (state.deload.active && daysSince(state.deload.start) >= 7) { stopDeload(); toast('Je rustweek is voorbij. Op naar het volgende blok!', 3500); }
}

function profileKg() {
  const p = state.profile;
  if (p.kg) return p.kg;
  const W = state.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  return W.length ? W[W.length - 1].kg : null;
}
function energy() {
  const p = state.profile; const kg = profileKg();
  if (!kg || !p.cm || !p.age) return null;
  const bmr = 10 * kg + 6.25 * p.cm - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const tdee = bmr * (p.act || 1.375);
  const raw = tdee + (p.goal || 0);
  const target = Math.round(Math.max(raw, bmr) / 10) * 10;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee / 10) * 10, target, floored: raw < bmr, protein: Math.round(kg * 1.4), pLow: Math.round(kg * 1.2), pHigh: Math.round(kg * 1.6), kg };
}
function dayFood(dk) { return state.food[dk] || []; }
function dayTotals(dk) { return dayFood(dk).reduce((t, x) => ({ p: t.p + (x.p || 0), kcal: t.kcal + (x.kcal || 0) }), { p: 0, kcal: 0 }); }
function addFood(dk, item) {
  if (!state.food[dk]) state.food[dk] = [];
  state.food[dk].push({ id: uid(), name: item.name, p: Math.round((item.p || 0) * 10) / 10, kcal: Math.round(item.kcal || 0) });
  save();
}

function setTitle(t) { $('#pageTitle').textContent = t; }

function render() {
  const onb = !state.settings.onboarded;
  $('#tabbar').hidden = onb; $('#topbar').hidden = onb;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  const v = $('#view');
  if (onb) { v.innerHTML = viewOnboarding(); return; }
  const map = { home: viewHome, train: viewTrain, progress: viewProgress, food: viewFood, more: viewMore };
  v.innerHTML = map[ui.tab]();
  setCloudStatus(cloud.status);
}

function viewOnboarding() {
  const s = state.settings;
  return '<div class="onb"><img class="logo" src="icons/icon-192.png" alt=""><h1>Welkom bij Fit worden</h1>' +
    '<p class="muted" style="margin-bottom:22px">Thuis werken aan je conditie, met wat krachttraining erbij. Alles blijft op dit apparaat.</p>' +
    '<label class="field"><span>Hoe mag de app je noemen? (optioneel)</span><input class="input" id="onbName" value="' + esc(s.name) + '" autocomplete="given-name"></label>' +
    '<div class="field"><span>Welke dumbbells heb je? (tik aan)</span><div class="chips">' + WEIGHT_OPTIONS.map(w => '<button class="chip ' + (s.weights.includes(w) ? 'on' : '') + '" data-action="toggleWeight" data-w="' + w + '">' + num(w) + ' kg</button>').join('') + '</div></div>' +
    '<div class="field"><span>Weekplan</span><div class="seg"><button class="' + (s.plan === 'mix' ? 'on' : '') + '" data-action="setPlan" data-v="mix">Thuis + hardlopen</button><button class="' + (s.plan === 'thuis' ? 'on' : '') + '" data-action="setPlan" data-v="thuis">Alleen thuis</button></div>' +
    '<p class="tiny muted" style="margin-top:6px">Thuis + hardlopen wisselt de thuistrainingen A, B en C af met het rustig opbouwende loopschema.</p></div>' +
    '<button class="btn primary block big" data-action="finishOnboarding" style="margin-top:10px">Aan de slag</button>' +
    (window.FIREBASE_CONFIG ? '<button class="btn ghost block" data-action="onbConnect" style="margin-top:10px">Ik heb al een code (andere telefoon)</button>' : '') + '</div>';
}

function workoutBadge(wid) { const w = WORKOUTS[wid]; return '<span class="badge c-' + w.color + '">' + w.short + '</span>'; }
function deloadPill() { return '<span class="pill" style="background:var(--plum-soft);color:var(--plum)">rustweek</span>'; }

function viewHome() {
  checkDeloadEnd();
  setTitle(state.settings.name ? 'Hoi ' + state.settings.name : 'Vandaag');
  let h = updateBanner();
  if (active) {
    h += '<div class="banner teal"><div class="ico">⏱️</div><div class="grow"><b>Training bezig: ' + esc(WORKOUTS[active.wid].name) + '</b><p class="small muted">Je kunt verdergaan waar je gebleven was.</p><div class="row" style="margin-top:10px"><button class="btn teal sm" data-action="resume">Doorgaan</button><button class="btn sm ghost" data-action="discardActive">Weggooien</button></div></div></div>';
  }
  if (needsBackup()) {
    const d = state.lastBackup ? 'Je laatste back-up is ' + daysSince(state.lastBackup) + ' dagen oud.' : 'Je hebt nog geen back-up gemaakt.';
    h += '<div class="banner"><div class="ico">💾</div><div class="grow"><b>Tijd voor een back-up</b><p class="small muted">' + d + ' Je gegevens staan alleen op deze telefoon.</p><div class="row" style="margin-top:10px"><button class="btn sm primary" data-action="shareBackup">Back-up maken</button></div></div></div>';
  }
  if (state.deload.active) {
    const left = deloadDaysLeft();
    h += '<div class="banner plum"><div class="ico">🌿</div><div class="grow"><b>Rustweek · nog ' + left + (left === 1 ? ' dag' : ' dagen') + '</b><p class="small muted">Trainingen zijn lichter (max. 2 sets, kortere intervallen, iets minder gewicht) en tellen niet mee voor opbouw, records en grafieken.</p><div class="row" style="margin-top:10px"><button class="btn sm ghost" data-action="deloadStop">Rustweek stoppen</button></div></div></div>';
  } else if (deloadDue()) {
    h += '<div class="card sugg" style="border-left-color:var(--plum)"><b>Tijd voor een rustweek?</b><p class="small" style="margin-top:4px">Je traint nu ' + Math.floor(daysSince(state.cycleStart) / 7) + ' weken en ' + cycleSessions().length + ' trainingen achter elkaar. Een lichtere week geeft je lichaam tijd om te herstellen en sterker terug te komen.</p><div class="row" style="margin-top:12px"><button class="btn sm" style="background:var(--plum);color:#fff" data-action="deloadStart">Start rustweek</button><button class="btn sm ghost" data-action="deloadSnooze">Nog een week door</button></div></div>';
  }
  const nw = nextWid(); const w = WORKOUTS[nw];
  const lvlTxt = nw === 'L' ? 'Niveau ' + (state.prog.run.lvl + 1) + ' van ' + RUN_LEVELS.length + ' · ± ' + fmtMin(estimate(nw, 'normaal')) : '± ' + fmtMin(estimate(nw, 'normaal'));
  h += '<div class="card hero"><p class="small muted" style="font-weight:700">VOLGENDE TRAINING' + (state.deload.active ? ' · RUSTWEEK' : '') + '</p><h2 style="font-size:24px;margin:6px 0 4px">' + esc(w.name) + '</h2><p class="small muted">' + esc(lvlTxt) + '</p><p class="small" style="margin:10px 0 14px;opacity:.95">' + esc(w.desc) + '</p><button class="btn block" data-action="preview" data-w="' + nw + '">Bekijken en starten</button></div>';

  const wk = sessionsThisWeek(); const goal = state.settings.weekGoal;
  const sow = startOfWeek(); const days = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  const today = (new Date().getDay() + 6) % 7;
  h += '<div class="card"><div class="row between"><h3>Deze week</h3><span class="pill">' + wk.length + ' / ' + goal + ' trainingen</span></div><div class="week">' +
    days.map((d, i) => {
      const dd = new Date(sow); dd.setDate(dd.getDate() + i); const dk = dateKey(dd);
      const ss = wk.filter(x => dateKey(x.date) === dk);
      return '<div class="d"><div class="dot ' + (ss.length ? 'done' : '') + (i === today ? ' today' : '') + '">' + (ss.length ? ss.map(x => WORKOUTS[x.wid] ? WORKOUTS[x.wid].short : '•').join('') : '') + '</div>' + d + '</div>';
    }).join('') + '</div>' +
    (wk.length >= goal ? '<p class="small" style="margin-top:10px;color:var(--ok);font-weight:700">Weekdoel gehaald. Goed bezig!</p>' : '') + '</div>';

  const en = energy(); const tt = dayTotals(dateKey());
  if (en || tt.kcal) {
    h += '<button class="card" style="display:block;width:100%;text-align:left" data-action="goFood"><div class="row between"><h3>Voeding vandaag</h3><span class="chev muted">›</span></div><p class="small muted">' + tt.kcal + (en ? ' / ' + en.target : '') + ' kcal · ' + num(Math.round(tt.p)) + (en ? ' / ' + en.protein : '') + ' g eiwit</p></button>';
  }
  if (state.sugg.length) h += '<div class="section-title">Klaar voor de volgende stap</div>' + state.sugg.map(suggCard).join('');
  const tips = TIPS_TRAIN.concat(TIPS_FOOD);
  const tip = tips[Math.floor(Date.now() / DAY) % tips.length];
  h += '<div class="section-title">Tip van de dag</div><div class="card flat"><h3>' + esc(tip.t) + '</h3><p class="small muted">' + esc(tip.b) + '</p></div>';
  const last = state.sessions[state.sessions.length - 1];
  if (last) {
    h += '<div class="section-title">Laatste training</div><div class="card flat"><div class="row">' + (WORKOUTS[last.wid] ? workoutBadge(last.wid) : '<span class="badge c-sun">•</span>') + '<div class="grow"><b>' + esc(last.name) + '</b><p class="small muted">' + fmtDate(last.date) + ' · ' + fmtMin(last.dur) + (last.km ? ' · ' + num(last.km) + ' km' : '') + '</p></div>' + (last.deload ? deloadPill() : '') + '</div></div>';
  }
  return h;
}

function updateBanner() {
  return ui.updateReady ? '<div class="banner teal"><div class="ico">✨</div><div class="grow"><b>Nieuwe versie klaar</b><p class="small muted">Je gegevens blijven gewoon staan.</p><div class="row" style="margin-top:10px"><button class="btn teal sm" data-action="applyUpdate">Nu bijwerken</button></div></div></div>' : '';
}

function suggCard(s) {
  if (!s) return '';
  if (s.dir === 'info') return '<div class="card sugg info"><b>🏅 ' + esc(s.title) + '</b><p class="small" style="margin-top:4px">' + esc(s.text) + '</p><p class="tiny muted" style="margin-top:4px">' + esc(s.why) + '</p>' +
    '<div class="row" style="margin-top:12px"><button class="btn sm teal" data-action="laterSugg" data-id="' + s.id + '">Oké</button></div></div>';
  return '<div class="card sugg"><b>' + esc(s.title) + '</b><p class="small" style="margin-top:4px">' + esc(s.text) + '</p><p class="tiny muted" style="margin-top:4px">' + esc(s.why) + '</p>' +
    '<div class="row" style="margin-top:12px"><button class="btn sm teal" data-action="applySugg" data-id="' + s.id + '">Toepassen</button><button class="btn sm ghost" data-action="laterSugg" data-id="' + s.id + '">Nog niet</button></div></div>';
}

function viewTrain() {
  setTitle('Trainen');
  let h = '<div class="section-title" style="margin-top:6px">Weekschema</div>';
  h += '<p class="small muted" style="margin:0 4px 12px">Volgorde: ' + rotation().map(x => WORKOUTS[x].short).join(' → ') + '. De volgende training staat op Vandaag, maar je kunt altijd zelf kiezen.</p>';
  for (const wid of ['A', 'B', 'C', 'L']) {
    const w = WORKOUTS[wid];
    const meta = wid === 'L' ? 'Niveau ' + (state.prog.run.lvl + 1) + '/' + RUN_LEVELS.length + ': ' + fmtRun(RUN_LEVELS[state.prog.run.lvl]) : '± ' + fmtMin(estimate(wid, 'normaal')) + ' (normaal)';
    h += '<button class="card list-item" style="padding:14px 16px" data-action="preview" data-w="' + wid + '">' + workoutBadge(wid) + '<div class="grow"><b>' + esc(w.name) + (nextWid() === wid ? ' <span class="pill" style="background:var(--accent-soft);color:var(--accent)">volgende</span>' : '') + '</b><p class="small muted">' + esc(meta) + '</p></div><span class="chev">›</span></button>';
  }
  h += '<button class="btn block ghost" data-action="freeLog" style="margin-top:4px">+ Losse activiteit vastleggen</button>';
  h += '<div class="section-title">Rustweek</div><div class="card">';
  if (state.deload.active) h += '<p class="small"><b>De rustweek loopt nog ' + deloadDaysLeft() + ' dagen.</b> Alle trainingen zijn lichter en tellen niet mee voor opbouw, records en grafieken.</p><button class="btn block ghost" data-action="deloadStop" style="margin-top:10px">Rustweek stoppen</button>';
  else h += '<p class="small muted">Na ongeveer 6 weken en 15 trainingen stelt de app een lichtere week voor. Je kunt er ook zelf eentje starten, bijvoorbeeld als je moe bent of het druk hebt. Huidig blok: ' + (state.cycleStart ? Math.floor(daysSince(state.cycleStart) / 7) + ' weken, ' : '') + cycleSessions().length + ' trainingen.</p><button class="btn block" data-action="deloadStart" style="margin-top:10px">Rustweek starten</button>';
  h += '</div>';
  h += '<div class="section-title">Oefeningen</div>';
  for (const [cat, ids] of LIB) {
    h += '<div class="card"><h3 style="margin-bottom:4px">' + esc(cat) + '</h3>' + ids.map(id => '<button class="ex-row" data-action="exInfo" data-id="' + id + '"><div class="grow"><b>' + esc(exName(id)) + '</b><div class="meta">' + esc(EX[id].muscles) + '</div></div>' + (EX[id].db ? '<span class="pill">dumbbells</span>' : '') + '<span class="chev muted">›</span></button>').join('') + '</div>';
  }
  h += '<p class="tiny muted" style="margin:0 4px">Bewust weggelaten, ook bij de alternatieven: push-ups (alle varianten), pull-ups, oefeningen waarbij je op je handen steunt en zware rugbelasting.' + (state.settings.impact ? '' : ' Springen staat uit; dit kun je aanzetten bij Meer.') + '</p>';
  return h;
}

function exInfoHtml(id) {
  const e = EX[id];
  const jumpNote = e.jump ? (state.settings.impact ? '<p class="small muted">Springversie staat aan. Rustiger variant: ' + esc(e.name) + '.</p>' : '<p class="small muted">Springvariant (als je dat aanzet): ' + esc(e.jump) + '.</p>') : '';
  return '<h2>' + esc(exName(id)) + '</h2><p class="small muted">' + esc(e.muscles) + (e.side ? ' · per kant' : '') + '</p><ol>' + e.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
    '<div class="banner teal" style="margin-bottom:10px"><div class="ico">💡</div><p class="small">' + esc(e.tip) + '</p></div>' + jumpNote +
    '<div class="actions"><a class="btn block primary" href="' + videoUrl(id) + '" target="_blank" rel="noopener">▶ Video bekijken (YouTube)</a><button class="btn block ghost" data-action="closeSheet">Sluiten</button></div>';
}

function swapBtn(orig, ctx, cur, taken) {
  if (!ALTS[orig]) return '';
  return '<button class="btn sm ghost swapbtn" data-action="swapOpen" data-orig="' + orig + '" data-ctx="' + ctx + '" data-cur="' + (cur || orig) + '" data-taken="' + (taken || []).join(',') + '">⇄ Wissel</button>';
}
function swapHtml(orig, ctx, cur, taken) {
  cur = cur || resolve(orig); taken = taken || [];
  const opts = [[orig, 'Oorspronkelijke oefening']].concat(ALTS[orig] || []);
  return '<h2>Oefening wisselen</h2><p class="small muted" style="margin-bottom:12px">Kies een alternatief, bijvoorbeeld als iets pijn doet of je materiaal mist. Je keuze wordt bewaard voor volgende trainingen en elke oefening houdt haar eigen voortgang bij. Terugzetten kan hier of bij Meer.</p>' +
    opts.map(([id, note]) => {
      const p = EX_DEFAULTS[id] ? getEx(id) : null;
      const busy = id !== cur && taken.includes(id);
      return '<div class="card flat swap-opt ' + (id === cur ? 'cur' : '') + (busy ? ' busy' : '') + '"><div class="row"><div class="grow"><b>' + esc(exName(id)) + '</b>' + (id === cur ? ' <span class="pill" style="background:var(--teal-soft);color:var(--teal)">huidig</span>' : '') + '<p class="small muted">' + esc(note) + ' · ' + esc(EX[id].muscles) + '</p>' + (p ? '<p class="tiny muted">Voortgang: ' + esc(fmtEx(id, p)) + '</p>' : '') + '</div><button class="btn sm ghost" data-action="exInfo2" data-id="' + id + '" aria-label="Uitleg">ⓘ</button></div>' +
        (id === cur ? '' : busy ? '<p class="tiny muted" style="margin-top:8px">Zit al in dit onderdeel, dus niet te kiezen.</p>' : '<button class="btn sm block" style="margin-top:10px" data-action="doSwap" data-orig="' + orig + '" data-to="' + id + '" data-ctx="' + ctx + '">Kies deze</button>') + '</div>';
    }).join('') +
    '<div class="actions"><button class="btn block ghost" data-action="swapBack" data-ctx="' + ctx + '">Terug</button></div>';
}

function lastItem(id) {
  const S = realSessions();
  for (let i = S.length - 1; i >= 0; i--) for (const b of S[i].blocks) if (b.type === 'sets') { const it = b.items.find(x => x.id === id && x.sets.length); if (it) return { date: S[i].date, it }; }
  return null;
}
function lastBlock(pred) {
  const S = realSessions();
  for (let i = S.length - 1; i >= 0; i--) { const b = S[i].blocks.find(pred); if (b) return { date: S[i].date, b }; }
  return null;
}
function shortDay(iso) { return fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' }); }
function prevText(id) {
  const l = lastItem(id); if (!l) return '';
  return 'Vorige keer (' + shortDay(l.date) + '): ' + l.it.sets.join(' · ') + (l.it.kind === 'time' ? ' s' : '') + (l.it.w ? ' @ ' + num(l.it.w) + ' kg' : '');
}
function prevTimedText(key) {
  const l = lastBlock(b => b.type === 'timed' && b.key === key); if (!l) return '';
  return 'Vorige keer (' + shortDay(l.date) + '): ' + l.b.done + ' van ' + l.b.rounds + ' rondes · ' + l.b.work + '/' + l.b.rest + ' s';
}
function prevRunText() {
  const l = lastBlock(b => b.type === 'run'); if (!l) return '';
  return 'Vorige keer (' + shortDay(l.date) + '): niveau ' + (l.b.lvl + 1) + ', ' + l.b.done + ' van ' + l.b.reps + ' looprondes (' + fmtMin(l.b.runSec) + ' gelopen)';
}
function explainTimed(b) {
  return b.work + ' s werk en ' + b.rest + ' s rust per oefening. ' + b.ex.length + ' oefeningen achter elkaar = 1 ronde; ' + word(b.rounds) + (b.rounds === 1 ? ' ronde' : ' rondes') + (b.rounds > 1 ? ' met ' + b.roundRest + ' s pauze ertussen.' : '.');
}
function explainItem(it) {
  const e = EX[it.id]; const S = it.planned || it.sets.length;
  const kant = e.side ? ' per kant' : '';
  const what = it.kind === 'time' ? it.target + ' s vasthouden' + (e.side ? ' per kant (▶ telt beide kanten af)' : '') : it.target + ' herhalingen' + kant + (it.w ? ' met ' + num(it.w) + ' kg' : '');
  return exName(it.id) + ' ' + S + ' × ' + (it.kind === 'time' ? it.target + ' s' : it.target) + ' = ' + what + ', ' + it.rest + ' s rust, ' + word(S) + ' keer.';
}

function previewHtml(wid, len) {
  ui.pv = { wid, len };
  const w = WORKOUTS[wid];
  let h = '<div class="row" style="margin-bottom:8px">' + workoutBadge(wid) + '<div class="grow"><h2 style="margin:0">' + esc(w.name) + '</h2><p class="small muted">± ' + fmtMin(estimate(wid, len)) + (state.deload.active ? ' · rustweek' : '') + '</p></div></div><p class="small muted" style="margin-bottom:14px">' + esc(w.desc) + '</p>';
  if (state.deload.active) h += '<div class="banner plum"><div class="ico">🌿</div><p class="small">Rustweek: maximaal 2 sets, kortere intervallen en iets lichter. Deze training telt niet mee voor opbouw en grafieken.</p></div>';
  if (wid !== 'L') h += '<div class="seg" style="margin-bottom:14px">' + Object.keys(LEN).map(k => '<button class="' + (k === len ? 'on' : '') + '" data-action="previewLen" data-w="' + wid + '" data-len="' + k + '">' + LEN[k] + '<br><span class="tiny muted">' + fmtMin(estimate(wid, k)) + '</span></button>').join('') + '</div>';
  for (const b of planBlocks(wid, len)) {
    if (b.type === 'check') h += '<div class="card flat"><div class="row between"><h3>' + esc(b.title) + '</h3><span class="pill">± ' + fmtMin(b.items.reduce((s, i) => s + i.sec, 0)) + '</span></div><p class="small muted">' + b.items.map(i => esc(exName(i.ex))).join(' · ') + '</p></div>';
    if (b.type === 'timed') {
      h += '<div class="card flat"><div class="row between"><h3>' + esc(b.title) + '</h3><span class="pill">' + b.work + '/' + b.rest + ' s · ' + b.rounds + ' rondes</span></div><p class="tiny muted" style="margin:4px 0">' + esc(explainTimed(b)) + '</p>' +
        b.ex.map((id, i) => '<div class="ex-row"><button class="grow" style="text-align:left" data-action="exInfo" data-id="' + id + '">' + esc(exName(id)) + (id !== b.orig[i] ? ' <span class="tiny muted">(gewisseld)</span>' : '') + '</button>' + swapBtn(b.orig[i], 'preview', id, b.ex.filter((_, j) => j !== i)) + '</div>').join('') + '</div>';
    }
    if (b.type === 'sets') {
      h += '<div class="card flat"><div class="row between"><h3>' + esc(b.title) + '</h3><span class="pill">rust per oefening</span></div>' + b.items.map((it, ii) => { const p = { sets: it.planned, reps: it.target, sec: it.target, w: it.w }; return '<div class="ex-row"><button class="grow" style="text-align:left" data-action="exInfo" data-id="' + it.id + '">' + esc(exName(it.id)) + (it.id !== it.orig ? ' <span class="tiny muted">(gewisseld)</span>' : '') + '<div class="meta">' + esc(fmtEx(it.id, p)) + ' · ' + it.rest + ' s rust</div></button>' + swapBtn(it.orig, 'preview', it.id, b.items.filter((_, j) => j !== ii).map(x => x.id)) + '</div>'; }).join('') +
        '<p class="tiny muted" style="margin-top:8px">Na de laatste set van een oefening heb je ± ' + fmtSecShort(b.trans) + ' om naar de volgende te gaan.</p></div>';
    }
    if (b.type === 'run') {
      h += '<div class="card flat"><h3>Niveau ' + (b.lvl + 1) + ' van ' + RUN_LEVELS.length + '</h3><p class="small">5 min inwandelen · ' + esc(fmtRun(b)) + ' · 5 min uitwandelen</p><p class="tiny muted" style="margin-top:6px">Loop in praattempo. Pijn in knie, scheen of voet? Wandel het restant uit en geef het aan na afloop.</p></div>' +
        '<button class="btn block ghost sm" data-action="exInfo" data-id="lopen" style="margin-bottom:8px">Tips voor hardlopen</button>';
    }
  }
  h += '<div class="actions"><button class="btn primary block big" data-action="startWorkout" data-w="' + wid + '" data-len="' + len + '">Start training</button><button class="btn block ghost" data-action="closeSheet">Sluiten</button></div>';
  return h;
}

function openRunner() {
  $('#runner').hidden = false; document.body.style.overflow = 'hidden';
  lockScreen(); renderRunner();
  clearInterval(tickTimer); tickTimer = setInterval(tick, 200);
}
function closeRunner() {
  $('#runner').hidden = true; $('#runner').innerHTML = ''; document.body.style.overflow = '';
  clearInterval(tickTimer); tickTimer = null; unlockScreen(); clearPlan();
}

function renderRunner() {
  const a = active; if (!a) return;
  const w = WORKOUTS[a.wid];
  const b = curBlock();
  const bodyEl = $('.run-body'); const top = bodyEl ? bodyEl.scrollTop : 0; const sameBlock = renderRunner._bi === a.bi + (a.finishing ? 100 : 0);
  let body = '', foot = '';
  if (a.finishing) body = finishHtml();
  else if (b.type === 'sets') [body, foot] = setsHtml(b);
  else if (b.type === 'check') [body, foot] = checkHtml(b);
  else if (b.done) {
    const next = a.blocks[a.bi + 1];
    body = '<div class="timer-wrap" style="padding-top:40px"><div style="font-size:64px">✓</div><h2 style="margin:10px 0 6px">' + esc(b.title) + ' klaar</h2><p class="muted">' + (next ? 'Neem even een slok water.' : 'Knap gedaan!') + '</p></div>';
    foot = next ? '<button class="btn primary block big" data-action="nextBlock">Door naar ' + esc(next.title) + '</button>' : '<button class="btn primary block big" data-action="finish">Training afronden</button>';
  } else if (b.type === 'run') [body, foot] = runHtml(b);
  else [body, foot] = timedHtml(b);
  const strip = '<div class="progress-strip">' + a.blocks.map((x, i) => '<i class="' + (i < a.bi || x.done ? 'done' : i === a.bi ? 'cur' : '') + '"></i>').join('') + '</div>';
  $('#runner').innerHTML = '<div class="run-head"><button class="x" data-action="stopAsk" aria-label="Stoppen">✕</button><div class="t"><b>' + esc(w.name) + (a.deload ? ' ' + deloadPill() : '') + '</b><span>' + (a.finishing ? 'Afronden' : esc(b.title)) + ' · <span id="elapsed">' + fmtTime((Date.now() - a.started) / 1000) + '</span></span></div></div>' + strip +
    '<div class="run-body">' + body + '</div>' + (foot ? '<div class="run-foot">' + foot + '</div>' : '');
  if (sameBlock) $('.run-body').scrollTop = top;
  renderRunner._bi = a.bi + (a.finishing ? 100 : 0);
  updateTimerDisplay();
  syncPlan();
}

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 6v12l8.5-6zM16 6h2v12h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M18 6v12l-8.5-6zM6 6h2v12H6z"/></svg>'
};

function phaseLabel(ph) {
  if (ph.k === 'prep') return 'Klaar?';
  if (ph.k === 'rest') return ph.label || 'Rust';
  if (ph.k === 'run') return 'Hardlopen';
  if (ph.k === 'walk') return ph.label || 'Wandelen';
  return 'Werk';
}

function nextBlockBtn(allDone) {
  const a = active; const next = a.blocks[a.bi + 1];
  return '<button class="btn ' + (allDone ? 'primary' : 'ghost') + ' block" data-action="' + (next ? 'nextBlock' : 'finish') + '">' + (next ? (allDone ? 'Door naar ' : 'Verder naar ') + esc(next.title) : 'Training afronden') + '</button>';
}

function timerBar() {
  const t = active.timer; if (!t) return '';
  const b = curBlock();
  if (t.type === 'rest' || t.type === 'trans') {
    return '<div class="rest-bar"><b id="tmrNum">0:00</b><div class="grow small"><b>' + (t.type === 'rest' ? 'Rust' : 'Naar volgende oefening') + '</b><br><span class="muted">Hierna: ' + esc(t.next) + '</span></div><button class="btn sm ghost" data-action="restAdd">+15 s</button><button class="btn sm teal" data-action="restSkip">' + (t.type === 'rest' ? 'Klaar' : 'Nu') + '</button></div>';
  }
  const name = t.type === 'item' ? exName(b.items[t.ii].ex) : exName(b.items[t.ii].id) + ' · set ' + (t.si + 1);
  return '<div class="rest-bar work"><b id="tmrNum">0:00</b><div class="grow small"><b id="tmrLbl">' + (t.type === 'hold' ? 'Vasthouden' : 'Bezig') + '</b><br><span class="muted">' + esc(name) + '</span></div><button class="btn sm ghost" data-action="timerStop">Stop</button></div>';
}

function checkHtml(b) {
  const a = active; const t = a.timer;
  const total = b.items.reduce((s, i) => s + i.sec, 0);
  const allDone = b.items.every(i => i.done);
  let body = '<h2 style="margin-bottom:4px">' + esc(b.title) + '</h2><p class="small muted" style="margin-bottom:12px">± ' + fmtMin(total) + '. Vink af wat je gedaan hebt, of tik op ▶: de timer loopt en vinkt het onderdeel vanzelf af.</p>';
  body += '<button class="btn block ghost sm" data-action="checkAll" style="margin-bottom:12px">▶ Alles achter elkaar</button><div class="card flat" style="padding:4px 14px">';
  b.items.forEach((it, ii) => {
    const on = t && t.type === 'item' && t.ii === ii;
    body += '<div class="check-row ' + (on ? 'on' : '') + '"><button class="check sm ' + (it.done ? 'on' : '') + '" data-action="checkItem" data-ii="' + ii + '" aria-label="Afvinken">✓</button><button class="grow" style="text-align:left" data-action="exInfo" data-id="' + it.ex + '"><b class="' + (it.done ? 'strike' : '') + '">' + esc(exName(it.ex)) + '</b><div class="tiny muted">' + it.sec + ' s' + (EX[it.ex].side ? ' · halverwege wisselen' : '') + '</div></button>' +
      (it.done ? '' : '<button class="btn sm ' + (on ? 'primary' : 'ghost') + '" data-action="' + (on ? 'timerStop' : 'itemPlay') + '" data-ii="' + ii + '" aria-label="Timer">' + (on ? '■' : '▶') + '</button>') + '</div>';
  });
  body += '</div>';
  return [body, timerBar() + nextBlockBtn(allDone)];
}

function timedHtml(b) {
  const a = active;
  if (!b.started) {
    const pt = prevTimedText(b.key);
    const list = '<p class="small" style="margin-bottom:6px">' + esc(explainTimed(b)) + '</p>' + (pt ? '<p class="prev" style="margin-bottom:8px">' + esc(pt) + '</p>' : '') + b.ex.map((id, i) => '<div class="ex-row"><button class="grow" style="text-align:left" data-action="exInfo" data-id="' + id + '">' + esc(exName(id)) + '</button>' + swapBtn(b.orig[i], 'run', id, b.ex.filter((_, j) => j !== i)) + '</div>').join('');
    return ['<h2 style="margin-bottom:6px">' + esc(b.title) + '</h2><div class="card flat">' + list + '</div><p class="tiny muted">De timer loopt vanzelf door alle oefeningen en rustpauzes. Je hoort een piep bij elke wissel.</p>', '<button class="btn primary block big" data-action="startBlock">Start ' + esc(b.title.toLowerCase()) + '</button><button class="btn block ghost sm" data-action="skipBlock" style="margin-top:8px">Overslaan</button>'];
  }
  const ph = b.phases[b.pi];
  const ex = ph.ex;
  const cls = ph.k === 'work' ? 'work' : ph.k === 'rest' ? 'rest' : 'prep';
  let nextTxt = '';
  const nx = b.phases.slice(b.pi + 1).find(p => p.k === 'work');
  if (ph.k === 'work' && nx) nextTxt = 'Hierna: ' + exName(nx.ex);
  const title = ph.k === 'work' ? exName(ex) : ex ? 'Straks: ' + exName(ex) : '';
  const cue = ph.k === 'work' ? EX[ex].steps[Math.min(1, EX[ex].steps.length - 1)] : '';
  const oi = ph.slot != null ? ph.slot : b.ex.indexOf(ex);
  const rounds = '<p class="small muted" style="margin-top:14px">Ronde ' + (ph.r || 1) + ' van ' + b.rounds + '</p><div class="rounds" style="margin-top:8px">' + b.doneRounds.map((d, i) => '<button class="' + (d ? 'done' : '') + '" data-action="toggleRound" data-i="' + i + '" aria-label="Ronde ' + (i + 1) + '">' + (d ? '✓' : i + 1) + '</button>').join('') + '</div>';
  const body = '<div class="timer-wrap"><span class="phase ' + cls + '">' + esc(phaseLabel(ph)) + '</span>' +
    '<div class="ring ' + cls + '"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" id="ringFg" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg><div class="num" id="tnum">0:00</div></div>' +
    '<div class="cur-ex">' + esc(title) + '</div>' + (cue ? '<p class="cue">' + esc(cue) + '</p>' : '') +
    (ex ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn sm ghost" data-action="exInfo" data-id="' + ex + '">Uitleg & video</button>' + (oi >= 0 ? swapBtn(b.orig[oi], 'run', b.ex[oi], b.ex.filter((_, j) => j !== oi)) : '') + '</div>' : '') +
    (nextTxt ? '<p class="next-up">' + esc(nextTxt) + '</p>' : '') + rounds +
    '<p class="tiny muted" style="margin-top:14px;max-width:360px">' + esc(explainTimed(b)) + '</p></div>';
  const foot = '<div class="controls" style="margin-top:0"><button class="ctl" data-action="prevPhase" aria-label="Vorige">' + ICON.prev + '</button><button class="ctl main" data-action="togglePlay" aria-label="Start/pauze">' + (a.running ? ICON.pause : ICON.play) + '</button><button class="ctl" data-action="skipPhase" aria-label="Volgende">' + ICON.next + '</button></div>';
  return [body, foot];
}

function runHtml(b) {
  const a = active;
  if (!b.started) {
    const body = '<h2 style="margin-bottom:6px">Niveau ' + (b.lvl + 1) + '</h2><div class="card flat"><p>5 min inwandelen (warming-up)</p><p><b>' + esc(fmtRun(b)) + '</b></p><p>5 min uitwandelen</p></div>' + (prevRunText() ? '<p class="prev" style="margin-bottom:12px">' + esc(prevRunText()) + '</p>' : '') +
      '<div class="banner teal"><div class="ico">💡</div><p class="small">Je hoort een piep bij elke wissel en de telefoon trilt. Het scherm blijft aan zolang de app open is. Pijn? Wandel verder en geef het na afloop aan.</p></div>';
    return [body, '<button class="btn primary block big" data-action="startBlock">Start</button>'];
  }
  const ph = b.phases[b.pi];
  const cls = ph.k === 'run' ? 'run' : ph.k === 'walk' ? 'walk' : 'prep';
  const info = ph.k === 'run' ? 'Interval ' + ph.n + ' van ' + b.reps : ph.label === 'Inwandelen' ? 'Rustig opwarmen' : ph.cool ? 'Rustig uitlopen' : ph.k === 'walk' ? 'Op adem komen' : '';
  const nx = b.phases[b.pi + 1];
  const body = '<div class="runbig ' + cls + '"><div class="lab">' + esc(phaseLabel(ph)) + '</div><div class="num" id="tnum">0:00</div><div class="small">' + esc(info) + '</div></div>' +
    '<div class="card flat"><div class="row between"><span class="muted small">Nog te gaan</span><b id="trem">–</b></div><div class="row between" style="margin-top:6px"><span class="muted small">Hierna</span><b>' + (nx ? esc(phaseLabel(nx)) + ' ' + fmtRunSec(nx.sec) : 'Klaar') + '</b></div><div class="row between" style="margin-top:6px"><span class="muted small">Looprondes gedaan</span><b>' + b.doneRuns + ' / ' + b.reps + '</b></div></div>';
  const foot = '<div class="controls" style="margin-top:0"><button class="ctl" data-action="prevPhase" aria-label="Vorige">' + ICON.prev + '</button><button class="ctl main" data-action="togglePlay" aria-label="Start/pauze">' + (a.running ? ICON.pause : ICON.play) + '</button><button class="ctl" data-action="skipPhase" aria-label="Volgende">' + ICON.next + '</button></div>' +
    '<button class="btn block ghost sm" data-action="endRunEarly" style="margin-top:10px">Stoppen en uitwandelen</button>';
  return [body, foot];
}

function setsHtml(b) {
  const a = active; const t = a.timer;
  let body = '<h2 style="margin-bottom:4px">' + esc(b.title) + '</h2><p class="small muted" style="margin-bottom:12px">Vink elke set af: de rusttimer start vanzelf. Na de laatste set van een oefening telt hij ± ' + fmtSecShort(b.trans) + ' af naar de volgende. Bij oefeningen op tijd start ▶ de werktijd.</p>';
  b.items.forEach((it, ii) => {
    const e = EX[it.id];
    const complete = it.sets.every(s => s.done);
    const isNext = t && t.type === 'trans' && t.ii === ii;
    body += '<div class="set-card ' + (complete ? 'complete' : '') + (isNext ? ' upnext' : '') + '" id="sc-' + ii + '"><div class="row" style="align-items:flex-start"><div class="grow"><b>' + esc(exName(it.id)) + '</b>' + (it.id !== it.orig ? ' <span class="tiny muted">(gewisseld)</span>' : '') +
      '<div class="small muted">Doel: ' + it.planned + ' × ' + (it.kind === 'time' ? it.target + ' s' : it.target) + (e.side ? ' per kant' : '') + (it.w ? ' · ' + num(it.w) + ' kg' : '') + '</div><div class="pill" style="margin-top:6px;display:inline-block">⏱ ' + it.rest + ' s rust tussen sets</div></div>' +
      '<div class="row" style="gap:6px">' + swapBtn(it.orig, 'run', it.id, b.items.filter((_, j) => j !== ii).map(x => x.id)) + '<button class="btn sm ghost" data-action="exInfo" data-id="' + it.id + '" aria-label="Uitleg">ⓘ</button></div></div>' +
      (prevText(it.id) ? '<p class="prev">' + esc(prevText(it.id)) + '</p>' : '') +
      '<p class="explain">' + esc(explainItem(it)) + '</p>';
    if (e.db || e.dbOpt) {
      const opts = (e.dbOpt ? [0] : []).concat(avail());
      body += '<div class="wchips">' + opts.map(w => '<button class="' + (it.w === w ? 'on' : '') + '" data-action="setW" data-ii="' + ii + '" data-w="' + w + '">' + (w ? num(w) + ' kg' : 'zonder') + '</button>').join('') + '</div>';
    }
    it.sets.forEach((s, si) => {
      const holding = t && t.type === 'hold' && t.ii === ii && t.si === si;
      const holdBtn = it.kind === 'time' && !s.done ? '<button class="btn sm ' + (holding ? 'primary' : 'ghost') + '" data-action="' + (holding ? 'timerStop' : 'hold') + '" data-ii="' + ii + '" data-si="' + si + '" aria-label="Timer">' + (holding ? '■' : '▶') + '</button>' : '';
      body += '<div class="set-row"><span class="lbl">Set ' + (si + 1) + (si >= it.planned ? '<br><span class="tiny">extra</span>' : '') + '</span><div class="stepper"><button data-action="adj" data-ii="' + ii + '" data-si="' + si + '" data-d="-1">−</button><b>' + s.v + (it.kind === 'time' ? 's' : '') + '</b><button data-action="adj" data-ii="' + ii + '" data-si="' + si + '" data-d="1">+</button></div>' + holdBtn + '<button class="check ' + (s.done ? 'on' : '') + '" data-action="toggleSet" data-ii="' + ii + '" data-si="' + si + '" aria-label="Set afvinken">✓</button></div>';
    });
    body += '<button class="btn sm ghost" data-action="addSet" data-ii="' + ii + '" style="margin-top:4px">+ Set</button></div>';
  });
  const allDone = b.items.every(it => it.sets.every(s => s.done));
  return [body, timerBar() + nextBlockBtn(allDone)];
}

function finishHtml() {
  const a = active; const f = a.fin || (a.fin = { rating: 0, pain: false, note: '', km: '' });
  const isRun = a.wid === 'L';
  return '<h2 style="margin-bottom:4px">Hoe ging het?</h2><p class="small muted" style="margin-bottom:14px">Duur: ' + fmtMin((Date.now() - a.started) / 1000) + '. ' + (a.deload ? 'Rustweektraining: telt niet mee voor de opbouw.' : 'Dit helpt de app te bepalen wanneer het zwaarder mag.') + '</p>' +
    '<div class="rating">' + RATINGS.map(r => '<button class="' + (f.rating === r.v ? 'on' : '') + '" data-action="rate" data-v="' + r.v + '">' + r.t + '<small>' + r.s + '</small></button>').join('') + '</div>' +
    '<div class="card flat" style="margin-top:14px"><label class="switch"><div><b>Pijn of klachten</b><p class="small muted">Bijv. knie, scheen, rug of pols</p></div><span class="toggle"><input type="checkbox" data-action="pain" ' + (f.pain ? 'checked' : '') + '><i></i></span></label></div>' +
    (isRun ? '<label class="field"><span>Afstand in km (optioneel)</span><input class="input" inputmode="decimal" id="finKm" value="' + esc(f.km) + '" placeholder="bijv. 2,4"></label>' : '') +
    '<label class="field"><span>Notitie (optioneel)</span><textarea class="input" id="finNote" placeholder="Hoe voelde je je?">' + esc(f.note) + '</textarea></label>' +
    '<button class="btn primary block big" data-action="saveSession" ' + (f.rating ? '' : 'disabled') + '>Opslaan</button><button class="btn block ghost" data-action="backToWorkout" style="margin-top:8px">Terug naar training</button>';
}

function updateTimerDisplay() {
  const a = active; if (!a) return;
  const now = Date.now();
  const el = $('#elapsed'); if (el) el.textContent = fmtTime((now - a.started) / 1000);
  const b = curBlock();
  if (b && b.phases && b.started && !b.done && !a.finishing) {
    const ph = b.phases[b.pi];
    const left = a.running ? a.tEnd - now : (a.tLeft ?? ph.sec * 1000);
    const n = $('#tnum'); if (n) n.textContent = fmtTime(Math.ceil(Math.max(0, left) / 1000));
    const r = $('#ringFg'); if (r) r.setAttribute('stroke-dashoffset', String(326.7 * (1 - clamp(left / (ph.sec * 1000), 0, 1))));
    const rem = $('#trem');
    if (rem) { let t = left / 1000; for (let i = b.pi + 1; i < b.phases.length; i++) t += b.phases[i].sec; rem.textContent = fmtTime(t); }
  }
  const t = a.timer; const tn = $('#tmrNum');
  if (t && tn) {
    if (t.startAt && now < t.startAt) { tn.textContent = String(Math.ceil((t.startAt - now) / 1000)); const l = $('#tmrLbl'); if (l) l.textContent = 'Klaar?'; }
    else if (t.type === 'hold') { const st = holdStage(t, now); tn.textContent = fmtTime(Math.ceil(st.rem)); const l = $('#tmrLbl'); if (l) l.textContent = st.lbl; }
    else { tn.textContent = fmtTime(Math.ceil((t.end - now) / 1000)); const l = $('#tmrLbl'); if (l) l.textContent = 'Bezig'; }
  }
}

const SIDE_GAP = 5;
function holdStage(t, now) {
  if (!t.two) return { i: 0, lbl: 'Vasthouden', rem: (t.end - now) / 1000 };
  const el = (now - t.startAt) / 1000;
  if (el < t.sec) return { i: 0, lbl: 'Kant 1', rem: t.sec - el };
  if (el < t.sec + SIDE_GAP) return { i: 1, lbl: 'Wissel van kant', rem: t.sec + SIDE_GAP - el };
  return { i: 2, lbl: 'Kant 2', rem: (t.end - now) / 1000 };
}
function startItemTimer(ii, chain) {
  const b = curBlock(); const it = b.items[ii]; const now = Date.now();
  active.timer = { type: 'item', ii, chain: !!chain, startAt: now + 3000, end: now + 3000 + it.sec * 1000, sec: it.sec, side: !!EX[it.ex].side };
}
function startHold(ii, si) {
  const b = curBlock(); const it = b.items[ii]; const now = Date.now();
  const v = it.sets[si].v; const two = !!EX[it.id].side;
  active.timer = { type: 'hold', ii, si, startAt: now + 3000, end: now + 3000 + (two ? v * 2 + SIDE_GAP : v) * 1000, sec: v, two };
}
function startRestAfter(b, ii) {
  const a = active; const it = b.items[ii]; const now = Date.now();
  const ns = it.sets.findIndex(s => !s.done);
  if (ns >= 0) { a.timer = { type: 'rest', end: now + it.rest * 1000, next: 'set ' + (ns + 1) + ' van ' + exName(it.id), ii }; return; }
  let j = b.items.findIndex((x, k) => k > ii && x.sets.some(s => !s.done));
  if (j < 0) j = b.items.findIndex(x => x.sets.some(s => !s.done));
  if (j >= 0) { a.timer = { type: 'trans', end: now + b.trans * 1000, next: exName(b.items[j].id), ii: j }; return; }
  a.timer = null;
  toast('Alle sets gedaan. Top!');
}
function scrollToCard(ii) {
  const el = $('#sc-' + ii); const body = $('.run-body');
  if (el && body) body.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' });
}

function timerDone() {
  const a = active; const t = a.timer; const b = curBlock();
  a.timer = null;
  if (t.type === 'item') {
    b.items[t.ii].done = true;
    beep(880, 0.3); buzz([200]);
    if (t.chain) { const n = b.items.findIndex(i => !i.done); if (n >= 0) startItemTimer(n, true); else toast(b.title + ' klaar!'); }
  } else if (t.type === 'hold') {
    b.items[t.ii].sets[t.si].done = true;
    beep(880, 0.3); buzz([250]);
    startRestAfter(b, t.ii);
  } else {
    beep(880, 0.3); buzz([200, 100, 200]);
  }
  saveActive(); renderRunner();
  if (a.timer && a.timer.type === 'trans') scrollToCard(a.timer.ii);
}

function tick() {
  const a = active; if (!a) return;
  const b = curBlock(); const now = Date.now();
  if (b && b.phases && a.running) {
    let changed = false;
    while (a.running && now >= a.tEnd) { phaseEnd(b); changed = true; }
    if (a.running) {
      const ph = b.phases[b.pi];
      const s = Math.ceil((a.tEnd - now) / 1000);
      const k = a.bi + ':' + b.pi + ':' + s;
      const planned = !!audioPlan.sig;
      if (s <= 3 && s >= 1 && lastBeep !== k) { lastBeep = k; if (!planned) beep(660, 0.09); }
      if (ph.side && ph.k === 'work') {
        const hk = a.bi + ':' + b.pi + ':half';
        if (s === Math.ceil(ph.sec / 2) && lastBeep !== hk) { lastBeep = hk; if (!planned) { beep(990, 0.08); setTimeout(() => beep(990, 0.08), 160); } buzz([80, 60, 80]); toast('Wissel van kant'); }
      }
    }
    if (changed) { saveActive(); renderRunner(); return; }
  }
  const t = a.timer;
  if (t) {
    if (t.startAt && now < t.startAt) {
      const s = Math.ceil((t.startAt - now) / 1000); const k = 'p' + t.startAt + s;
      if (lastBeep !== k) { lastBeep = k; beep(660, 0.09); }
    } else {
      if (t.startAt && !t.begun) { t.begun = true; beep(1046, 0.25); buzz([150]); }
      let s = Math.ceil((t.end - now) / 1000);
      if (t.type === 'hold' && t.two) {
        const st = holdStage(t, now);
        if ((t.stage || 0) !== st.i) {
          t.stage = st.i;
          if (st.i === 1) { beep(990, 0.12); setTimeout(() => beep(990, 0.12), 180); buzz([80, 60, 80]); toast('Wissel van kant'); }
          if (st.i === 2) { beep(1046, 0.25); buzz([150]); }
        }
        s = Math.ceil(st.rem);
      }
      const k = 't' + t.end + (t.stage || 0) + ':' + s;
      if (s <= 3 && s >= 1 && lastBeep !== k) { lastBeep = k; beep(660, 0.09); }
      if (t.side) {
        const half = Math.ceil(t.sec / 2); const hk = 'h' + t.end;
        if (s === half && lastBeep !== hk) { lastBeep = hk; beep(990, 0.08); setTimeout(() => beep(990, 0.08), 160); buzz([80, 60, 80]); toast('Wissel van kant'); }
      }
      if (now >= t.end) { timerDone(); return; }
    }
  }
  updateTimerDisplay();
}

function creditPhase(b, ph, doneSec) {
  if (b.type === 'timed' && ph.k === 'work' && ph.last) b.doneRounds[ph.r - 1] = true;
  if (b.type === 'run' && ph.k === 'run') {
    const sec = doneSec == null ? ph.sec : clamp(Math.round(doneSec), 0, ph.sec);
    b.runSec += sec;
    if (sec >= ph.sec / 2) b.doneRuns++;
  }
}
function phaseEnd(b) {
  const a = active; const ph = b.phases[b.pi];
  creditPhase(b, ph);
  b.pi++;
  if (b.pi >= b.phases.length) {
    b.pi = b.phases.length - 1; b.done = true; a.running = false; a.tLeft = null;
    if (!audioPlan.sig) { beep(523, 0.18); setTimeout(() => beep(784, 0.35), 200); }
    buzz([300, 100, 300]);
    return;
  }
  a.tEnd += b.phases[b.pi].sec * 1000;
  const n = b.phases[b.pi];
  if (!audioPlan.sig) beep(n.k === 'work' || n.k === 'run' ? 1046 : 740, 0.28);
  buzz(n.k === 'work' || n.k === 'run' ? [200] : [100, 80, 100]);
}

function finalizeRecord() {
  const a = active; const f = a.fin || {};
  const rec = { id: uid(), date: new Date().toISOString(), wid: a.wid, name: WORKOUTS[a.wid].name, len: a.len, dur: Math.round((Date.now() - a.started) / 1000), rating: f.rating || 0, pain: !!f.pain, note: (f.note || '').trim(), blocks: [] };
  if (a.deload) rec.deload = true;
  const km = parseNum(f.km);
  if (km > 0) rec.km = Math.round(km * 100) / 100;
  for (const b of a.blocks) {
    if (b.type === 'timed') rec.blocks.push({ type: 'timed', key: b.key, title: b.title, lvl: b.lvl, work: b.work, rest: b.rest, rounds: b.rounds, done: b.doneRounds.filter(Boolean).length, n: b.ex.length, ex: b.ex.slice() });
    if (b.type === 'sets') rec.blocks.push({ type: 'sets', title: b.title, items: b.items.map(it => ({ id: it.id, orig: it.orig, kind: it.kind, target: it.target, w: it.w, planned: it.planned, rest: it.rest, sets: it.sets.filter(s => s.done).map(s => s.v) })) });
    if (b.type === 'run') rec.blocks.push({ type: 'run', lvl: b.lvl, run: b.run, walk: b.walk, reps: b.reps, done: b.doneRuns, runSec: b.runSec });
    if (b.type === 'check') rec.blocks.push({ type: 'check', title: b.title, done: b.items.filter(i => i.done).length, n: b.items.length });
  }
  return rec;
}

const RUN_MILESTONES = [300, 600, 900, 1200, 1500, 1800];
function findRecords(rec) {
  if (rec.deload) return [];
  const prev = realSessions().filter(s => s.id !== rec.id);
  const out = [];
  for (const b of rec.blocks) {
    if (b.type === 'sets') for (const it of b.items) {
      if (!it.sets.length) continue;
      const old = []; prev.forEach(s => s.blocks.forEach(x => { if (x.type === 'sets') x.items.forEach(y => { if (y.id === it.id && y.sets.length) old.push(y); }); }));
      if (!old.length) continue;
      const best = Math.max(...it.sets), was = Math.max(...old.map(y => Math.max(...y.sets)));
      const unit = it.kind === 'time' ? ' s' : ' herhalingen';
      if (best > was && best > it.target) out.push(exName(it.id) + ': ' + best + unit + (EX[it.id].side ? ' per kant' : '') + ' in één set, meer dan gevraagd');
      const wMax = Math.max(0, ...old.map(y => y.w || 0));
      if (it.w && it.w > wMax) out.push(exName(it.id) + ': voor het eerst met ' + num(it.w) + ' kg');
    }
    if (b.type === 'run' && b.done) {
      const longest = Math.max(0, ...prev.flatMap(s => s.blocks.filter(x => x.type === 'run' && x.done).map(x => x.run)));
      const m = RUN_MILESTONES.filter(x => b.run >= x && longest < x).pop();
      if (m) out.push('Mijlpaal: ' + (m / 60) + ' minuten aan één stuk hardgelopen!');
    }
  }
  if (rec.km) { const old = prev.filter(s => s.km).map(s => s.km); if (old.length && rec.km > Math.max(...old)) out.push('Verste afstand tot nu toe: ' + num(rec.km) + ' km'); }
  return out;
}
function addSugg(s) {
  state.sugg = state.sugg.filter(x => !(x.t === s.t && x.key === s.key));
  s.id = uid(); state.sugg.push(s);
}

function nextExStep(id, p) {
  const d = EX_DEFAULTS[id] || { min: 10, max: 15 }; const e = EX[id];
  if (e.kind === 'time') {
    if (p.sec + 5 <= d.max) return { sec: p.sec + 5 };
    if (p.sets < 3) return { sets: p.sets + 1, sec: d.min };
    return null;
  }
  if (p.reps < d.max) return { reps: Math.min(d.max, p.reps + 2) };
  if (e.db || e.dbOpt) { const nw = avail().find(w => w > (p.w || 0)); if (nw) return { w: nw, reps: d.min }; }
  if (p.sets < 3) return { sets: p.sets + 1, reps: d.min };
  return null;
}

function goodNeeded(rec) {
  const prev = state.sessions.filter(s => s.id !== rec.id && s.wid === rec.wid && !s.deload && s.date < rec.date).pop();
  if (!prev) return 2;
  return (new Date(rec.date) - new Date(prev.date)) / DAY >= 12 ? 1 : 2;
}
function evaluate(rec) {
  if (rec.deload) return [];
  const need = goodNeeded(rec);
  const good = rec.rating > 0 && rec.rating <= 2;
  const hard = rec.rating === 4 || rec.pain;
  const out = [];
  for (const b of rec.blocks) {
    if (b.type === 'timed') {
      const p = getTimed(b.key); const lad = ladderFor(b.key);
      if (b.lvl !== p.lvl) continue;
      if (hard) {
        p.ok = 0;
        if (p.lvl > 0) out.push({ t: 'timed', key: b.key, dir: 'down', to: { lvl: p.lvl - 1 }, title: b.title + ': stapje terug?', text: fmtLadder(lad[p.lvl]) + ' → ' + fmtLadder(lad[p.lvl - 1]), why: rec.pain ? 'Je gaf pijn of klachten aan. Een lichtere versie geeft je lichaam tijd.' : 'Het voelde te zwaar. Met iets minder houd je het vol.' });
      } else if (rec.len === 'kort') {
      } else if (good && b.done >= b.rounds) {
        p.ok++;
        if (p.ok >= need || rec.rating === 1) {
          if (p.lvl < lad.length - 1) out.push({ t: 'timed', key: b.key, dir: 'up', to: { lvl: p.lvl + 1 }, title: b.title + ': zwaarder', text: fmtLadder(lad[p.lvl]) + ' → ' + fmtLadder(lad[p.lvl + 1]), why: 'Je haalde alle rondes en het voelde goed te doen.' });
          else if (!p.maxShown) { p.maxShown = true; out.push({ t: 'max', key: b.key, dir: 'info', title: b.title + ': hoogste niveau bereikt', text: 'Je doet nu ' + fmtLadder(lad[p.lvl]) + '. Zwaarder dan dit wordt het niet vanzelf.', why: 'Wil je meer? Kies Lang voor een extra ronde, wissel een oefening voor een pittiger alternatief' + (state.settings.impact ? '' : ', of zet springoefeningen aan bij Meer') + '.' }); }
        }
      } else p.ok = 0;
    }
    if (b.type === 'sets') {
      for (const it of b.items) {
        const p = getEx(it.id);
        const cur = it.kind === 'time' ? p.sec : p.reps;
        if (it.target !== cur) continue;
        if ((it.w || 0) !== (p.w || 0)) { if (it.sets.length) { p.w = it.w; p.ok = 0; } continue; }
        const allHit = it.sets.length >= it.planned && it.sets.every(v => v >= it.target);
        if (hard) { p.ok = 0; continue; }
        if (rec.len === 'kort') continue;
        if (allHit && rec.rating <= 3) {
          p.ok++;
          if (p.ok >= (rec.rating === 3 ? 2 : need) || rec.rating === 1) {
            const to = nextExStep(it.id, p);
            if (to) { p.maxShown = false; const np = Object.assign({}, p, to); out.push({ t: 'ex', key: it.id, dir: 'up', to, title: exName(it.id) + ': zwaarder', text: fmtEx(it.id, p) + ' → ' + fmtEx(it.id, np), why: to.w ? 'Je haalde alle herhalingen: tijd voor een zwaardere dumbbell.' : 'Je haalde alle sets met het doelaantal.' }); }
            else if (!p.maxShown) { p.maxShown = true; const e = EX[it.id]; out.push({ t: 'max', key: it.id, dir: 'info', title: exName(it.id) + ': hoogste stap bereikt', text: 'Je zit op ' + fmtEx(it.id, p) + '. Verder gaat de opbouw hier niet vanzelf.', why: (e.db || e.dbOpt) ? 'Heb je zwaardere dumbbells? Zet ze aan bij Meer → Mijn dumbbells, dan gaat de opbouw verder. Of wissel voor een pittiger alternatief.' : 'Wissel voor een pittiger alternatief, of zak langzamer (3 tellen omlaag) voor extra uitdaging.' }); }
          }
        } else if (!allHit) p.ok = 0;
      }
    }
    if (b.type === 'run') {
      const p = state.prog.run;
      if (b.lvl !== p.lvl) continue;
      if (rec.pain) {
        p.ok = 0;
        out.push({ t: 'run', key: 'run', dir: 'down', to: { lvl: Math.max(0, p.lvl - 1) }, title: 'Loopschema: rustiger aan', text: p.lvl > 0 ? 'Niveau ' + (p.lvl + 1) + ' → niveau ' + p.lvl + ' (' + fmtRun(RUN_LEVELS[p.lvl - 1]) + ')' : 'Blijf op niveau 1', why: 'Je gaf pijn of klachten aan. Neem minstens twee rustdagen, en blijft de pijn: laat het nakijken.' });
      } else if (good && b.done >= b.reps) {
        p.ok++;
        if (p.ok >= 2 || rec.rating === 1) {
          if (p.lvl < RUN_LEVELS.length - 1) out.push({ t: 'run', key: 'run', dir: 'up', to: { lvl: p.lvl + 1 }, title: 'Loopschema: volgend niveau', text: 'Niveau ' + (p.lvl + 2) + ': ' + fmtRun(RUN_LEVELS[p.lvl + 1]), why: 'Je hebt dit niveau goed afgerond. Twijfel je? Herhaal het gerust nog een keer.' });
          else if (!p.maxShown) { p.maxShown = true; out.push({ t: 'max', key: 'run', dir: 'info', title: 'Loopschema voltooid!', text: 'Je loopt ' + fmtRun(RUN_LEVELS[p.lvl]) + '. Knap gedaan!', why: 'Houd dit vast door twee keer per week te lopen. Wil je verder? Loop af en toe iets sneller of verder, en leg extra loopjes vast als losse activiteit.' }); }
        }
      } else p.ok = 0;
    }
  }
  out.forEach(addSugg);
  return out;
}

function applySugg(id) {
  const s = state.sugg.find(x => x.id === id); if (!s) return;
  if (s.t === 'timed') { const p = getTimed(s.key); p.lvl = s.to.lvl; p.ok = 0; if (s.dir === 'down') p.maxShown = false; }
  if (s.t === 'ex') { const p = getEx(s.key); Object.assign(p, s.to); p.ok = 0; }
  if (s.t === 'run') { state.prog.run.lvl = s.to.lvl; state.prog.run.ok = 0; if (s.dir === 'down') state.prog.run.maxShown = false; }
  state.sugg = state.sugg.filter(x => x.id !== id);
  save();
}
function laterSugg(id) {
  const s = state.sugg.find(x => x.id === id); if (!s) return;
  if (s.dir === 'up') {
    if (s.t === 'timed') getTimed(s.key).ok = 1;
    if (s.t === 'ex') getEx(s.key).ok = 1;
    if (s.t === 'run') state.prog.run.ok = 1;
  }
  state.sugg = state.sugg.filter(x => x.id !== id);
  save();
}

function lineChart(pts, opt = {}) {
  if (!pts.length) return '<div class="empty small">Nog geen gegevens</div>';
  pts = pts.slice(-20);
  const W = 340, H = 170, L = 34, R = 10, T = 14, B = 26;
  const ys = pts.map(p => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (opt.zero) min = Math.min(0, min);
  const ints = ys.every(v => Number.isInteger(v));
  if (ints) {
    min = Math.max(opt.zero ? 0 : 0, Math.floor(min) - 1); max = Math.ceil(max) + 1;
    const step = Math.max(1, Math.ceil((max - min) / 3)); max = min + 3 * step;
  } else {
    if (min === max) { min -= 1; max += 1; }
    const padv = (max - min) * 0.12; min = opt.zero ? min : min - padv; max += padv;
  }
  const x = i => L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (pts.length - 1));
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  let g = '';
  for (let i = 0; i <= 3; i++) {
    const v = min + (max - min) * i / 3; const yy = y(v);
    g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text class="axis" x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + num(Math.round(v * 10) / 10) + '</text>';
  }
  const idx = pts.length <= 3 ? pts.map((_, i) => i) : [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
  idx.forEach(i => { g += '<text class="axis" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(pts[i].x) + '</text>'; });
  const path = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1)).join(' ');
  const dots = pts.map((p, i) => '<circle class="pt" r="3.5" cx="' + x(i) + '" cy="' + y(p.y) + '"/>').join('');
  const lp = pts[pts.length - 1];
  const lab = '<text class="val" x="' + Math.min(x(pts.length - 1), W - R - 4) + '" y="' + (y(lp.y) - 9) + '" text-anchor="end">' + num(lp.y) + (opt.unit || '') + '</text>';
  const band = pts.length === 1 ? W - L - R : (W - L - R) / (pts.length - 1);
  const hits = pts.map((p, i) => '<rect class="hit" x="' + (x(i) - band / 2) + '" y="0" width="' + band + '" height="' + H + '" data-tip="' + esc(p.x + ': ' + num(p.y) + (opt.unit || '')) + '" data-cx="' + (x(i) / W) + '" data-cy="' + (y(p.y) / H) + '"/>').join('');
  return chartWrap('<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.label || 'grafiek') + '">' + g + '<path class="ln" d="' + path + '"/>' + dots + lab + hits + '</svg>');
}
function chartWrap(svg) { return '<div class="chart-wrap">' + svg + '<div class="ctip" hidden></div></div>'; }
function barChart(labels, vals, opt = {}) {
  const W = 340, H = opt.h || 170, L = 30, R = 8, T = 16, B = 26;
  const max = Math.max(1, ...vals, opt.goal || 0);
  const bw = (W - L - R) / vals.length;
  let g = '';
  for (let i = 0; i <= 2; i++) { const v = max * i / 2; const yy = T + (H - T - B) * (1 - v / max); g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text class="axis" x="' + (L - 5) + '" y="' + (yy + 4) + '" text-anchor="end">' + Math.round(v) + '</text>'; }
  vals.forEach((v, i) => {
    const h = (H - T - B) * v / max; const xx = L + i * bw + bw * 0.18;
    g += '<rect class="bar' + (opt.cls ? ' ' + opt.cls : '') + (opt.goal && v >= opt.goal * (opt.goalHit || 1) ? ' hitgoal' : '') + '" rx="4" x="' + xx + '" y="' + (H - B - h) + '" width="' + bw * 0.64 + '" height="' + Math.max(h, v ? 2 : 0) + '"/>';
    if (v && !opt.noVals) g += '<text class="val" x="' + (xx + bw * 0.32) + '" y="' + (H - B - h - 4) + '" text-anchor="middle">' + v + '</text>';
    if (opt.allLabels || i % 2 === (vals.length - 1) % 2) g += '<text class="axis" x="' + (xx + bw * 0.32) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
    g += '<rect class="hit" x="' + (L + i * bw) + '" y="0" width="' + bw + '" height="' + H + '" data-tip="' + esc((opt.tips ? opt.tips[i] : labels[i]) + ': ' + num(v) + (opt.unit || '')) + '" data-cx="' + ((xx + bw * 0.32) / W) + '" data-cy="' + ((H - B - h) / H) + '"/>';
  });
  if (opt.goal) { const gy = T + (H - T - B) * (1 - opt.goal / max); g += '<line class="goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/>'; }
  return chartWrap('<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.label || 'grafiek') + '">' + g + '</svg>');
}

function viewProgress() {
  setTitle('Voortgang');
  const tabs = [['overview', 'Overzicht'], ['ex', 'Oefeningen'], ['hist', 'Historie'], ['weight', 'Gewicht']];
  let h = '<div class="seg" style="margin-bottom:16px">' + tabs.map(([k, t]) => '<button class="' + (ui.progTab === k ? 'on' : '') + '" data-action="progTab" data-v="' + k + '">' + t + '</button>').join('') + '</div>';
  if (ui.progTab === 'overview') h += progOverview();
  if (ui.progTab === 'ex') h += progExercises();
  if (ui.progTab === 'hist') h += progHistory();
  if (ui.progTab === 'weight') h += progWeight();
  return h;
}

function shortDate(iso) { const d = new Date(iso); return d.getDate() + '/' + (d.getMonth() + 1); }

function progOverview() {
  const all = state.sessions; const S = realSessions();
  if (!all.length) return '<div class="card empty">Nog geen trainingen. Na je eerste training zie je hier je voortgang.</div>';
  const now = new Date();
  const month = all.filter(s => { const d = new Date(s.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const total = all.reduce((t, s) => t + s.dur, 0);
  let longest = 0;
  S.forEach(s => s.blocks.forEach(b => { if (b.type === 'run' && b.done) longest = Math.max(longest, b.run); }));
  let h = '<div class="stat-grid"><div class="stat"><b>' + all.length + '</b><span>trainingen totaal</span></div><div class="stat"><b>' + month + '</b><span>deze maand</span></div><div class="stat"><b>' + fmtMin(total) + '</b><span>getraind</span></div><div class="stat"><b>' + (longest ? fmtRunSec(longest) : '–') + '</b><span>record aaneen gelopen</span></div></div>';
  if (all.length !== S.length) h += '<p class="tiny muted" style="margin:8px 4px 0">Rustweektrainingen tellen wel mee in de totalen, maar niet in records en grafieken.</p>';
  const sow = startOfWeek().getTime(); const labels = [], vals = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date(sow); d.setDate(d.getDate() - 7 * i);
    const d2 = new Date(d); d2.setDate(d2.getDate() + 7);
    const s = d.getTime(), e = d2.getTime(); labels.push(d.getDate() + '/' + (d.getMonth() + 1));
    vals.push(Math.round(S.filter(x => { const t = new Date(x.date).getTime(); return t >= s && t < e; }).reduce((a, x) => a + x.dur, 0) / 60));
  }
  h += '<div class="card" style="margin-top:14px"><h3>Minuten per week</h3><p class="tiny muted" style="margin-bottom:6px">Laatste 10 weken (week begint op maandag)</p>' + barChart(labels, vals, { unit: ' min', label: 'Minuten per week' }) + '</div>';
  const work = [];
  S.forEach(s => s.blocks.forEach(b => { if (b.type === 'timed' && (b.key === 'A1' || b.key === 'C1')) work.push({ x: shortDate(s.date), y: Math.round(b.done * b.n * b.work / 6) / 10, k: b.key }); }));
  const A = work.filter(p => p.k === 'A1'), C = work.filter(p => p.k === 'C1');
  h += '<div class="card"><h3>Conditie: actieve werktijd</h3><p class="tiny muted" style="margin-bottom:6px">Minuten echt bewegen per training (rondes × oefeningen × werktijd)</p>';
  h += '<p class="small" style="font-weight:700;margin-top:8px">Conditiecircuit (A)</p>' + lineChart(A, { unit: ' min', label: 'Werktijd circuit' });
  h += '<p class="small" style="font-weight:700;margin-top:8px">HIIT (C)</p>' + lineChart(C, { unit: ' min', label: 'Werktijd HIIT' }) + '</div>';
  const runs = [];
  S.forEach(s => s.blocks.forEach(b => { if (b.type === 'run') runs.push({ x: shortDate(s.date), y: Math.round(b.runSec / 6) / 10 }); }));
  h += '<div class="card"><h3>Hardlopen: minuten gelopen</h3><p class="tiny muted" style="margin-bottom:6px">Totaal hardgelopen per loopsessie (zonder wandelstukken). Nu op niveau ' + (state.prog.run.lvl + 1) + '.</p>' + lineChart(runs, { unit: ' min', label: 'Minuten gelopen' }) + '</div>';
  const km = S.filter(s => s.km).map(s => ({ x: shortDate(s.date), y: s.km }));
  if (km.length) h += '<div class="card"><h3>Afstand</h3>' + lineChart(km, { unit: ' km', label: 'Afstand' }) + '</div>';
  return h;
}

function exHistory(id) {
  const out = [];
  realSessions().forEach(s => s.blocks.forEach(b => {
    if (b.type !== 'sets') return;
    b.items.forEach(it => { if (it.id === id && it.sets.length) out.push({ date: s.date, best: Math.max(...it.sets), w: it.w || 0, sets: it.sets, kind: it.kind }); });
  }));
  return out;
}

function progExercises() {
  const ids = [];
  realSessions().forEach(s => s.blocks.forEach(b => { if (b.type === 'sets') b.items.forEach(it => { if (it.sets.length && !ids.includes(it.id)) ids.push(it.id); }); }));
  if (!ids.length) return '<div class="card empty">Zodra je een krachttraining (B of C) hebt gedaan, zie je hier per oefening je voortgang en records.</div>';
  if (!ui.exSel || !ids.includes(ui.exSel)) ui.exSel = ids[0];
  const id = ui.exSel; const hist = exHistory(id); const e = EX[id];
  let h = '<label class="field"><span>Oefening</span><select class="input" data-action="exSel">' + ids.map(x => '<option value="' + x + '" ' + (x === id ? 'selected' : '') + '>' + esc(exName(x)) + '</option>').join('') + '</select></label>';
  const p = getEx(id);
  const best = Math.max(...hist.map(x => x.best)); const heavy = Math.max(...hist.map(x => x.w));
  const bestAtHeavy = heavy ? Math.max(...hist.filter(x => x.w === heavy).map(x => x.best)) : 0;
  h += '<div class="stat-grid" style="margin-bottom:14px"><div class="stat"><b>' + best + (e.kind === 'time' ? ' s' : '') + '</b><span>record in één set</span></div><div class="stat"><b>' + (heavy ? num(heavy) + ' kg' : '–') + '</b><span>' + (heavy ? 'zwaarst (' + bestAtHeavy + (e.kind === 'time' ? ' s' : '×') + ')' : 'zonder gewicht') + '</span></div></div>';
  h += '<div class="card"><div class="row between"><h3>' + esc(exName(id)) + '</h3><span class="pill">nu: ' + esc(fmtEx(id, p)) + '</span></div>';
  h += '<p class="small" style="font-weight:700;margin-top:10px">' + (e.kind === 'time' ? 'Langste set (sec)' : 'Meeste herhalingen in één set') + '</p>' + lineChart(hist.map(x => ({ x: shortDate(x.date), y: x.best })), { unit: e.kind === 'time' ? 's' : '', label: 'Beste set' });
  if (hist.some(x => x.w)) h += '<p class="small" style="font-weight:700;margin-top:10px">Gewicht (kg)</p>' + lineChart(hist.map(x => ({ x: shortDate(x.date), y: x.w })), { unit: ' kg', label: 'Gewicht', zero: true });
  h += '</div><div class="card flat"><h3>Laatste keren</h3>' + hist.slice(-6).reverse().map(x => '<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>' + fmtDate(x.date) + '</span><span>' + x.sets.join(' · ') + (x.kind === 'time' ? ' s' : '') + (x.w ? ' @ ' + num(x.w) + ' kg' : '') + '</span></div>').join('') + '</div>';
  return h;
}

function sessionDetail(s) {
  let h = '<ul class="hist-detail" style="padding-left:18px;margin:10px 0">';
  s.blocks.forEach(b => {
    if (b.type === 'check') h += '<li><b>' + esc(b.title) + ':</b> ' + b.done + '/' + b.n + ' onderdelen</li>';
    if (b.type === 'timed') h += '<li><b>' + esc(b.title) + ':</b> ' + b.done + '/' + b.rounds + ' rondes · ' + b.work + '/' + b.rest + ' s</li>';
    if (b.type === 'run') h += '<li><b>Lopen:</b> niveau ' + (b.lvl + 1) + ' · ' + b.done + '/' + b.reps + ' looprondes (' + fmtMin(b.runSec) + ' gelopen)</li>';
    if (b.type === 'sets') b.items.forEach(it => { h += '<li>' + esc(exName(it.id)) + ': ' + (it.sets.length ? it.sets.join(' · ') + (it.kind === 'time' ? ' s' : '') : 'overgeslagen') + (it.w ? ' @ ' + num(it.w) + ' kg' : '') + '</li>'; });
    if (b.type === 'free') h += '<li>' + esc(b.what) + '</li>';
  });
  h += '</ul>';
  if (s.note) h += '<p class="small" style="margin-bottom:8px">📝 ' + esc(s.note) + '</p>';
  return h;
}

function progHistory() {
  if (!state.sessions.length) return '<div class="card empty">Nog geen trainingen opgeslagen.</div>';
  return state.sessions.slice().reverse().map(s => {
    const r = RATINGS.find(x => x.v === s.rating);
    return '<details class="card hist-item"><summary><div class="row">' + (WORKOUTS[s.wid] ? workoutBadge(s.wid) : '<span class="badge c-sun">•</span>') + '<div class="grow"><b>' + esc(s.name) + '</b><p class="small muted">' + fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + fmtMin(s.dur) + (s.km ? ' · ' + num(s.km) + ' km' : '') + (s.len && s.wid !== 'L' && WORKOUTS[s.wid] ? ' · ' + LEN[s.len] : '') + '</p></div>' + (s.deload ? deloadPill() : r ? '<span class="pill">' + r.t + '</span>' : '') + '</div></summary>' +
      sessionDetail(s) + (s.pain ? '<p class="small" style="color:var(--warn);margin-bottom:8px">Pijn of klachten aangegeven</p>' : '') +
      '<div class="row"><button class="btn sm" data-action="editSession" data-id="' + s.id + '">✎ Bewerk</button><button class="btn sm ghost" data-action="delSession" data-id="' + s.id + '">Verwijderen</button></div></details>';
  }).join('');
}

function openEdit(id) {
  const s = state.sessions.find(x => x.id === id); if (!s) return;
  const c = clone(s);
  c.blocks.forEach(b => { if (b.type === 'sets') b.items.forEach(it => { it.sets = it.sets.map(v => ({ v, on: true })); }); });
  ui.edit = { id, s: c, durMin: String(Math.round(s.dur / 60)), km: s.km ? num(s.km) : '', note: s.note || '' };
  openSheet(editHtml());
}
function editHtml() {
  const E = ui.edit; const s = E.s;
  let h = '<h2>Training bewerken</h2><p class="small muted" style="margin-bottom:14px">' + esc(s.name) + ' · ' + fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' }) + '</p>';
  h += '<div class="row"><label class="field grow"><span>Duur (min)</span><input class="input" inputmode="numeric" data-ef="durMin" value="' + esc(E.durMin) + '"></label>' + (s.wid === 'L' || s.wid === 'free' ? '<label class="field grow"><span>Afstand (km)</span><input class="input" inputmode="decimal" data-ef="km" value="' + esc(E.km) + '"></label>' : '') + '</div>';
  s.blocks.forEach((b, bi) => {
    if (b.type === 'timed') h += '<div class="card flat"><div class="row between"><b>' + esc(b.title) + ': rondes gedaan</b><div class="stepper"><button data-action="eCount" data-bi="' + bi + '" data-d="-1">−</button><b>' + b.done + '/' + b.rounds + '</b><button data-action="eCount" data-bi="' + bi + '" data-d="1">+</button></div></div></div>';
    if (b.type === 'run') h += '<div class="card flat"><div class="row between"><b>Looprondes gedaan</b><div class="stepper"><button data-action="eCount" data-bi="' + bi + '" data-d="-1">−</button><b>' + b.done + '/' + b.reps + '</b><button data-action="eCount" data-bi="' + bi + '" data-d="1">+</button></div></div></div>';
    if (b.type === 'sets') b.items.forEach((it, ii) => {
      const e = EX[it.id];
      h += '<div class="card flat"><b>' + esc(exName(it.id)) + '</b>';
      if (e.db || e.dbOpt || it.w) {
        const opts = [...new Set((e.dbOpt || !e.db ? [0] : []).concat(avail(), it.w ? [it.w] : []))].sort((a, b) => a - b);
        h += '<div class="wchips">' + opts.map(w => '<button class="' + (it.w === w ? 'on' : '') + '" data-action="eW" data-bi="' + bi + '" data-ii="' + ii + '" data-w="' + w + '">' + (w ? num(w) + ' kg' : 'zonder') + '</button>').join('') + '</div>';
      }
      it.sets.forEach((st, si) => {
        h += '<div class="set-row' + (st.on ? '' : ' off') + '"><span class="lbl">Set ' + (si + 1) + '</span><div class="stepper"><button data-action="eAdj" data-bi="' + bi + '" data-ii="' + ii + '" data-si="' + si + '" data-d="-1">−</button><b>' + st.v + (it.kind === 'time' ? 's' : '') + '</b><button data-action="eAdj" data-bi="' + bi + '" data-ii="' + ii + '" data-si="' + si + '" data-d="1">+</button></div><button class="check ' + (st.on ? 'on' : '') + '" data-action="eChk" data-bi="' + bi + '" data-ii="' + ii + '" data-si="' + si + '" aria-label="Set aan/uit">✓</button></div>';
      });
      h += '<button class="btn sm ghost" data-action="eAddSet" data-bi="' + bi + '" data-ii="' + ii + '" style="margin-top:6px">+ set</button></div>';
    });
  });
  h += '<p class="tiny muted" style="margin:-4px 2px 12px">Een set uitvinken = verwijderen bij opslaan.</p>';
  h += '<div class="field"><span>Hoe voelde het?</span><div class="rating">' + RATINGS.map(r => '<button class="' + (s.rating === r.v ? 'on' : '') + '" data-action="eRate" data-v="' + r.v + '">' + r.t + '</button>').join('') + '</div></div>';
  h += '<label class="switch" style="border:0"><b>Pijn of klachten</b><span class="toggle"><input type="checkbox" data-action="ePain" ' + (s.pain ? 'checked' : '') + '><i></i></span></label>';
  h += '<label class="field"><span>Notitie</span><textarea class="input" data-ef="note">' + esc(E.note) + '</textarea></label>';
  h += '<div class="actions"><button class="btn block primary" data-action="eSave">Opslaan</button><button class="btn block ghost" data-action="closeSheet">Annuleren</button></div>';
  return h;
}
function editRefresh() { openSheet(editHtml(), true); }

function progWeight() {
  const W = state.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  let h = '<div class="card"><h3>Gewicht bijhouden</h3><p class="small muted" style="margin-bottom:12px">Helemaal optioneel. Eén keer per week, op hetzelfde moment (bijv. zaterdagochtend), geeft het eerlijkste beeld.</p>' +
    '<div class="row"><input class="input" type="date" id="wDate" value="' + dateKey() + '" style="flex:1.2"><input class="input" id="wKg" inputmode="decimal" placeholder="kg" style="flex:1"><button class="btn primary" data-action="addWeight">Opslaan</button></div></div>';
  if (W.length) {
    const last = W[W.length - 1];
    const ago = daysSince(last.date + 'T12:00:00');
    h += '<div class="card"><div class="row between"><h3>Verloop</h3><span class="pill">' + (ago <= 0 ? 'vandaag' : ago + ' dagen geleden') + '</span></div>' + lineChart(W.map(x => ({ x: shortDate(x.date + 'T12:00:00'), y: x.kg })), { unit: ' kg', label: 'Gewicht' });
    if (W.length > 1) { const d = Math.round((last.kg - W[0].kg) * 10) / 10; h += '<p class="small muted" style="margin-top:6px">Sinds de eerste meting: ' + (d > 0 ? '+' : '') + num(d) + ' kg</p>'; }
    h += '</div><div class="card flat">' + W.slice().reverse().map(x => '<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="small">' + fmtDate(x.date + 'T12:00:00', { day: 'numeric', month: 'long', year: 'numeric' }) + '</span><div class="row"><b>' + num(x.kg) + ' kg</b><button class="btn sm ghost" data-action="delWeight" data-d="' + x.date + '" aria-label="Verwijderen">✕</button></div></div>').join('') + '</div>';
  }
  h += '<p class="tiny muted" style="margin:0 4px">Gewicht zegt niet alles: door krachttraining kan je lichaam strakker worden terwijl het gewicht gelijk blijft.</p>';
  return h;
}

function meter(val, goal, unit, label, color) {
  const pct = goal ? clamp(val / goal * 100, 0, 100) : 0;
  return '<div class="meter-wrap"><div class="row between small"><b>' + label + '</b><span><b>' + num(Math.round(val)) + '</b>' + (goal ? ' / ' + goal : '') + ' ' + unit + '</span></div><div class="meter"><i style="width:' + pct + '%;background:' + color + '"></i></div>' + (goal ? '<p class="tiny muted">' + (val <= goal ? 'Nog ' + num(Math.round(goal - val)) + ' ' + unit : num(Math.round(val - goal)) + ' ' + unit + ' boven je doel') + '</p>' : '') + '</div>';
}

function viewFood() {
  setTitle('Voeding');
  let h = '<div class="seg" style="margin-bottom:14px">' + [['log', 'Vandaag'], ['meals', 'Maaltijden'], ['tips', 'Tips']].map(([k, t]) => '<button class="' + (ui.foodTab === k ? 'on' : '') + '" data-action="foodTab" data-v="' + k + '">' + t + '</button>').join('') + '</div>';
  if (ui.foodTab === 'tips') return h + TIPS_FOOD.map(t => '<div class="card"><h3>' + esc(t.t) + '</h3><p class="small muted">' + esc(t.b) + '</p></div>').join('');
  if (ui.foodTab === 'log') return h + foodLog();
  const cats = ['Alles', 'Favorieten', 'Ontbijt', 'Lunch', 'Diner', 'Snack', 'Na training'];
  h += '<div class="hscroll">' + cats.map(c => '<button class="chip ' + (ui.foodCat === c ? 'on' : '') + '" data-action="foodCat" data-v="' + c + '">' + (c === 'Favorieten' ? '♥ ' : '') + c + '</button>').join('') + '</div>';
  h += '<p class="tiny muted" style="margin:0 4px 12px">Alle recepten zijn zonder vis en zeevruchten, zonder paddenstoelen en zonder koriander. Eiwit en kcal zijn schattingen per portie.</p>';
  const list = MEALS.filter(m => ui.foodCat === 'Alles' || (ui.foodCat === 'Favorieten' ? state.favs.includes(m.id) : m.cat === ui.foodCat));
  if (!list.length) return h + '<div class="card empty">' + (ui.foodCat === 'Favorieten' ? 'Tik op het hartje bij een recept om het hier te bewaren.' : 'Geen recepten.') + '</div>';
  h += list.map(m => '<details class="card meal"><summary><div class="grow"><b>' + esc(m.name) + '</b><p class="small muted">' + m.cat + ' · ' + m.min + ' min · ' + m.p + ' g eiwit · ' + m.kcal + ' kcal' + (m.serv ? ' (per portie)' : '') + '</p></div><button class="fav ' + (state.favs.includes(m.id) ? 'on' : '') + '" data-action="fav" data-id="' + m.id + '" aria-label="Favoriet">' + (state.favs.includes(m.id) ? '♥' : '♡') + '</button></summary><div class="body">' +
    (m.serv ? '<p class="tiny muted" style="margin-bottom:6px">Recept voor ' + m.serv + ' porties; bewaar de rest voor morgen.</p>' : '') +
    '<p class="small" style="font-weight:700">Nodig</p><ul class="small">' + m.ing.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul><p class="small" style="font-weight:700">Zo maak je het</p><ol class="small">' + m.steps.map(i => '<li>' + esc(i) + '</li>').join('') + '</ol><p class="small muted">💡 ' + esc(m.why) + '</p>' +
    '<button class="btn sm teal" style="margin-top:12px" data-action="addMeal" data-id="' + m.id + '">+ Toevoegen aan vandaag (' + m.p + ' g · ' + m.kcal + ' kcal)</button></div></details>').join('');
  return h;
}

function foodWeek(dk, en) {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(dk + 'T12:00:00'); d.setDate(d.getDate() - i); days.push(dateKey(d)); }
  const tot = days.map(dayTotals);
  const lab = days.map(k => new Date(k + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', ''));
  const tips = days.map(k => fmtDate(k + 'T12:00:00', { weekday: 'short', day: 'numeric', month: 'short' }));
  const filled = tot.filter(t => t.kcal || t.p);
  const avg = filled.length ? { kcal: Math.round(filled.reduce((a, t) => a + t.kcal, 0) / filled.length), p: Math.round(filled.reduce((a, t) => a + t.p, 0) / filled.length) } : null;
  let h = '<div class="section-title">Afgelopen 7 dagen</div><div class="card">';
  if (!filled.length) return h + '<p class="small muted">Nog niets bijgehouden. Na een paar dagen zie je hier je week.</p></div>';
  h += '<p class="small" style="font-weight:700">Calorieën</p>' + barChart(lab, tot.map(t => t.kcal), { unit: ' kcal', goal: en ? en.target : 0, goalHit: 99, h: 130, noVals: true, allLabels: true, tips, cls: 'kcal', label: 'Calorieën per dag' });
  h += '<p class="small" style="font-weight:700;margin-top:6px">Eiwit</p>' + barChart(lab, tot.map(t => Math.round(t.p)), { unit: ' g', goal: en ? en.protein : 0, h: 130, noVals: true, allLabels: true, tips, label: 'Eiwit per dag' });
  h += '<p class="tiny muted" style="margin-top:6px">Gemiddeld op dagen met invoer: <b>' + avg.kcal + ' kcal</b> · <b>' + avg.p + ' g eiwit</b>' + (en ? '. De stippellijn is je dagdoel' + ' (schatting); groen = eiwitdoel gehaald.' : '.') + ' Tik op een staaf voor de waarde.</p></div>';
  return h;
}
function foodLog() {
  const dk = ui.foodDate || dateKey(); const isToday = dk === dateKey();
  const en = energy(); const tt = dayTotals(dk); const items = dayFood(dk);
  const label = isToday ? 'Vandaag' : fmtDate(dk + 'T12:00:00', { weekday: 'long', day: 'numeric', month: 'long' });
  let h = '<div class="row between" style="margin-bottom:12px"><button class="btn sm ghost" data-action="foodDay" data-d="-1" aria-label="Vorige dag">‹</button><b>' + esc(label) + '</b><button class="btn sm ghost" data-action="foodDay" data-d="1" ' + (isToday ? 'disabled' : '') + ' aria-label="Volgende dag">›</button></div>';
  h += '<div class="card">' + meter(tt.kcal, en ? en.target : 0, 'kcal', 'Calorieën', 'var(--accent)') + meter(tt.p, en ? en.protein : 0, 'g', 'Eiwit', 'var(--teal)');
  h += en ? '<p class="tiny muted" style="margin-top:8px">Doelen zijn een schatting op basis van je gegevens bij Meer → Calorieën & eiwit.</p>' : '<p class="small muted" style="margin-top:8px">Vul bij <b>Meer → Calorieën & eiwit</b> je gegevens in voor een persoonlijke schatting van je dagelijkse behoefte.</p><button class="btn sm" data-action="goProfile" style="margin-top:8px">Gegevens invullen</button>';
  h += '</div>';
  h += foodWeek(dk, en);
  h += '<div class="section-title">Snel toevoegen</div><div class="quick-grid">' + QUICK.map((q, i) => '<button class="quick" data-action="quickAdd" data-i="' + i + '"><b>' + esc(q.name) + '</b><span>' + q.p + ' g eiwit · ' + q.kcal + ' kcal</span></button>').join('') + '</div>';
  h += '<div class="section-title">Zelf toevoegen</div><div class="card"><label class="field"><span>Wat</span><input class="input" id="fName" placeholder="bijv. Tosti ham-kaas"></label><div class="row"><label class="field grow"><span>Eiwit (g)</span><input class="input" id="fP" inputmode="decimal" placeholder="0"></label><label class="field grow"><span>Kcal</span><input class="input" id="fK" inputmode="numeric" placeholder="0"></label></div><button class="btn primary block" data-action="customAdd">Toevoegen</button><p class="tiny muted" style="margin-top:8px">Tip: op de verpakking staat eiwit en energie (kcal) per 100 g.</p></div>';
  h += '<div class="section-title">Gegeten</div>';
  h += items.length ? '<div class="card flat">' + items.map(x => '<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="grow"><b class="small">' + esc(x.name) + '</b><div class="tiny muted">' + num(x.p) + ' g eiwit · ' + x.kcal + ' kcal</div></div><button class="btn sm ghost" data-action="delFood" data-id="' + x.id + '" aria-label="Verwijderen">✕</button></div>').join('') + '</div>' : '<div class="card empty small">Nog niets toegevoegd.</div>';
  return h;
}

function viewMore() {
  setTitle('Meer');
  const s = state.settings; const pr = state.profile;
  const co = cloudOn();
  let h = updateBanner() + cloudCard() + '<div class="section-title" id="backupSec">' + (co ? 'Extra back-up' : 'Back-up') + '</div><div class="card">';
  h += '<p class="small muted" style="margin-bottom:12px">' + (co ? 'Je gegevens worden automatisch in de cloud opgeslagen. Wil je daarnaast een eigen kopie, maak dan af en toe een extra back-up. ' : 'Je gegevens staan alleen op deze telefoon. Maak regelmatig een back-up, bijvoorbeeld naar Google Drive, of zet hierboven cloud-opslag aan. ') + (state.lastBackup ? 'Laatste back-up: <b>' + fmtDate(state.lastBackup, { day: 'numeric', month: 'long', year: 'numeric' }) + '</b>.' : '<b>Nog geen back-up gemaakt.</b>') + '</p>';
  h += '<button class="btn primary block" data-action="shareBackup">' + (co ? 'Extra back-up delen' : 'Back-up delen (bijv. Google Drive)') + '</button><div class="row" style="margin-top:8px"><button class="btn grow" data-action="downloadBackup">Downloaden</button><button class="btn grow" data-action="copyBackup">Kopieer als tekst</button></div>';
  h += '<p class="small" style="font-weight:700;margin:16px 0 8px">Terugzetten</p><div class="row"><button class="btn grow ghost" data-action="pickRestore">Kies back-upbestand</button><button class="btn grow ghost" data-action="pasteRestore">Plak tekst</button></div></div>';

  const en = energy(); const lastKg = profileKg();
  h += '<div class="section-title" id="profileSec">Calorieën & eiwit</div><div class="card">';
  h += '<div class="row"><label class="field grow"><span>Gewicht (kg)</span><input class="input" data-pf="kg" inputmode="decimal" value="' + esc(pr.kg ? num(pr.kg) : '') + '" placeholder="' + esc(lastKg ? num(lastKg) : 'bijv. 68') + '"></label><label class="field grow"><span>Lengte (cm)</span><input class="input" data-pf="cm" inputmode="numeric" value="' + esc(pr.cm || '') + '" placeholder="bijv. 170"></label><label class="field grow"><span>Leeftijd</span><input class="input" data-pf="age" inputmode="numeric" value="' + esc(pr.age || '') + '" placeholder="jaren"></label></div>';
  if (!pr.kg && lastKg) h += '<p class="tiny muted" style="margin:-8px 0 12px">Leeg gelaten? Dan gebruikt de app je laatst gelogde gewicht (' + num(lastKg) + ' kg).</p>';
  h += '<div class="field"><span>Geslacht</span><div class="seg"><button class="' + (pr.sex === 'v' ? 'on' : '') + '" data-action="setSex" data-v="v">Vrouw</button><button class="' + (pr.sex === 'm' ? 'on' : '') + '" data-action="setSex" data-v="m">Man</button></div></div>';
  h += '<label class="field"><span>Hoe actief ben je?</span><select class="input" data-pf="act">' + ACTIVITY.map(([f, t, d]) => '<option value="' + f + '" ' + (pr.act === f ? 'selected' : '') + '>' + t + ': ' + d + '</option>').join('') + '</select></label>';
  h += '<label class="field"><span>Doel</span><select class="input" data-pf="goal">' + GOALS.map(([g, t]) => '<option value="' + g + '" ' + (pr.goal === g ? 'selected' : '') + '>' + t + '</option>').join('') + '</select></label>';
  if (en) {
    h += '<div class="energy"><div class="row between"><span class="small">Ruststofwisseling</span><b>' + en.bmr + ' kcal</b></div><div class="row between"><span class="small">Dagelijkse behoefte</span><b>' + en.tdee + ' kcal</b></div><div class="row between big"><span>Jouw dagdoel</span><b>' + en.target + ' kcal</b></div><div class="row between"><span class="small">Eiwit (1,2–1,6 g per kg)</span><b>± ' + en.protein + ' g</b></div></div>';
    if (en.floored) h += '<p class="tiny" style="color:var(--warn);margin-top:6px">Het doel is afgerond naar je ruststofwisseling: minder eten dan dat raden we af.</p>';
  } else h += '<p class="small muted">Vul gewicht, lengte en leeftijd in voor een schatting.</p>';
  h += '<p class="tiny muted" style="margin-top:10px"><b>Let op: dit is een schatting.</b> Berekend met de Mifflin-St Jeor-formule × een activiteitsfactor. Je werkelijke behoefte kan per persoon honderden kcal verschillen. Gebruik het als richtlijn en stuur bij op hoe je je voelt en hoe je gewicht verloopt.</p></div>';

  h += '<div class="section-title">Gewisselde oefeningen</div><div class="card">';
  const sw = Object.entries(state.swaps);
  h += sw.length ? sw.map(([o, t]) => '<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="grow small"><span class="muted">' + esc(exName(o)) + '</span> → <b>' + esc(exName(t)) + '</b></div><button class="btn sm ghost" data-action="unswap" data-orig="' + o + '">Terugzetten</button></div>').join('') + (sw.length > 1 ? '<button class="btn sm ghost block" data-action="unswapAll" style="margin-top:10px">Alles terugzetten</button>' : '') : '<p class="small muted">Nog niets gewisseld. Tijdens of voor een training kun je bij elke oefening op ⇄ Wissel tikken.</p>';
  h += '</div>';

  h += '<div class="section-title">Instellingen</div><div class="card">';
  h += '<label class="field"><span>Naam</span><input class="input" data-action="setName" value="' + esc(s.name) + '" placeholder="optioneel"></label>';
  h += '<div class="field"><span>Thema</span><div class="seg">' + [['auto', 'Automatisch'], ['light', 'Licht'], ['dark', 'Donker']].map(([k, t]) => '<button class="' + (s.theme === k ? 'on' : '') + '" data-action="setTheme" data-v="' + k + '">' + t + '</button>').join('') + '</div></div>';
  h += '<div class="field"><span>Mijn dumbbells</span><div class="chips">' + WEIGHT_OPTIONS.map(w => '<button class="chip ' + (s.weights.includes(w) ? 'on' : '') + '" data-action="toggleWeight" data-w="' + w + '">' + num(w) + ' kg</button>').join('') + '</div><p class="tiny muted" style="margin-top:6px">De app stelt een zwaardere dumbbell voor zodra je de herhalingen makkelijk haalt, maar alleen uit deze gewichten.</p></div>';
  h += '<div class="field"><span>Weekplan</span><div class="seg"><button class="' + (s.plan === 'mix' ? 'on' : '') + '" data-action="setPlan" data-v="mix">Thuis + hardlopen</button><button class="' + (s.plan === 'thuis' ? 'on' : '') + '" data-action="setPlan" data-v="thuis">Alleen thuis</button></div></div>';
  h += '<div class="field"><span>Weekdoel</span><div class="seg">' + [1, 2, 3, 4].map(n => '<button class="' + (s.weekGoal === n ? 'on' : '') + '" data-action="setGoal" data-v="' + n + '">' + n + '×</button>').join('') + '</div></div>';
  h += toggleRow('Springoefeningen toestaan', 'Vervangt bij cardio de rustige variant door de springversie (bijv. jumping jacks)', 'impact', s.impact);
  h += toggleRow('Geluid', 'Piepjes bij aftellen en wisselen', 'sound', s.sound);
  h += toggleRow('Trillen', 'Trillen bij elke wissel', 'vibrate', s.vibrate);
  h += '</div>';

  h += '<div class="section-title">App installeren</div><div class="card">';
  if (window.matchMedia('(display-mode: standalone)').matches) h += '<p class="small">De app is geïnstalleerd en werkt ook offline.</p>';
  else {
    if (deferredInstall) h += '<button class="btn teal block" data-action="install" style="margin-bottom:10px">Installeren op beginscherm</button>';
    h += '<p class="small muted">Android (Chrome): tik rechtsboven op ⋮ en kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>. Daarna werkt Fit worden als een gewone app, ook offline.</p>';
  }
  h += '</div>';

  h += '<div class="section-title">Privacy</div><div class="card"><p class="small muted">Fit worden heeft geen account. ' + (co ? 'Je gegevens staan op dit apparaat en als kopie in de cloud (Firebase van Google), alleen te vinden met je persoonlijke code. Een lopende training wordt niet naar de cloud gestuurd.' : 'Zonder cloud-opslag blijft alles wat je invoert in de opslag van deze browser op dit apparaat. Wis je de browsergegevens of verwijder je de app, dan zijn je gegevens weg; daarom de back-up.') + '</p><button class="btn block ghost" data-action="wipeAsk" style="margin-top:12px;color:#c8453a">Alle gegevens wissen</button></div>';
  h += '<p class="tiny muted" style="text-align:center;margin:10px 0">Fit worden · versie 1.8</p>';
  return h;
}
function toggleRow(t, sub, key, on) {
  return '<label class="switch"><div><b>' + esc(t) + '</b><p class="small muted">' + esc(sub) + '</p></div><span class="toggle"><input type="checkbox" data-action="setToggle" data-k="' + key + '" ' + (on ? 'checked' : '') + '><i></i></span></label>';
}

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.setAttribute('content', dark ? '#17141b' : '#f7f3f0'); m.removeAttribute('media'); });
}

const BACKUP_VERSION = 2;
function backupText() { return JSON.stringify({ app: 'fitworden', version: BACKUP_VERSION, exported: new Date().toISOString(), data: state }); }
function backupName() { return 'fitworden-backup-' + dateKey() + '.txt'; }
function markBackup() { state.lastBackup = new Date().toISOString(); save(); render(); }

function confirmBackupSheet(title, text) {
  openSheet('<h2>' + esc(title) + '</h2><p class="muted">' + text + '</p><p class="small muted" style="margin-top:8px">Pas als het bestand buiten deze telefoon staat (bijv. in Google Drive) is het een echte back-up. Dan telt de app hem mee en verdwijnt de herinnering.</p><div class="actions"><button class="btn block primary" data-action="backupConfirm">Het staat veilig: markeer als back-up</button><button class="btn block ghost" data-action="closeSheet">Nog niet</button></div>');
}
async function shareBackup() {
  const txt = backupText();
  let file = null;
  try { file = new File([txt], backupName(), { type: 'text/plain' }); } catch (e) {}
  const canFile = file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] });
  if (canFile) {
    try {
      await navigator.share({ files: [file], title: 'Fit worden back-up' });
      markBackup(); toast('Back-up gedeeld');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  saveFile(txt);
  confirmBackupSheet('Delen lukte niet', 'De deelknop werkt niet in deze browser, dus het back-upbestand <b>' + esc(backupName()) + '</b> is gedownload. Open de app Google Drive, tik op <b>+ → Uploaden</b> en kies het bestand uit Downloads.');
}
function saveFile(txt) {
  const blob = new Blob([txt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = backupName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function downloadBackup() {
  saveFile(backupText());
  confirmBackupSheet('Back-up gedownload', 'Het bestand <b>' + esc(backupName()) + '</b> staat in je Downloads. Zet het daarna in Google Drive (Drive-app: <b>+ → Uploaden</b>).');
}
async function copyBackup() {
  const txt = backupText();
  try {
    await navigator.clipboard.writeText(txt);
    confirmBackupSheet('Back-up gekopieerd', 'De back-up staat op je klembord. Plak hem in een notitie, e-mail aan jezelf of een Google Doc.');
  } catch (e) {
    openSheet('<h2>Kopieer als tekst</h2><p class="small muted">Selecteer alles, kopieer het en plak het in een notitie of e-mail aan jezelf.</p><textarea class="input" id="copyArea" style="min-height:200px" readonly>' + esc(txt) + '</textarea><div class="actions"><button class="btn block primary" data-action="backupConfirm">Gekopieerd en bewaard: markeer als back-up</button><button class="btn block ghost" data-action="closeSheet">Nog niet</button></div>');
    const ta = $('#copyArea'); ta.focus(); ta.select();
  }
}

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function badBlock(b) {
  if (!isObj(b) || typeof b.type !== 'string') return true;
  const n = v => typeof v === 'number' && isFinite(v);
  if (b.type === 'sets') return !Array.isArray(b.items) || b.items.some(it => !isObj(it) || !EX[it.id] || !Array.isArray(it.sets) || !it.sets.every(n));
  if (b.type === 'timed') return !n(b.done) || !n(b.rounds) || !n(b.work) || (b.ex != null && (!Array.isArray(b.ex) || !b.ex.every(id => EX[id])));
  if (b.type === 'run') return !n(b.done) || !n(b.reps) || !n(b.runSec) || !n(b.lvl);
  return false;
}
function parseBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return { err: 'Dit bestand is geen Fit worden back-up (geen leesbare tekst).' }; }
  if (!isObj(o) || o.app !== 'fitworden' || !isObj(o.data)) return { err: 'Dit bestand is geen back-up van Fit worden.' };
  if (+o.version > BACKUP_VERSION) return { err: 'Deze back-up is gemaakt met een nieuwere versie van de app. Werk de app eerst bij.' };
  const d = o.data;
  if (!isObj(d.settings) || !Array.isArray(d.sessions) || !isObj(d.prog)) return { err: 'De back-up is onvolledig of beschadigd.' };
  if ((d.prog.timed && !isObj(d.prog.timed)) || (d.prog.ex && !isObj(d.prog.ex))) return { err: 'De voortgang in de back-up is beschadigd.' };
  const badS = d.sessions.filter(x => !isObj(x) || !x.id || typeof x.date !== 'string' || isNaN(Date.parse(x.date)) || !Array.isArray(x.blocks) || typeof x.dur !== 'number' || !(WORKOUTS[x.wid] || x.wid === 'free') || x.blocks.some(badBlock));
  if (badS.length) return { err: 'De back-up bevat ' + badS.length + ' beschadigde training(en) of onbekende oefeningen.' };
  if (d.food && isObj(d.food) && Object.values(d.food).some(day => !Array.isArray(day) || day.some(x => !isObj(x) || typeof x.kcal !== 'number' || typeof x.p !== 'number'))) return { err: 'De voedingsgegevens in de back-up zijn beschadigd.' };
  if (d.weights && (!Array.isArray(d.weights) || d.weights.some(w => !isObj(w) || typeof w.kg !== 'number' || typeof w.date !== 'string'))) return { err: 'De gewichtsmetingen in de back-up zijn beschadigd.' };
  if (d.food && !isObj(d.food)) return { err: 'De voedingsgegevens in de back-up zijn beschadigd.' };
  return { data: d, exported: o.exported };
}
function restoreFrom(text) {
  const r = parseBackup(String(text || '').trim());
  if (r.err) { openSheet('<h2>Terugzetten lukt niet</h2><p class="muted">' + esc(r.err) + '</p><p class="small muted" style="margin-top:8px">Je huidige gegevens zijn niet aangepast. Kies het bestand dat begint met <b>fitworden-backup-</b>.</p><div class="actions"><button class="btn block primary" data-action="closeSheet">Oké</button></div>'); return; }
  restoreFrom.pending = r.data;
  openSheet('<h2>Back-up terugzetten?</h2><p class="muted">' + (r.exported ? 'Back-up van ' + fmtDate(r.exported, { day: 'numeric', month: 'long', year: 'numeric' }) + ': ' : '') + r.data.sessions.length + ' trainingen, ' + (r.data.weights || []).length + ' gewichtsmetingen, ' + Object.keys(r.data.food || {}).length + ' dagen voeding.</p><p class="small muted" style="margin-top:8px">De huidige gegevens op dit apparaat worden vervangen.</p><div class="actions"><button class="btn block primary" data-action="doRestore">Terugzetten</button><button class="btn block ghost" data-action="closeSheet">Annuleren</button></div>');
}

function startWorkout(wid, len) {
  closeSheet(); ensureAudio();
  if (!state.cycleStart) { state.cycleStart = new Date().toISOString(); save(); }
  active = buildSession(wid, len);
  saveActive(); openRunner();
}

function applySwapToActive(orig) {
  if (!active) return true;
  let ok = true;
  active.blocks.forEach(b => {
    if (b.type === 'sets') b.items.forEach((it, i) => {
      if (it.orig !== orig) return;
      if (it.sets.some(s => s.done)) { ok = false; return; }
      let nw = resolve(orig);
      if (b.items.some((x, j) => j !== i && x.id === nw)) nw = orig;
      b.items[i] = setItemRuntime(itemPlan(orig, active.len, b.rest, active.deload, nw));
    });
    if (b.type === 'timed') b.orig.forEach((o, i) => {
      if (o !== orig) return;
      let nw = resolve(orig);
      if (b.ex.some((x, j) => j !== i && x === nw)) nw = orig;
      b.ex[i] = nw;
      b.phases.forEach(p => { if (p.slot === i) { p.ex = nw; if (p.k === 'work') p.side = !!EX[nw].side; } });
    });
  });
  return ok;
}

const CKEY = 'fitworden.cloud';
const FB_VERSION = '12.19.0';
const FB_URL = 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 24;
const PUSH_DELAY = 1500;
const MAX_DOC = 900000;

const cloud = {
  meta: loadCloudMeta(), db: null, loading: null, timer: null, busy: false, again: false,
  status: 'idle', lastPull: 0, pending: null
};

function loadCloudMeta() {
  try { const m = JSON.parse(localStorage.getItem(CKEY)); if (m && typeof m === 'object') return m; } catch (e) {}
  return { enabled: false, code: null, localUpdatedAt: 0, dirty: false };
}
function saveCloudMeta() { try { localStorage.setItem(CKEY, JSON.stringify(cloud.meta)); } catch (e) {} }
function cloudOn() { return !!(cloud.meta.enabled && cloud.meta.code && window.FIREBASE_CONFIG); }

function newCode() {
  const b = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(b);
  return Array.from(b, x => CODE_CHARS[x % CODE_CHARS.length]).join('');
}
function fmtCode(c) { return (c || '').match(/.{1,4}/g).join('-'); }
function normCode(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function validCode(c) { return c.length === CODE_LEN && [...c].every(ch => CODE_CHARS.includes(ch)); }

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = false;
    s.onload = res; s.onerror = () => { s.remove(); rej(new Error('sdk')); };
    document.head.appendChild(s);
  });
}
function ensureDb() {
  if (cloud.db) return Promise.resolve(cloud.db);
  if (!window.FIREBASE_CONFIG) return Promise.reject(Object.assign(new Error('noconfig'), { code: 'noconfig' }));
  if (!cloud.loading) {
    cloud.loading = (window.firebase && firebase.firestore ? Promise.resolve() : loadScript(FB_URL + 'firebase-app-compat.js').then(() => loadScript(FB_URL + 'firebase-firestore-compat.js')))
      .then(() => {
        const app = firebase.apps.find(a => a.name === 'fitworden') || firebase.initializeApp(window.FIREBASE_CONFIG, 'fitworden');
        cloud.db = app.firestore();
        return cloud.db;
      })
      .catch(e => { cloud.loading = null; throw Object.assign(e, { code: e.code || 'unavailable' }); });
  }
  return cloud.loading;
}
function docRef(code) { return cloud.db.collection('fitworden').doc(code); }
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'unavailable' })), ms))]);
}

function setCloudStatus(st) {
  cloud.status = st;
  const el = $('#syncStatus'); if (!el) return;
  const map = { saved: ['Opgeslagen', 'ok'], saving: ['Opslaan…', 'busy'], offline: ['Cloud offline', 'off'], denied: ['Controleer de Firestore-regels', 'err'], error: ['Opslaan mislukt', 'err'], toobig: ['Te groot voor cloud', 'err'] };
  const m = map[st];
  if (!cloudOn()) { backupChip(el); return; }
  if (!m) { el.hidden = true; return; }
  el.hidden = false; el.textContent = m[0]; el.className = 'sync ' + m[1];
}
function backupChip(el) {
  const has = state.sessions.length || state.weights.length || Object.keys(state.food).length;
  if (!state.settings.onboarded || !has) { el.hidden = true; return; }
  const d = state.lastBackup ? daysSince(state.lastBackup) : null;
  el.hidden = false;
  el.textContent = d === null ? 'Geen back-up' : d === 0 ? 'Back-up vandaag' : 'Back-up ' + d + ' d geleden';
  el.className = 'sync ' + (d === null || d >= 7 ? 'busy' : 'ok');
}
function cloudErr(e) {
  const c = e && e.code;
  if (c === 'permission-denied') { setCloudStatus('denied'); return 'denied'; }
  if (c === 'unavailable' || c === 'deadline-exceeded' || !navigator.onLine) { setCloudStatus('offline'); return 'offline'; }
  setCloudStatus('error'); return 'error';
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + str.length;
}
function stateHash() { return hashStr(JSON.stringify(state)); }
function cloudTouch() {
  if (!cloudOn()) { setCloudStatus(cloud.status); return; }
  const h = stateHash();
  if (h === cloud.meta.hash) return;
  cloud.meta.hash = h;
  cloud.meta.localUpdatedAt = Date.now();
  cloud.meta.dirty = true;
  saveCloudMeta();
  schedulePush();
}
function schedulePush(delay = PUSH_DELAY) {
  if (!cloudOn()) return;
  clearTimeout(cloud.timer);
  if (!navigator.onLine) { setCloudStatus('offline'); return; }
  setCloudStatus('saving');
  cloud.timer = setTimeout(pushNow, delay);
}
async function pushNow() {
  if (!cloudOn() || !cloud.meta.dirty) return;
  if (cloud.busy) { cloud.again = true; return; }
  if (!navigator.onLine) { setCloudStatus('offline'); return; }
  const data = JSON.stringify(state);
  if (data.length > MAX_DOC) { setCloudStatus('toobig'); return; }
  const stamp = cloud.meta.localUpdatedAt;
  cloud.busy = true; setCloudStatus('saving');
  try {
    await ensureDb();
    await withTimeout(docRef(cloud.meta.code).set({ data, updatedAt: stamp }), 15000);
    if (cloud.meta.localUpdatedAt === stamp) cloud.meta.dirty = false;
    saveCloudMeta();
    setCloudStatus(cloud.meta.dirty ? 'saving' : 'saved');
  } catch (e) { cloudErr(e); }
  cloud.busy = false;
  if (cloud.again && cloud.meta.dirty) { cloud.again = false; schedulePush(300); }
}

function parseRemote(snap) {
  const d = snap.data() || {};
  let raw = null;
  try { raw = JSON.parse(d.data || 'null'); } catch (e) {}
  const r = parseBackup(JSON.stringify({ app: 'fitworden', version: BACKUP_VERSION, data: raw }));
  if (r.err) throw Object.assign(new Error(r.err), { code: 'baddata' });
  return { data: r.data, updatedAt: +d.updatedAt || 0, hash: hashStr(d.data || '') };
}
function applyRemote(r) {
  state = migrate(r.data);
  state.settings.onboarded = true;
  saveLocal();
  cloud.meta.localUpdatedAt = r.updatedAt; cloud.meta.dirty = false; cloud.meta.hash = stateHash(); saveCloudMeta();
  applyTheme();
  if ($('#modal').hidden) render(); else ui.needRender = true;
}
async function pullNow(force) {
  if (!cloudOn() || cloud.busy) return;
  if (!force && Date.now() - cloud.lastPull < 4000) return;
  if (!navigator.onLine) { setCloudStatus('offline'); return; }
  cloud.lastPull = Date.now();
  try {
    await ensureDb();
    const snap = await withTimeout(docRef(cloud.meta.code).get(), 15000);
    if (!snap.exists) { cloud.meta.dirty = true; saveCloudMeta(); schedulePush(0); return; }
    const r = parseRemote(snap);
    if (r.hash === stateHash()) { cloud.meta.dirty = false; cloud.meta.hash = r.hash; cloud.meta.localUpdatedAt = Math.max(cloud.meta.localUpdatedAt, r.updatedAt); saveCloudMeta(); setCloudStatus('saved'); return; }
    if (r.updatedAt > cloud.meta.localUpdatedAt) { applyRemote(r); setCloudStatus('saved'); toast('Nieuwste gegevens uit de cloud geladen'); }
    else if (cloud.meta.dirty || r.updatedAt < cloud.meta.localUpdatedAt) { cloud.meta.dirty = true; saveCloudMeta(); schedulePush(0); }
    else setCloudStatus('saved');
  } catch (e) {
    if (e.code === 'baddata') { setCloudStatus('error'); toast('De cloudgegevens zijn beschadigd en zijn niet geladen.', 4000); return; }
    cloudErr(e);
  }
}

function cloudCard() {
  const m = cloud.meta;
  let h = '<div class="section-title" id="cloudSec">Automatisch opslaan</div><div class="card">';
  if (!window.FIREBASE_CONFIG) return h + '<p class="small muted">Cloud-opslag is niet beschikbaar: het bestand firebase-config.js ontbreekt.</p></div>';
  if (cloudOn()) {
    const st = { saved: 'Alles is opgeslagen in de cloud.', saving: 'Bezig met opslaan…', offline: 'Geen verbinding. Je werkt gewoon lokaal door; zodra je weer online bent wordt alles opgeslagen.', denied: 'De cloud weigert toegang. Controleer de Firestore-regels.', error: 'Opslaan is mislukt. De app probeert het later opnieuw.', toobig: 'Je gegevens zijn te groot voor de cloud. Maak een extra back-up.' }[cloud.status] || 'Cloud-opslag staat aan.';
    h += '<div class="row" style="margin-bottom:10px"><span class="dot-on"></span><b>Cloud-opslag staat aan</b></div><p class="small muted" style="margin-bottom:12px">' + esc(st) + ' Elke wijziging wordt na een paar seconden opgeslagen.</p>';
  } else if (m.code) {
    h += '<p class="small muted" style="margin-bottom:12px">Cloud-opslag staat uit. Je cloudgegevens zijn nog bewaard onder je code.</p><button class="btn primary block" data-action="cloudResume">Weer aanzetten</button>';
  } else {
    h += '<p class="small muted" style="margin-bottom:12px">Sla na elke wijziging automatisch een kopie op in de cloud. Handig als je telefoon kwijtraakt of je een nieuwe krijgt. Je hebt geen account nodig: je krijgt een persoonlijke code.</p><button class="btn primary block" data-action="cloudEnable">Cloud-opslag aanzetten</button>';
  }
  if (m.code) {
    h += '<div class="codebox"><span class="tiny muted">Jouw code</span><b id="cloudCode">' + (ui.showCode ? esc(fmtCode(m.code)) : '••••-••••-••••-••••-••••-••••') + '</b><div class="row" style="margin-top:8px"><button class="btn sm ghost grow" data-action="cloudShow">' + (ui.showCode ? 'Verbergen' : 'Tonen') + '</button><button class="btn sm ghost grow" data-action="cloudCopy">Kopieer code</button></div></div>' +
      '<p class="tiny muted" style="margin-top:8px"><b>Bewaar deze code goed</b>, bijvoorbeeld in je wachtwoordmanager. Met de code haal je je gegevens terug op een nieuwe telefoon. <b>Deel hem met niemand</b>: wie de code heeft, kan je gegevens bekijken en wijzigen.</p>';
  }
  h += '<p class="small" style="font-weight:700;margin:16px 0 8px">Al een code?</p><div class="row"><input class="input" id="cloudIn" placeholder="XXXX-XXXX-XXXX-…" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn" data-action="cloudConnect">Verbinden</button></div>';
  if (m.code) {
    h += '<div class="row" style="margin-top:16px">' + (cloudOn() ? '<button class="btn sm ghost grow" data-action="cloudOffAsk">Uitzetten</button>' : '') + '<button class="btn sm ghost grow" data-action="cloudDelAsk" style="color:#c8453a">Cloudgegevens verwijderen</button></div>';
  }
  return h + '</div>';
}

async function cloudEnable(code) {
  cloud.meta = { enabled: true, code, localUpdatedAt: Date.now(), dirty: true, hash: stateHash() };
  saveCloudMeta(); ui.showCode = false;
  render(); setCloudStatus('saving');
  await pushNow();
  render();
  toast('Cloud-opslag staat aan. Tik op Tonen of Kopieer code en bewaar je code goed.', 4200);
}
async function cloudResume() {
  cloud.meta.enabled = true; saveCloudMeta(); render();
  await pullNow(true);
  render();
}
async function cloudLookup(code) {
  openSheet('<h2>Zoeken…</h2><p class="muted">Even kijken of er gegevens bij deze code horen.</p>');
  try {
    await ensureDb();
    const snap = await withTimeout(docRef(code).get(), 15000);
    if (!snap.exists) { openSheet('<h2>Niets gevonden</h2><p class="muted">Bij deze code staan geen gegevens in de cloud. Controleer of je hem goed hebt overgenomen.</p><div class="actions"><button class="btn block primary" data-action="closeSheet">Oké</button></div>'); return; }
    const r = parseRemote(snap);
    cloud.pending = { code, r };
    const here = state.sessions.length;
    openSheet('<h2>Gegevens gevonden</h2><p class="muted"><b>' + r.data.sessions.length + ' trainingen</b>, ' + (r.data.weights || []).length + ' gewichtsmetingen' + (r.updatedAt ? ', laatst opgeslagen ' + fmtDate(new Date(r.updatedAt).toISOString(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') + '.</p>' +
      '<p class="small muted" style="margin-top:8px">Wil je deze gegevens op dit apparaat gebruiken? Wat hier nu staat' + (here ? ' (' + here + ' trainingen)' : '') + ' wordt vervangen. Daarna wordt dit apparaat automatisch opgeslagen onder deze code.</p>' +
      '<div class="actions"><button class="btn block primary" data-action="cloudConnectOk">Vervangen en verbinden</button><button class="btn block ghost" data-action="closeSheet">Annuleren</button></div>');
  } catch (e) {
    const msg = e.code === 'permission-denied' ? 'Geen toegang. Controleer de Firestore-regels.' : e.code === 'baddata' ? 'De gegevens bij deze code zijn beschadigd.' : e.code === 'noconfig' ? 'firebase-config.js ontbreekt.' : 'Geen verbinding met de cloud. Probeer het opnieuw als je online bent.';
    openSheet('<h2>Verbinden lukt niet</h2><p class="muted">' + esc(msg) + '</p><div class="actions"><button class="btn block primary" data-action="closeSheet">Oké</button></div>');
  }
}

const ACT = {
  closeSheet: () => closeSheet(),
  confirmOk: () => { const cb = confirmSheet.cb; closeSheet(); cb && cb(); },
  toggleWeight: el => {
    const w = parseFloat(el.dataset.w); const ws = state.settings.weights;
    const i = ws.indexOf(w); i >= 0 ? ws.splice(i, 1) : ws.push(w);
    Object.entries(state.prog.ex).forEach(([id, p]) => { if (EX[id] && EX[id].db && p.w && !ws.includes(p.w)) p.w = avail().filter(x => x <= p.w).pop() || avail()[0] || 0; });
    if (!state.settings.onboarded) state.settings.name = ($('#onbName') || {}).value || state.settings.name;
    save(); render();
  },
  setPlan: el => { state.settings.plan = el.dataset.v; state.rot = 0; if (!state.settings.onboarded) state.settings.name = ($('#onbName') || {}).value || state.settings.name; save(); render(); },
  finishOnboarding: () => { state.settings.name = ($('#onbName').value || '').trim(); state.settings.onboarded = true; save(); requestPersist(); render(); },
  preview: el => openSheet(previewHtml(el.dataset.w, 'normaal')),
  previewLen: el => openSheet(previewHtml(el.dataset.w, el.dataset.len), true),
  exInfo: el => openSheet(exInfoHtml(el.dataset.id)),
  exInfo2: el => openSheet(exInfoHtml(el.dataset.id).replace('data-action="closeSheet">Sluiten', 'data-action="swapReopen">Terug')),
  swapOpen: el => { const d = el.dataset; ACT._swap = { orig: d.orig, ctx: d.ctx, cur: d.cur, taken: d.taken ? d.taken.split(',') : [] }; const s = ACT._swap; openSheet(swapHtml(s.orig, s.ctx, s.cur, s.taken)); },
  swapReopen: () => { const s = ACT._swap; if (s) openSheet(swapHtml(s.orig, s.ctx, s.cur, s.taken)); else closeSheet(); },
  swapBack: el => { if (el.dataset.ctx === 'preview' && ui.pv) openSheet(previewHtml(ui.pv.wid, ui.pv.len)); else closeSheet(); },
  doSwap: el => {
    const { orig, to, ctx } = el.dataset;
    if (to === orig) delete state.swaps[orig]; else state.swaps[orig] = to;
    save();
    if (ctx === 'run') {
      const ok = applySwapToActive(orig);
      saveActive(); closeSheet(); renderRunner();
      toast(ok ? 'Gewisseld naar ' + exName(to) : 'Je hebt al sets gedaan; de wissel geldt vanaf de volgende training.', 3200);
    } else if (ctx === 'preview' && ui.pv) { openSheet(previewHtml(ui.pv.wid, ui.pv.len)); toast('Gewisseld naar ' + exName(to)); }
    else { closeSheet(); render(); }
  },
  unswap: el => { delete state.swaps[el.dataset.orig]; save(); render(); toast('Teruggezet naar ' + exName(el.dataset.orig)); },
  unswapAll: () => { state.swaps = {}; save(); render(); toast('Alle oefeningen teruggezet'); },
  startWorkout: el => {
    if (active) { confirmSheet('Er loopt al een training', 'Wil je die weggooien en deze starten?', 'Nieuwe training starten', () => startWorkout(el.dataset.w, el.dataset.len), true); return; }
    startWorkout(el.dataset.w, el.dataset.len);
  },
  resume: () => { ensureAudio(); openRunner(); },
  discardActive: () => confirmSheet('Training weggooien?', 'Wat je in deze training hebt gedaan wordt niet opgeslagen.', 'Weggooien', () => { active = null; saveActive(); render(); }, true),
  startBlock: () => {
    ensureAudio(); const b = curBlock(); b.started = true; b.pi = 0;
    active.running = true; active.tEnd = Date.now() + b.phases[0].sec * 1000; active.tLeft = null;
    beep(880, 0.1); saveActive(); renderRunner();
  },
  togglePlay: () => {
    ensureAudio(); const a = active; const ph = curPhase();
    if (a.running) { a.tLeft = a.tEnd - Date.now(); a.running = false; }
    else { a.tEnd = Date.now() + (a.tLeft ?? ph.sec * 1000); a.tLeft = null; a.running = true; }
    saveActive(); renderRunner();
  },
  skipPhase: () => {
    const a = active; const b = curBlock();
    const ph = b.phases[b.pi];
    const left = a.running ? a.tEnd - Date.now() : (a.tLeft ?? ph.sec * 1000);
    creditPhase(b, ph, ph.sec - left / 1000);
    if (b.pi >= b.phases.length - 1) { b.done = true; a.running = false; a.tLeft = null; saveActive(); renderRunner(); return; }
    b.pi++;
    const n = b.phases[b.pi];
    if (a.running) a.tEnd = Date.now() + n.sec * 1000; else a.tLeft = n.sec * 1000;
    saveActive(); renderRunner();
  },
  prevPhase: () => {
    const a = active; const b = curBlock();
    const ph = b.phases[b.pi];
    const elapsed = a.running ? ph.sec * 1000 - (a.tEnd - Date.now()) : ph.sec * 1000 - (a.tLeft ?? ph.sec * 1000);
    if (elapsed < 2500 && b.pi > 0) b.pi--;
    const n = b.phases[b.pi];
    if (a.running) a.tEnd = Date.now() + n.sec * 1000; else a.tLeft = n.sec * 1000;
    saveActive(); renderRunner();
  },
  toggleRound: el => { const b = curBlock(); const i = +el.dataset.i; b.doneRounds[i] = !b.doneRounds[i]; saveActive(); renderRunner(); },
  skipBlock: () => { const b = curBlock(); b.done = true; b.skipped = true; ACT.nextBlock(); },
  nextBlock: () => {
    const a = active; a.running = false; a.tLeft = null; a.timer = null;
    const b = curBlock(); b.done = true;
    if (a.bi < a.blocks.length - 1) a.bi++; else a.finishing = true;
    saveActive(); renderRunner(); $('.run-body') && ($('.run-body').scrollTop = 0);
  },
  endRunEarly: () => {
    const a = active; const b = curBlock();
    const ph = b.phases[b.pi];
    if (ph.k === 'run') { const left = a.running ? a.tEnd - Date.now() : (a.tLeft ?? ph.sec * 1000); creditPhase(b, ph, ph.sec - left / 1000); }
    const coolIdx = b.phases.findIndex(p => p.cool);
    b.pi = coolIdx; a.running = true; a.tEnd = Date.now() + b.phases[coolIdx].sec * 1000;
    beep(740, 0.25); saveActive(); renderRunner();
  },
  finish: () => { const a = active; a.running = false; a.timer = null; curBlock().done = true; a.finishing = true; saveActive(); renderRunner(); },
  backToWorkout: () => { active.finishing = false; saveActive(); renderRunner(); },
  stopAsk: () => {
    if (active.finishing) { ACT.backToWorkout(); return; }
    openSheet('<h2>Training stoppen?</h2><p class="muted">Je kunt opslaan wat je tot nu toe gedaan hebt.</p><div class="actions"><button class="btn block primary" data-action="stopSave">Stoppen en opslaan</button><button class="btn block" data-action="stopMin">Minimaliseren</button><button class="btn block ghost" data-action="stopDiscard" style="color:#c8453a">Weggooien</button><button class="btn block ghost" data-action="closeSheet">Doorgaan met trainen</button></div>');
  },
  stopSave: () => { closeSheet(); ACT.finish(); },
  stopMin: () => { closeSheet(); if (active.running) { active.tLeft = active.tEnd - Date.now(); active.running = false; } active.timer = null; saveActive(); closeRunner(); ui.tab = 'home'; render(); window.scrollTo(0, 0); },
  stopDiscard: () => { closeSheet(); active = null; saveActive(); closeRunner(); render(); },
  rate: el => { active.fin.rating = +el.dataset.v; keepFinInputs(); saveActive(); renderRunner(); },
  pain: el => { active.fin.pain = el.checked; keepFinInputs(); saveActive(); },
  saveSession: () => {
    keepFinInputs();
    const rec = finalizeRecord();
    const recs = findRecords(rec);
    state.sessions.push(rec);
    const r = rotation(); if (r[state.rot % r.length] === rec.wid) state.rot++;
    const sug = evaluate(rec);
    active = null; saveActive(); save(); closeRunner(); ui.tab = 'home'; render();
    let h = '<div style="text-align:center;font-size:48px">🎉</div><h2 style="text-align:center">Training opgeslagen</h2><p class="muted" style="text-align:center">' + esc(rec.name) + ' · ' + fmtMin(rec.dur) + (rec.deload ? ' · rustweek' : '') + '</p>';
    if (recs.length) h += '<div class="records"><b>🏆 Nieuw record' + (recs.length > 1 ? 's' : '') + '</b><ul>' + recs.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
    if (rec.pain) h += '<div class="banner" style="margin-top:14px"><div class="ico">⚠️</div><p class="small">Je gaf pijn of klachten aan. Neem de tijd om te herstellen en sla bij aanhoudende pijn de oefening over, wissel hem voor een alternatief of vraag advies.</p></div>';
    if (sug.length) h += '<div class="section-title">Voorstel</div>' + sug.map(s => suggCard(state.sugg.find(x => x.key === s.key && x.t === s.t))).join('');
    else h += '<p class="small muted" style="text-align:center;margin-top:12px">Volgende keer: ' + esc(WORKOUTS[nextWid()].name) + '</p>';
    h += '<div class="actions"><button class="btn block primary" data-action="closeSheet">Klaar</button></div>';
    openSheet(h);
    if (needsBackup() && state.sessions.length > 1) setTimeout(() => toast('Tip: maak weer eens een back-up (Meer → Back-up)', 3500), 800);
  },
  applySugg: el => { applySugg(el.dataset.id); toast('Toegepast. Volgende keer iets zwaarder!'); if (!$('#modal').hidden) closeSheet(); render(); },
  laterSugg: el => { laterSugg(el.dataset.id); if (!$('#modal').hidden) closeSheet(); render(); },
  setW: el => { const b = curBlock(); b.items[+el.dataset.ii].w = parseFloat(el.dataset.w); saveActive(); renderRunner(); },
  adj: el => {
    const b = curBlock(); const it = b.items[+el.dataset.ii]; const s = it.sets[+el.dataset.si];
    s.v = Math.max(it.kind === 'time' ? 5 : 1, s.v + (+el.dataset.d) * (it.kind === 'time' ? 5 : 1));
    saveActive(); renderRunner();
  },
  toggleSet: el => {
    ensureAudio(); const b = curBlock(); const ii = +el.dataset.ii; const s = b.items[ii].sets[+el.dataset.si];
    s.done = !s.done;
    if (s.done) { startRestAfter(b, ii); buzz(40); }
    else if (active.timer && active.timer.type !== 'hold') active.timer = null;
    saveActive(); renderRunner();
    if (active.timer && active.timer.type === 'trans') scrollToCard(active.timer.ii);
  },
  addSet: el => {
    const b = curBlock(); const it = b.items[+el.dataset.ii]; const last = it.sets[it.sets.length - 1];
    it.sets.push({ v: last ? last.v : it.target, done: false });
    saveActive(); renderRunner(); toast('Extra set toegevoegd');
  },
  hold: el => { ensureAudio(); startHold(+el.dataset.ii, +el.dataset.si); saveActive(); renderRunner(); },
  itemPlay: el => { ensureAudio(); startItemTimer(+el.dataset.ii, false); saveActive(); renderRunner(); },
  checkAll: () => { ensureAudio(); const b = curBlock(); const n = b.items.findIndex(i => !i.done); if (n < 0) { toast('Alles is al afgevinkt'); return; } startItemTimer(n, true); saveActive(); renderRunner(); },
  checkItem: el => { const b = curBlock(); const it = b.items[+el.dataset.ii]; it.done = !it.done; if (active.timer && active.timer.ii === +el.dataset.ii) active.timer = null; saveActive(); renderRunner(); },
  timerStop: () => { active.timer = null; saveActive(); renderRunner(); },
  restAdd: () => { if (active.timer) active.timer.end += 15000; saveActive(); updateTimerDisplay(); },
  restSkip: () => { const t = active.timer; active.timer = null; saveActive(); renderRunner(); if (t && t.type === 'trans') scrollToCard(t.ii); },
  progTab: el => { ui.progTab = el.dataset.v; render(); },
  foodTab: el => { ui.foodTab = el.dataset.v; render(); },
  foodCat: el => { ui.foodCat = el.dataset.v; render(); },
  foodDay: el => { const d = new Date((ui.foodDate || dateKey()) + 'T12:00:00'); d.setDate(d.getDate() + (+el.dataset.d)); const k = dateKey(d); ui.foodDate = k > dateKey() ? dateKey() : k; render(); },
  quickAdd: el => { const q = QUICK[+el.dataset.i]; addFood(ui.foodDate || dateKey(), q); render(); toast(q.name + ' toegevoegd'); },
  customAdd: () => {
    const name = ($('#fName').value || '').trim() || 'Eigen invoer';
    const p = parseNum($('#fP').value) || 0; const kcal = parseNum($('#fK').value) || 0;
    if (!p && !kcal) { toast('Vul eiwit en/of kcal in'); return; }
    addFood(ui.foodDate || dateKey(), { name, p, kcal }); render(); toast('Toegevoegd');
  },
  addMeal: el => { const m = MEALS.find(x => x.id === el.dataset.id); addFood(dateKey(), { name: m.name, p: m.p, kcal: m.kcal }); toast('Toegevoegd aan vandaag'); },
  delFood: el => {
    const dk = ui.foodDate || dateKey(); const list = dayFood(dk); const i = list.findIndex(x => x.id === el.dataset.id); if (i < 0) return;
    const item = list[i];
    state.food[dk] = list.filter(x => x.id !== item.id); if (!state.food[dk].length) delete state.food[dk]; save(); render();
    toast(item.name + ' verwijderd', 6000, () => { const l = state.food[dk] || (state.food[dk] = []); l.splice(Math.min(i, l.length), 0, item); save(); render(); toast('Teruggezet'); });
  },
  goFood: () => { ui.tab = 'food'; ui.foodTab = 'log'; ui.foodDate = null; render(); window.scrollTo(0, 0); },
  goProfile: () => { ui.tab = 'more'; render(); const el = $('#profileSec'); el && el.scrollIntoView(); },
  setSex: el => { state.profile.sex = el.dataset.v; save(); render(); },
  fav: (el, ev) => { ev.preventDefault(); const id = el.dataset.id; const i = state.favs.indexOf(id); i >= 0 ? state.favs.splice(i, 1) : state.favs.push(id); save(); el.classList.toggle('on', i < 0); el.textContent = i < 0 ? '♥' : '♡'; if (ui.foodCat === 'Favorieten') render(); },
  delSession: el => confirmSheet('Training verwijderen?', 'Deze training verdwijnt uit je historie en grafieken.', 'Verwijderen', () => {
    const rec = state.sessions.find(s => s.id === el.dataset.id); if (!rec) return;
    state.sessions = state.sessions.filter(s => s.id !== rec.id); save(); render();
    toast('Training verwijderd', 6000, () => { if (!state.sessions.some(s => s.id === rec.id)) { state.sessions.push(rec); state.sessions.sort((a, b) => a.date.localeCompare(b.date)); save(); render(); toast('Training teruggezet'); } });
  }, true),
  editSession: el => openEdit(el.dataset.id),
  eCount: el => { const b = ui.edit.s.blocks[+el.dataset.bi]; const max = b.type === 'run' ? b.reps : b.rounds; b.done = clamp(b.done + (+el.dataset.d), 0, max); editRefresh(); },
  eAdj: el => { const it = ui.edit.s.blocks[+el.dataset.bi].items[+el.dataset.ii]; const st = it.sets[+el.dataset.si]; const step = it.kind === 'time' ? 5 : 1; st.v = Math.max(step, st.v + (+el.dataset.d) * step); editRefresh(); },
  eChk: el => { const st = ui.edit.s.blocks[+el.dataset.bi].items[+el.dataset.ii].sets[+el.dataset.si]; st.on = !st.on; editRefresh(); },
  eAddSet: el => { const it = ui.edit.s.blocks[+el.dataset.bi].items[+el.dataset.ii]; const last = it.sets[it.sets.length - 1]; it.sets.push({ v: last ? last.v : it.target, on: true }); editRefresh(); },
  eW: el => { ui.edit.s.blocks[+el.dataset.bi].items[+el.dataset.ii].w = parseFloat(el.dataset.w); editRefresh(); },
  eRate: el => { ui.edit.s.rating = +el.dataset.v; editRefresh(); },
  eSave: () => {
    const E = ui.edit; const s = E.s;
    const m = parseInt(E.durMin, 10); if (m > 0) s.dur = m * 60;
    const km = parseNum(E.km); if (km > 0) s.km = Math.round(km * 100) / 100; else delete s.km;
    s.note = (E.note || '').trim();
    s.blocks.forEach(b => {
      if (b.type === 'sets') b.items.forEach(it => { it.sets = it.sets.filter(x => x.on).map(x => x.v); });
      if (b.type === 'run') b.runSec = b.done * b.run;
      if (b.type === 'free') b.what = s.name + ' · ' + Math.round(s.dur / 60) + ' min' + (s.km ? ' · ' + num(s.km) + ' km' : '');
    });
    const i = state.sessions.findIndex(x => x.id === E.id);
    if (i >= 0) state.sessions[i] = s;
    save(); closeSheet(); render(); toast('Training bijgewerkt');
  },
  addWeight: () => {
    const kg = parseNum($('#wKg').value); const d = $('#wDate').value || dateKey();
    if (!(kg > 20 && kg < 300)) { toast('Vul een geldig gewicht in'); return; }
    state.weights = state.weights.filter(x => x.date !== d); state.weights.push({ date: d, kg: Math.round(kg * 10) / 10 });
    save(); render(); toast('Gewicht opgeslagen');
  },
  delWeight: el => {
    const w = state.weights.find(x => x.date === el.dataset.d); if (!w) return;
    state.weights = state.weights.filter(x => x.date !== w.date); save(); render();
    toast('Meting van ' + fmtDate(w.date + 'T12:00:00', { day: 'numeric', month: 'long' }) + ' verwijderd', 6000, () => { if (!state.weights.some(x => x.date === w.date)) { state.weights.push(w); save(); render(); toast('Meting teruggezet'); } });
  },
  undo: () => { const f = ui.undo; ui.undo = null; $('#toast').hidden = true; clearTimeout(toast._t); if (f) f(); },
  deloadStart: () => { startDeload(); render(); toast('Rustweek gestart: 7 dagen lichter trainen'); },
  deloadStop: () => { stopDeload(); render(); toast('Rustweek gestopt'); },
  deloadSnooze: () => { state.deloadSnooze = new Date(Date.now() + 7 * DAY).toISOString(); save(); render(); toast('Oké, over een week vraag ik het opnieuw'); },
  applyUpdate: () => applyUpdate(),
  shareBackup: () => shareBackup(),
  downloadBackup: () => downloadBackup(),
  copyBackup: () => copyBackup(),
  backupConfirm: () => { closeSheet(); markBackup(); toast('Back-up gemarkeerd'); },
  pickRestore: () => $('#restoreFile').click(),
  pasteRestore: () => openSheet('<h2>Plak back-uptekst</h2><textarea class="input" id="pasteArea" style="min-height:180px" placeholder="Plak hier de tekst van je back-up"></textarea><div class="actions"><button class="btn block primary" data-action="pasteGo">Controleren</button><button class="btn block ghost" data-action="closeSheet">Annuleren</button></div>'),
  pasteGo: () => restoreFrom($('#pasteArea').value || ''),
  doRestore: () => { state = migrate(restoreFrom.pending); state.settings.onboarded = true; save(); applyTheme(); closeSheet(); render(); toast('Back-up teruggezet'); },
  setTheme: el => { state.settings.theme = el.dataset.v; save(); applyTheme(); render(); },
  setGoal: el => { state.settings.weekGoal = +el.dataset.v; save(); render(); },
  install: async () => { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch (e) {} deferredInstall = null; render(); },
  wipeAsk: () => {
    confirmSheet.cb = () => {
      clearTimeout(cloud.timer); localStorage.removeItem(KEY); localStorage.removeItem(AKEY); localStorage.removeItem(CKEY);
      cloud.meta = loadCloudMeta(); setCloudStatus('idle'); state = defaultState(); active = null; applyTheme(); ui.tab = 'home'; render();
    };
    const c = cloud.meta.code;
    openSheet('<h2>Alle gegevens wissen?</h2><p class="muted">Al je trainingen, voortgang, voeding en instellingen worden van dit apparaat verwijderd' + (c ? ' en de koppeling met de cloud gaat uit.' : '. Maak eerst een back-up als je die wilt bewaren.') + '</p>' +
      (c ? '<div class="codebox"><span class="tiny muted">Jouw code</span><b>' + esc(fmtCode(c)) + '</b><div class="row" style="margin-top:8px"><button class="btn sm ghost grow" data-action="cloudCopy">Kopieer code</button></div></div><p class="small" style="margin-top:10px"><b>Noteer je code</b>, anders kun je je cloudgegevens niet terughalen. De gegevens in de cloud blijven bewaard; met deze code haal je ze later terug.</p>' : '') +
      '<div class="actions"><button class="btn block danger" data-action="confirmOk">Alles wissen</button><button class="btn block ghost" data-action="closeSheet">Annuleren</button></div>');
  },
  goCloud: () => { ui.tab = 'more'; render(); const el = $(cloudOn() ? '#cloudSec' : '#backupSec'); el && el.scrollIntoView(); },
  cloudEnable: () => cloudEnable(newCode()),
  cloudResume: () => cloudResume(),
  cloudShow: () => { ui.showCode = !ui.showCode; render(); const el = $('#cloudSec'); el && el.scrollIntoView(); },
  cloudCopy: async () => {
    const c = fmtCode(cloud.meta.code);
    try { await navigator.clipboard.writeText(c); toast('Code gekopieerd. Bewaar hem op een veilige plek.', 3200); }
    catch (e) { ui.showCode = true; render(); toast('Kopiëren lukte niet; de code staat nu zichtbaar.'); }
  },
  cloudConnect: () => {
    const c = normCode(($('#cloudIn') || {}).value);
    if (!validCode(c)) { toast('Die code klopt niet: hij heeft 24 tekens (letters en cijfers).', 3200); return; }
    if (c === cloud.meta.code && cloudOn()) { toast('Dit apparaat gebruikt deze code al.'); return; }
    cloudLookup(c);
  },
  onbConnect: () => openSheet('<h2>Verbinden met je code</h2><p class="small muted" style="margin-bottom:12px">Heb je Fit worden al op een andere telefoon met cloud-opslag? Vul je code in om je gegevens hier op te halen.</p><input class="input" id="cloudIn" placeholder="XXXX-XXXX-XXXX-…" autocomplete="off" autocapitalize="characters" spellcheck="false"><div class="actions"><button class="btn block primary" data-action="cloudConnect">Zoeken</button><button class="btn block ghost" data-action="closeSheet">Annuleren</button></div>'),
  cloudConnectOk: () => {
    const p = cloud.pending; if (!p) return;
    clearTimeout(cloud.timer);
    cloud.meta = { enabled: true, code: p.code, localUpdatedAt: p.r.updatedAt, dirty: false };
    saveCloudMeta(); cloud.pending = null; ui.needRender = false;
    applyRemote(p.r); closeSheet(); ui.tab = 'home'; render(); setCloudStatus('saved');
    toast('Verbonden. Je gegevens zijn opgehaald.', 3200);
  },
  cloudOffAsk: () => confirmSheet('Cloud-opslag uitzetten?', 'Wijzigingen worden dan alleen nog op dit apparaat opgeslagen. De gegevens in de cloud blijven bewaard; met je code kun je later weer verbinden.', 'Uitzetten', async () => {
    if (cloud.meta.dirty) await pushNow();
    clearTimeout(cloud.timer); cloud.meta.enabled = false; saveCloudMeta(); setCloudStatus('idle'); render(); toast('Cloud-opslag staat uit');
  }),
  cloudDelAsk: () => confirmSheet('Cloudgegevens verwijderen?', 'De kopie in de cloud wordt definitief verwijderd en cloud-opslag gaat uit. De gegevens op dit apparaat blijven gewoon staan.', 'Verwijderen', async () => {
    try {
      await ensureDb();
      await withTimeout(docRef(cloud.meta.code).delete(), 15000);
      clearTimeout(cloud.timer); cloud.meta = { enabled: false, code: null, localUpdatedAt: 0, dirty: false }; saveCloudMeta(); ui.showCode = false;
      setCloudStatus('idle'); render(); toast('Cloudgegevens verwijderd');
    } catch (e) { toast(e.code === 'permission-denied' ? 'Verwijderen geweigerd: controleer de Firestore-regels.' : 'Verwijderen lukt nu niet. Probeer het opnieuw als je online bent.', 3800); }
  }, true),
  freeLog: () => openSheet('<h2>Losse activiteit</h2><p class="small muted" style="margin-bottom:14px">Bijvoorbeeld een wandeling, fietstocht of een extra rondje hardlopen.</p>' +
    '<label class="field"><span>Wat</span><select class="input" id="flWhat"><option>Wandelen</option><option>Hardlopen</option><option>Fietsen</option><option>Zwemmen</option><option>Anders</option></select></label>' +
    '<div class="row"><label class="field grow"><span>Minuten</span><input class="input" id="flMin" inputmode="numeric" placeholder="30"></label><label class="field grow"><span>Km (optioneel)</span><input class="input" id="flKm" inputmode="decimal" placeholder="3,5"></label></div>' +
    '<label class="field"><span>Datum</span><input class="input" type="date" id="flDate" value="' + dateKey() + '"></label>' +
    '<div class="actions"><button class="btn block primary" data-action="freeSave">Opslaan</button><button class="btn block ghost" data-action="closeSheet">Annuleren</button></div>'),
  freeSave: () => {
    const min = parseInt($('#flMin').value, 10); if (!(min > 0)) { toast('Vul het aantal minuten in'); return; }
    const km = parseNum($('#flKm').value);
    const what = $('#flWhat').value; const d = $('#flDate').value || dateKey();
    const date = d === dateKey() ? new Date().toISOString() : new Date(d + 'T12:00:00').toISOString();
    const rec = { id: uid(), date, wid: 'free', name: what, dur: min * 60, rating: 0, pain: false, note: '', blocks: [{ type: 'free', what: what + ' · ' + min + ' min' + (km > 0 ? ' · ' + num(km) + ' km' : '') }] };
    if (state.deload.active) rec.deload = true;
    if (km > 0) rec.km = Math.round(km * 100) / 100;
    const recs = findRecords(rec);
    state.sessions.push(rec); state.sessions.sort((a, b) => a.date.localeCompare(b.date));
    save(); closeSheet(); render(); toast(recs.length ? '🏆 ' + recs[0] : 'Activiteit opgeslagen', recs.length ? 3800 : 2600);
  }
};

function keepFinInputs() {
  if (!active || !active.fin) return;
  const n = $('#finNote'); if (n) active.fin.note = n.value;
  const k = $('#finKm'); if (k) active.fin.km = k.value;
}

function showTip(r) {
  const w = r.closest('.chart-wrap'); if (!w) return;
  const tip = w.querySelector('.ctip'); const box = w.querySelector('svg').getBoundingClientRect();
  document.querySelectorAll('.ctip').forEach(t => { if (t !== tip) t.hidden = true; });
  tip.textContent = r.dataset.tip; tip.hidden = false;
  tip.style.left = clamp(+r.dataset.cx * box.width, 40, box.width - 40) + 'px';
  tip.style.top = (+r.dataset.cy * box.height) + 'px';
}
document.addEventListener('pointerdown', ev => {
  const r = ev.target.closest && ev.target.closest('.hit');
  if (r) showTip(r); else document.querySelectorAll('.ctip').forEach(t => { t.hidden = true; });
});
document.addEventListener('click', ev => {
  const tab = ev.target.closest('.tabbar button');
  if (tab) { ui.tab = tab.dataset.tab; if (tab.dataset.tab === 'food') ui.foodDate = null; render(); window.scrollTo(0, 0); return; }
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'button')) {
    if (ev.target === $('#modal')) closeSheet();
    return;
  }
  if (el.disabled) return;
  const fn = ACT[el.dataset.action];
  if (fn) fn(el, ev);
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'restoreFile') {
    const f = el.files && el.files[0]; if (!f) return;
    f.text().then(restoreFrom).catch(() => toast('Bestand kon niet gelezen worden'));
    el.value = ''; return;
  }
  if (el.dataset && el.dataset.pf) {
    const k = el.dataset.pf; const v = parseNum(el.value);
    if (k === 'kg') state.profile.kg = v > 20 && v < 300 ? Math.round(v * 10) / 10 : null;
    if (k === 'cm') state.profile.cm = v > 100 && v < 230 ? Math.round(v) : null;
    if (k === 'age') state.profile.age = v >= 16 && v < 100 ? Math.round(v) : null;
    if (k === 'act') state.profile.act = v;
    if (k === 'goal') state.profile.goal = v;
    save(); render(); return;
  }
  const a = el.dataset && el.dataset.action;
  if (a === 'setToggle') { state.settings[el.dataset.k] = el.checked; save(); if (el.dataset.k === 'sound' && el.checked) { ensureAudio(); beep(); } return; }
  if (a === 'pain') { ACT.pain(el); return; }
  if (a === 'ePain') { ui.edit.s.pain = el.checked; return; }
  if (a === 'exSel') { ui.exSel = el.value; render(); return; }
  if (a === 'setName') { state.settings.name = el.value.trim(); save(); }
});
document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.id === 'finNote' || el.id === 'finKm') keepFinInputs();
  if (el.dataset && el.dataset.ef && ui.edit) ui.edit[el.dataset.ef] = el.value;
});
window.addEventListener('online', () => { if (!cloudOn()) return; if (cloud.meta.dirty) schedulePush(300); else pullNow(true); });
window.addEventListener('offline', () => { if (cloudOn()) setCloudStatus('offline'); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cloudOn()) pullNow();
  if (document.visibilityState === 'hidden' && cloudOn() && cloud.meta.dirty) pushNow();
  if (document.visibilityState === 'visible' && active && !$('#runner').hidden) { lockScreen(); tick(); syncPlan(true); }
  if (document.visibilityState === 'hidden') saveActive();
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (ui.tab === 'more') render(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

function requestPersist() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} }

let swReg = null;
function canReloadNow() {
  const f = document.activeElement;
  return state.settings.onboarded && $('#runner').hidden && $('#modal').hidden && !(f && /INPUT|TEXTAREA|SELECT/.test(f.tagName));
}
function applyUpdate() { if (ui.reloading) return; ui.reloading = true; location.reload(); }
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (canReloadNow()) applyUpdate();
    else { ui.updateReady = true; if ($('#runner').hidden) render(); }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => { swReg = r; }).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && swReg) swReg.update().catch(() => {}); });
}

applyTheme();
checkDeloadEnd();
saveLocal();
if (active) saveActive();
if (state.settings.onboarded) requestPersist();
render();
if (cloudOn() && !cloud.meta.hash) { cloud.meta.hash = stateHash(); saveCloudMeta(); }
if (cloudOn()) { setCloudStatus(cloud.meta.dirty ? 'saving' : 'saved'); pullNow(true); } else setCloudStatus('idle');
