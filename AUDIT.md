# Comprehensive Audit — Rack-Free Tracker

Full top-to-bottom review of the app: program content (exercises, sets, reps, patterns,
scheduling), progression engine and its mathematics, underlying assumptions, data layer
and history integrity, UI/aesthetics, code quality and bloat, PWA/offline behaviour, and
test coverage. Every claim below was verified by reading the complete source and/or by
executable reproduction; every fix carries a regression test.

**Result: 9 defects fixed, 6 assumptions documented as deliberate, 2 open questions.
Test count 255 → 274, all passing.**

---

## 1 · What was audited and found sound

### Program content (exercises / sets / reps / patterns)
- **Movement-pattern coverage** is complete across the A→B→C rotation at both locations:
  heavy hinge (hex DL), unilateral hinge (B-stance RDL, SL-RDL), volume hinge (hex RDL),
  bilateral squat (hex squat), front-loaded squat (landmine squat), frontal plane
  (Cossack), vertical pull ×2/wk, horizontal pull, horizontal press ×3/wk, vertical press,
  loaded carry, anti-extension / anti-rotation / anti-lateral-flexion core, cuff work.
- **Weekly effective-set volume ≥ MEV for every tracked muscle at both locations**
  (asserted by tests against the Israetel MEV/MAV landmarks in `MG_INFO`), with chest at
  3×/wk frequency and rear delts / hamstrings at 2×/wk after the earlier v22–v25 audits.
- **Rep ranges, RIR, rest, and tempo prescriptions** are internally coherent per phase
  (Linear 5–8 / Hypertrophy 8–20 / Strength 3–8 with 8-week blocks) and consistent
  between the home and partner programs.
- **Session cost**: Day A ≈ 27 working sets with ~46 min prescribed rest (~75–90 min
  total). Deliberate volume-over-brevity trade; flagged here so it's a known choice.

### Engine & math
- Double progression with AMRAP-scaled jumps, big-overshoot proportional re-anchor
  (capped +12 %/session), confirm brake on spinal compounds (re-arming after deloads),
  form gating, discomfort holds, cluster-then-deload stall ladder (~10 % real cuts,
  floor-guarded at bar weight) — all verified correct, including the edge cases the
  prior audit fixed (skipped-set phantom stalls, float-dust bucketing).
- Plate math: **every rung of all three ladders (VW 11 kg symmetric, VWH 7 kg hex, VWL
  11 kg single-end landmine) is resolvable by the greedy per-side breakdown** — verified
  exhaustively by script. No "—" rungs exist.
- e1RM (min of Epley/Lombardi), least-squares e1RM slopes, Monday-anchored week
  bucketing with zero-fill and partial-week flags, calendar-week streaks, tonnage
  conventions (per-side ×2, per-DB ×2, carries excluded) — all consistent everywhere
  they're consumed (PRs, momentum, charts, migration re-derivation).
- Timezone discipline: all date math goes through local `ymd()`; no `toISOString()`
  calendar bugs.

### Scheduling
- A→B→C rotation with location-aware suffixes, rest-day suggestion after training
  today/yesterday (with override), manual day pick clearly labelled, deload gated on
  timer **and** objective signals (14-day RPE or ≥2 stalling compounds; 8-week timer for
  beginners), phase change gated on timer + stalls. Sound.

### Data layer & history
- Load/import guarded by `validSession` (now also coerces `band`), corrupted-store
  snapshot on parse failure, merge-by-id import that can't rewind phase/location on an
  established device, stored volume re-derived on every load so historical tonnage always
  matches the current formula, legacy exercise stubs keep years of renamed/swapped
  history resolvable. Sound.

---

## 2 · Defects found and fixed in this audit

| # | Severity | Area | Defect → Fix |
|---|----------|------|--------------|
| 1 | High | Engine math | **Phase re-anchor used the e1RM display blend for load translation.** min(Epley, Lombardi) is right for *estimating* 1RM but its ratio under-drops *translation*: 40 kg×7 → 10-rep target moved only −3.5 % when %1RM tables say ≈ −9 %. Hypertrophy sets landed far too heavy. Split the curves: `transF` (pure Epley, matches published %1RM tables within ~1 % across 5–15 reps) for translation; blend stays for PRs/slopes/standards. Phase-2 copy corrected from a claimed "~15 %" drop to the true ~5–10 %. |
| 2 | High | Engine calibration | **Fatigue gauge scored the app's own target cadence 8.7/10 "Fatigued".** 3 sessions/wk @ RPE 3 (the dashed chart target) pegged the gauge red permanently — a dead signal. Recalibrated (`f·0.6 + (RPE−1)·0.9 + vol/2200f`) so target cadence ≈ 4.9 "Ready", a genuinely heavy week (5 hard sessions) still reads Fatigued ≥ 7, and cardio difficulty now follows logged intensity (easy 2 / moderate 3 / hard 4) instead of a flat 3. |
| 3 | High | Data loss | **Killing the app on the summary screen lost the whole workout.** `finishW` cleared the active-workout backup *before* the session was saved; the summary screen has no other exit. The backup now survives until `saveSumm` commits the session, so an interrupted summary resumes the workout on next open. |
| 4 | Med | Workout UI | **Set inputs rendered a literal `undefined`** for any lift whose prescription grew (floor press went 3→4 sets in v21 — the user's real history triggers this). Prefilled reps are now padded to the current set count. |
| 5 | Med | History UI | **Dumbbell/KB history rows ≥ 11.5 kg rendered bogus barbell plate diagrams** (`barOf()` falls back to the 11 kg bar for every exercise type). Plate breakdowns are now gated to bar-loaded lifts. |
| 6 | Med | Data reset | **"Reset All Data" left the pre-reset active-workout backup**, so the wiped app offered "Resume Day X?" built from deleted data. Reset now clears the backup and any running timer (`resetAll()`). |
| 7 | Low | Robustness | **Imported `band` values were interpolated into markup unescaped** at four render sites (self-XSS via crafted backup, garbage via malformed one). `validSession` coerces band to a string and all four sites now `esc()` it. |
| 8 | Low | Workout UI | **Cancel button kept saying "Confirm" after its 3-second window closed** (disarm didn't re-render), so the next tap silently re-armed instead of cancelling. Disarm now re-renders. |
| 9 | Low | Offline / aesthetics | **Typography vanished offline** — Google Fonts responses (opaque/CORS) were never cached by the service worker, so offline loads fell back to system fonts. The stylesheet now loads with `crossorigin` and the SW caches `cors`-type 200s (still refusing errors). Cache bumped to `rft-v48`. |

**Bloat removed** (each verified unreferenced by grep before deletion): `HEX_LM_EX`
dead const, `warmup:` dead view-map entry, dead negative-time branch in the rest-timer
renderer, `trainingWeek` field written to every session but never read, dead CSS rules
(`.wk-1`, `.wk-2`, `.bg-d`, `.ch`).

**Precision**: home squat patterns (`hex_squat_b`, `lm_squat`) now credit glutes 0.5,
matching their partner-program counterparts (`db_bss`, `db_lunge`) — the glute row of the
balance dashboard undercounted every home rotation.

---

## 3 · Assumptions reviewed and deliberately kept

These were examined and judged correct (or correct-enough with the trade-offs named):

1. **Landmine load = bar + single-end plates, leverage not modelled.** The number on
   screen is the plate-math truth, not the effective load at the hand (which varies with
   grip position along the arc). Modelling torque would add complexity for no
   progression benefit — progression only needs monotonic consistency. Documented in-app.
2. **Balance dashboard uses a 10-day window against per-week MEV landmarks.** A 7-day
   window would clip a rotation whenever gaps stretch (A→B→C spans 6–9 days at ~2–3-day
   gaps), causing false "below MEV" flags. The 10-day window answers "did my last full
   rotation hit MEV", which is the actionable question at this cadence. Bias is mildly
   optimistic; the label says "last 10 days" honestly.
3. **Strength standards are approximate, self-calibrated signposts** for unconventional
   lifts (hex DL ≈ +10 % vs conventional, high-handle hex squat ≈ back squat). Marked
   as such in-app; not worth false precision.
4. **Single-file, no-build architecture.** 2,500 lines in one `index.html` is unusual
   but deliberate: zero toolchain, trivially deployable to any static host, fully
   offline-capable, and the test harness extracts the pure-logic layer cleanly. Splitting
   it would add a build step for no functional gain at this size.
5. **e1RM display blend (Epley/Lombardi min)** stays for estimates — conservative at
   high reps is the right bias for PR badges and momentum slopes (fix #1 only split
   *translation* off it).
6. **Demo SEED data ships in the bundle.** Harmless (replaced on first real use, reset
   gives a true blank slate), and it keeps first-open screens demonstrative.

---

## 4 · Open questions (need your call, not code)

1. **`MAX_BB = 80 kg` bar-load cap.** Your plate inventory totals 74 kg, so the true
   ceilings are 85 kg (straight bar), 81 kg (hex). The 80 kg cap silently discards the
   last few rungs — the app will say "🔒 MAX — push reps" at 80 even though 85 is
   loadable. If 80 was chosen for the bar's load rating or safety, it's correct as is;
   if it was arbitrary, raising it to the inventory limit is a one-constant change.
2. **iOS home-screen icon.** The manifest uses data-URI SVG emoji icons; iOS ignores
   these (it wants a PNG `apple-touch-icon`), so an iPhone install gets a screenshot
   tile. Irrelevant on Android. Say the word and a proper PNG icon can be embedded.

---

## 5 · Test coverage

| Suite | Before | After | Added |
|-------|--------|-------|-------|
| `tests/calc.test.js` (engine/math/data) | 105 | 110 | re-anchor magnitude vs %1RM tables · fatigue calibration ×3 · band coercion |
| `tests/hex.test.js` (bar ladders/program volume) | 108 | 110 | glute-credit parity ×2 |
| `tests/render.smoke.js` (headless render) | 42 | 54 | prefill padding ×2 · DB plate gate ×2 · finish/save AW lifecycle ×4 (+4 render guards) |
| **Total** | **255** | **274** | all passing |

Run with: `node tests/calc.test.js && node tests/hex.test.js && node tests/render.smoke.js`
