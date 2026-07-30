// Passphrase-lock tests — the encryption-at-rest path added alongside the plaintext one.
//
// These assert the properties that make the lock worth having at all, rather than that the
// functions merely run: that no plaintext survives anywhere in storage once the lock is on,
// that a wrong passphrase cannot open the store, that save()'s synchronous "did this land"
// contract still holds across an ASYNCHRONOUS cipher, and that the two encrypted keys (store
// and resume blob) cannot cancel each other's writes.
//
// Same harness shape as tests/render.smoke.js: slice the script before INIT so the app never
// auto-boots, eval it against DOM/storage stubs, and drive the exported functions directly.
// Unlike that harness, localStorage here is a REAL in-memory map — a no-op stub would make
// every "no plaintext is left behind" assertion pass vacuously.
//
// Run with:  node tests/lock.test.js

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const code = script.slice(0, script.indexOf('// ═══════════════ INIT')) +
  '\n;global.__L={SK,AW_KEY,SEED,load,save,saveAW,clearAW,awRead,encPeek,encOpen,encRead,encReady,' +
  'lockEnable,lockDisable,lockUnlock,lockNow,lockWipe,rLock,render,' +
  'setD:d=>{D=d},getD:()=>D,setADAY:v=>{ADAY=v},setLOG:v=>{LOG=v},setSS:v=>{SS=v},' +
  'getCK:()=>CK,getPTS:()=>PTS,getAWPT:()=>AWPT,getLOCK_ON:()=>LOCK_ON,getLOCK_FAIL:()=>LOCK_FAIL,' +
  'setLOCK_SETUP:v=>{LOCK_SETUP=v},KDF_ITER,' +
  'resetLock:()=>{CK=null;PTS=null;AWPT=null;LOCK_SALT=null;LOCK_ON=false;LOCK_FAIL=false;LOCK_SETUP=false}};';

// ── DOM stubs (minimal — the lock paths only render and read input values) ──
const els = {};
function makeEl() {
  const base = { _h: '', value: '', checked: false, disabled: false, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
    addEventListener() {}, removeEventListener() {}, appendChild(c) { return c },
    removeChild() {}, remove() {}, setAttribute() {}, getAttribute() { return null },
    focus() {}, blur() {}, click() {}, querySelector() { return null }, querySelectorAll() { return [] } };
  Object.defineProperty(base, 'innerHTML', { get() { return this._h }, set(v) { this._h = v } });
  Object.defineProperty(base, 'textContent', { get() { return this._h }, set(v) { this._h = String(v == null ? '' : v) } });
  return new Proxy(base, { get(t, p) { return p in t ? t[p] : () => {}; } });
}
global.document = {
  getElementById(id) { return els[id] || (els[id] = makeEl()); },
  createElement() { return makeEl(); },
  querySelector() { return null }, querySelectorAll() { return [] },
  addEventListener() {}, body: makeEl(), documentElement: makeEl(),
};
// isSecureContext gates encReady(); WebCrypto itself is native in Node 19+.
global.window = { scrollTo() {}, addEventListener() {}, isSecureContext: true,
  matchMedia() { return { matches: false, addEventListener() {} } } };
// lockWipe calls the BARE `location.reload()`, which is a global in a browser — stubbing only
// window.location would leave the wipe path untested (it would throw instead of reloading).
global.location = window.location = { href: '', hash: '', reload() { RELOADED = true } };
function setNavigator(v) {
  Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true });
  return v;
}
setNavigator({});
let RELOADED = false;
let ALERTS = [];
let CONFIRM = true;
global.alert = m => { ALERTS.push(String(m)) };
global.confirm = () => CONFIRM;
global.setInterval = () => 0; global.clearInterval = () => {};
global.Blob = class { constructor(a) { this.size = (a && a[0] && a[0].length) || 0 } };

// ── Real in-memory localStorage, with a hook for simulating a full quota ──
// THROW_ON is a predicate over the key being written: quota failures in a browser are
// per-write, so faking one per-key is the faithful simulation.
let THROW_ON = null;
const store = new Map();
global.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { if (THROW_ON && THROW_ON(k)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } store.set(k, String(v)) },
  removeItem: k => { store.delete(k) },
};

eval(code);
const L = global.__L;

// ── Test plumbing ──
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++ } else { fail++; console.log('  ✗ ' + name) } }
function eq(a, b, name) { ok(a === b, `${name} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
// WebCrypto resolves on the microtask queue after real async work; a macrotask turn per
// pending operation is enough to let every queued encrypt/decrypt land.
const flush = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)) };
const PASS = 'correct horse battery';

// A fresh device: empty storage AND no lock state carried over from the previous case. Reset
// the module state explicitly — in a browser a reload does this, so a test that relies on the
// previous case having left CK null is testing the order of the file, not the app.
function freshStore(nSessions = 2) {
  store.clear(); THROW_ON = null; ALERTS = []; RELOADED = false; L.resetLock();
  const d = JSON.parse(JSON.stringify(L.SEED));
  d.sessions = Array.from({ length: nSessions }, (_, i) => ({
    id: 's' + i, date: '2026-07-0' + (i + 1), day: 'A', loc: 'home', phase: 1,
    ex: [{ id: 'hex_dl', reps: [5, 5, 5], wt: 60, band: '', notes: '' }],
    difficulty: 3, duration: 40, volume: 900, warmup: true, notes: 'squat notes ' + i,
  }));
  d.gen = 0;
  L.setD(d);
  return d;
}
// Does any stored value still contain data only the plaintext would have?
function plaintextLeak(needle) {
  for (const [, v] of store) if (String(v).includes(needle)) return true;
  return false;
}

(async function run() {
  console.log('Passphrase-lock tests\n');

  // ── 1 · Enabling the lock leaves no plaintext anywhere ──
  {
    freshStore();
    // A pre-existing corruption rescue copy and a resume blob: both hold real logged work in
    // the clear, and both are the kind of thing an "encrypt the store" change forgets.
    store.set(L.SK + '-corrupt', JSON.stringify({ sessions: [{ notes: 'CANARY_CORRUPT' }] }));
    store.set(L.SK + '-corrupt-n', '3');
    store.set(L.AW_KEY, JSON.stringify({ day: 'A', log: { hex_dl: { reps: [5], notes: 'CANARY_AW' } }, ts: Date.now() }));
    await L.lockEnable(PASS, PASS);

    ok(L.getLOCK_ON(), 'lock reports on after enable');
    ok(!!L.encPeek(store.get(L.SK)), 'store is an envelope after enable');
    ok(!plaintextLeak('squat notes 0'), 'no session note survives in cleartext anywhere in storage');
    ok(!plaintextLeak('CANARY_CORRUPT'), 'the corruption rescue copy is not left sitting in the clear');
    eq(store.get(L.SK + '-corrupt'), undefined, 'the rescue copy is removed outright');
    ok(!plaintextLeak('CANARY_AW'), 'the in-progress resume blob is encrypted too');
    ok(!!L.encPeek(store.get(L.AW_KEY)), 'resume blob is an envelope after enable');
    ok(L.awRead().includes('CANARY_AW'), 'awRead still returns the resume plaintext while unlocked');
  }

  // ── 2 · Only the right passphrase opens it ──
  {
    const env = L.encPeek(store.get(L.SK));
    let opened = null;
    try { opened = await L.encOpen(env, 'wrong passphrase'); } catch (e) { opened = 'threw' }
    eq(opened, 'threw', 'a wrong passphrase fails the GCM tag rather than returning garbage');
    const r = await L.encOpen(env, PASS);
    ok(r.text.includes('squat notes 0'), 'the right passphrase returns the exact plaintext');
    eq(JSON.parse(r.text).sessions.length, 2, 'round-trip preserves the session count');
    // Envelope hygiene: the passphrase must not be recoverable from what is stored.
    const raw = store.get(L.SK);
    ok(!raw.includes(PASS), 'the passphrase itself is never written to storage');
    ok(!('hash' in env) && !('verifier' in env), 'no separate password verifier is stored to grind offline');
    eq(env.iter, L.KDF_ITER, 'the KDF iteration count travels with the envelope');
  }

  // ── 3 · Boot detection + unlock completes the boot ──
  {
    // Simulate a cold start: drop the in-memory key and plaintexts the way a reload does.
    L.lockNow();
    eq(L.getCK(), null, 'lockNow drops the session key');
    eq(L.getPTS(), null, 'lockNow drops the decrypted store');
    eq(L.getAWPT(), null, 'lockNow drops the decrypted resume blob');
    eq(L.getD(), undefined, 'lockNow drops the in-memory program state (it is the plaintext too)');
    ok(!!L.encPeek(store.get(L.SK)), 'the ciphertext is untouched by locking');

    document.getElementById('lk-pass').value = 'nope';
    await L.lockUnlock();
    eq(L.getCK(), null, 'a wrong passphrase at the gate does not unlock');
    eq(document.getElementById('lk-err').textContent, 'Wrong passphrase.', 'the gate reports a wrong passphrase');

    document.getElementById('lk-pass').value = PASS;
    await L.lockUnlock();
    ok(!!L.getCK(), 'the right passphrase unlocks');
    eq(L.getD().sessions.length, 2, 'load() rebuilt the store from the decrypted plaintext');
    eq(L.getD().sessions[0].notes, 'squat notes 0', 'session content survived the round trip');
    ok(L.awRead().includes('CANARY_AW'), 'the resume blob is decrypted at unlock, so checkResume stays synchronous');
  }

  // ── 4 · Saving while locked writes ciphertext, and load() reads it back ──
  {
    const d = L.getD();
    d.sessions.push({ id: 's9', date: '2026-07-09', day: 'B', loc: 'home', phase: 1, ex: [], difficulty: 2, duration: 30, volume: 100, warmup: true, notes: 'NEW_SESSION' });
    eq(L.save(), true, 'save() returns true synchronously while locked');
    ok(!plaintextLeak('NEW_SESSION'), 'the new session never touches disk in the clear');
    await flush();
    const env = L.encPeek(store.get(L.SK));
    ok(!!env, 'the async tail wrote an envelope');
    const txt = await L.encRead(env);
    ok(txt.includes('NEW_SESSION'), 'the newest state is what actually reached disk');
    eq(JSON.parse(txt).sessions.length, 3, 'all three sessions are in the persisted ciphertext');
  }

  // ── 5 · The generation sidecar never runs ahead of the blob beside it ──
  {
    // While the encrypt is in flight the sidecar must still describe the ciphertext ON DISK,
    // or a second tab reads a newer generation than the store it sits next to and treats this
    // tab's state as already merged.
    const before = Number(store.get(L.SK + '-gen'));
    const d = L.getD();
    d.sessions.push({ id: 's10', date: '2026-07-10', day: 'C', loc: 'home', phase: 1, ex: [], difficulty: 2, duration: 30, volume: 100, warmup: true, notes: 'INFLIGHT' });
    L.save();
    eq(Number(store.get(L.SK + '-gen')), before, 'the sidecar does not advance while the ciphertext is still encrypting');
    await flush();
    ok(Number(store.get(L.SK + '-gen')) > before, 'the sidecar advances once the ciphertext lands');
  }

  // ── 6 · A resume-blob write cannot cancel an in-flight store write ──
  {
    // Both keys are encrypted concurrently during a workout. With ONE shared write sequence
    // the saveAW below would supersede the save above and the store's newest state would be
    // silently dropped — the store and the resume blob need independent sequences.
    const d = L.getD();
    d.sessions.push({ id: 's11', date: '2026-07-11', day: 'A', loc: 'home', phase: 1, ex: [], difficulty: 2, duration: 30, volume: 100, warmup: true, notes: 'RACE_STORE' });
    L.setADAY('A'); L.setLOG({ hex_dl: { reps: [5], wt: 60 } }); L.setSS(Date.now());
    eq(L.save(), true, 'store save() accepted');
    eq(L.saveAW(), true, 'resume save() accepted while the store encrypt is still in flight');
    await flush(20);
    const txt = await L.encRead(L.encPeek(store.get(L.SK)));
    ok(txt.includes('RACE_STORE'), 'the store write survived a concurrent resume-blob write');
    ok(!!L.encPeek(store.get(L.AW_KEY)), 'the resume blob was written as an envelope');
    L.setADAY(null); L.setSS(null);
  }

  // ── 7 · A full store is still reported synchronously ──
  {
    // save()'s boolean is what two callers use to roll back real logged work. The cipher is
    // async, so the quota is probed on a scratch key — if that probe stops being honest, a
    // full device starts silently losing sessions.
    const d = L.getD();
    const genBefore = d.gen;
    THROW_ON = k => k === L.SK + '-probe';
    eq(L.save(), false, 'save() reports failure when there is no room for the ciphertext');
    eq(d.gen, genBefore, 'the write generation is rolled back on a failed save');
    eq(store.get(L.SK + '-probe'), undefined, 'the probe key is cleaned up even when it throws');
    L.setADAY('A');
    eq(L.saveAW(), false, 'saveAW() reports failure too, so the workout is never called safe when it is not');
    L.setADAY(null);
    THROW_ON = null;
    ok(!!L.encPeek(store.get(L.SK)), 'the last good ciphertext is left intact by a failed save');
  }

  // ── 8 · Removing the lock demands the current passphrase ──
  {
    await L.lockDisable('not the passphrase');
    ok(!!L.encPeek(store.get(L.SK)), 'a wrong passphrase does not remove the lock');
    ok(L.getLOCK_ON(), 'lock stays on after a failed removal');
    ok(!plaintextLeak('squat notes 0'), 'and nothing is decrypted onto disk by the attempt');

    await L.lockDisable(PASS);
    eq(L.getLOCK_ON(), false, 'the right passphrase removes the lock');
    eq(L.getCK(), null, 'the session key is dropped when the lock comes off');
    eq(L.encPeek(store.get(L.SK)), null, 'the store is plain JSON again');
    ok(plaintextLeak('squat notes 0'), 'the plaintext is genuinely readable again after removal');
    // 2 seeded + s9 + s10 + s11 pushed through the locked save path.
    eq(JSON.parse(store.get(L.SK)).sessions.length, 5, 'no sessions were lost across the lock/unlock cycle');
  }

  // ── 9 · Unlocked behaviour is untouched ──
  {
    freshStore(1);
    eq(L.save(), true, 'an unlocked save() still writes');
    eq(L.encPeek(store.get(L.SK)), null, 'an unlocked store is stored as plain JSON');
    ok(plaintextLeak('squat notes 0'), 'unlocked data stays readable, exactly as before');
    L.setD(undefined); L.load();
    eq(L.getD().sessions.length, 1, 'unlocked load() round-trips through localStorage as it always did');
    THROW_ON = k => k === L.SK;
    const genBefore = L.getD().gen;
    eq(L.save(), false, 'the unlocked quota path still reports failure directly');
    eq(L.getD().gen, genBefore, 'and still rolls the generation back');
    THROW_ON = null;
  }

  // ── 10 · The wipe escape deletes rather than pretending to recover ──
  {
    freshStore();
    await L.lockEnable(PASS, PASS);
    store.set(L.SK + '-gen', '7');
    CONFIRM = true;
    L.lockWipe();
    eq(store.get(L.SK), undefined, 'wipe removes the store');
    eq(store.get(L.SK + '-gen'), undefined, 'wipe removes the generation sidecar');
    eq(store.get(L.AW_KEY), undefined, 'wipe removes the resume blob');
    ok(RELOADED, 'wipe reloads into a clean first-run state');

    freshStore();
    await L.lockEnable(PASS, PASS);
    CONFIRM = false;
    L.lockWipe();
    ok(!!L.encPeek(store.get(L.SK)), 'declining the confirmation wipes nothing');
    CONFIRM = true;
  }

  // ── 11 · Enabling refuses input that would lock the user out ──
  {
    freshStore();
    ALERTS = [];
    await L.lockEnable('short', 'short');
    eq(L.getLOCK_ON(), false, 'a passphrase under 8 characters is refused');
    eq(L.encPeek(store.get(L.SK)), null, 'and nothing is encrypted');
    await L.lockEnable('longenough1', 'longenough2');
    eq(L.getLOCK_ON(), false, 'a mistyped confirmation is refused');
    eq(L.encPeek(store.get(L.SK)), null, 'and again nothing is encrypted');
    ok(ALERTS.length === 2, 'both refusals told the user why');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
