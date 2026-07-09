# Comprehensive Audit — Rack-Free Tracker (Consolidated)

Full top-to-bottom review of the app: program content (exercises, sets, reps, patterns,
scheduling), progression engine and its mathematics, underlying assumptions, data layer
and history integrity, UI/aesthetics, code quality and bloat, PWA/offline behaviour, and
test coverage.

This branch consolidates **two independent audit rounds**:

- **Round A (this branch)** — a from-scratch line-by-line audit of the full source, with
  every suspicion verified by executable reproduction before fixing.
- **Round B (`claude/app-audit-comprehensive-hzi2w0`, 2 Jul 2026)** — a 12-domain-expert
  audit (133 findings, ~85 fixes across three commits, including a round-3 mechanical
  sweep and CI). Its branch predated the two newest main commits (dead-bug barbell
  conversion, hex-carry stepper), so it was merged here with those features and Round A's
  unique fixes preserved.

Several defects were found **independently by both rounds** — summary-screen data loss,
the permanently-red fatigue gauge, the mixed-curve re-anchor, prefill `undefined`,
offline font loss — which is strong cross-validation. Where implementations differed,
the more complete one won (noted below).

**Result: all fixes from both rounds integrated · 296 tests passing (calc 132 · hex 110 ·
render 54) · CI workflow added.**

---

## 1 · What was audited and found sound

### Program content (exercises / sets / reps / patterns)
- **Movement-pattern coverage** is complete across the A→B→C rotation at both locations:
  heavy hinge, unilateral hinge, volume hinge, bilateral squat, front-loaded squat,
  frontal plane, vertical pull ×2/wk, horizontal pull, horizontal press ×3/wk, vertical
  press, loaded carry, anti-extension/-rotation/-lateral-flexion core, cuff work.
- **Weekly effective-set volume ≥ MEV for every tracked muscle at both locations**
  (asserted by tests against the Israetel MEV/MAV landmarks), chest at 3×/wk frequency,
  rear delts / hamstrings at 2×/wk.
- **Plate math is exhaustively correct** — every rung of all three ladders (11 kg
  symmetric, 7 kg hex, 11 kg single-end landmine) resolves in the greedy per-side
  breakdown; verified by enumeration in both rounds independently.
- Rep ranges, RIR, rest and tempo are coherent per phase and consistent between
  locations. Session cost: Day A/B ≈ 80–95 min vs Day C ≈ 60 (known trade, §4 P4).

### Engine & scheduling design
- Double progression with AMRAP-scaled jumps, overshoot re-anchoring keyed off the
  lowest set, confirmation brakes that re-arm after deloads, form gating that can't
  retro-penalise unrated history, `touched`-gating against phantom sessions, timezone-
  safe local date math throughout.
- Deload gated on timer **and** objective signals; phase change gated on timer + stalls;
  A→B→C rotation with rest-day suggestion and manual override.

### Data layer
- Guarded load/import paths, corrupted-store rescue, legacy exercise stubs keeping years
  of renamed/swapped history resolvable, stored volume re-derived on load so history
  always matches the current tonnage formula.

---

## 2 · Defects fixed (consolidated highlights)

Full Round-B inventory lives in its own report; this table is the merged, final state.

### Critical (data loss)
| Defect | Final fix |
|---|---|
| **App kill/reload on the summary screen destroyed the whole workout** (backup cleared before save; found by both rounds) | Backup survives until `saveSumm()` has persisted; discomfort rows written at save (no dupes via Back); session date stamped from workout *start* (post-midnight saves no longer mis-date); save failure (storage full) rolls back, warns, and keeps the backup alive |
| **Backup restore onto a fresh device silently lost phase/phaseStart/location** (unreachable "fresh device" branch — empty storage loads demo SEED) | Fresh/demo states flagged; demo rows dropped on restore; backup metadata adopted after validation; import is now atomic (all-or-nothing merge) |

### Engine / math
| Defect | Final fix |
|---|---|
| **Phase re-anchor under-dropped loads** — the min(Epley, Lombardi) e1RM display blend is wrong for load *translation* (7→10 reps gave −3.5% vs ≈ −9% from %1RM tables); found by both rounds | Pure-Epley ratio on both sides (Round B's version won: it also stamps sessions with their phase — survives same-day switches — and anchors on the best recent session at that weight, not one possibly-bad final day). Phase-2 copy corrected from the false "~15%" |
| **Fatigue gauge permanently red** — the app's own 3×/wk @ RPE 3 target scored 8.7–8.8/10 "Fatigued"; found by both rounds | Recalibrated (target cadence ≈ 5 "Ready", heavy weeks still red-line); cardio effort follows logged intensity |
| Discomfort gate counted per-joint rows, never expired, and skipped band/BW lifts | Session-scoped, worst-per-day, 30-day window, applies to all lift types |
| Stall counter mixed non-consecutive failures; band lifts invisible to stall/deload signals; band assist ladder dead-ended at "try unassisted" when already unassisted | Consecutive-only stalls; band stalls feed the signals; ladder ends handled |
| Confirm brake fired before the big-overshoot jump on flagship lifts | Overshoot wins, with a tighter +8% cap on spinal lifts |
| Cross-day set counts corrupted progression (4-set Day-A vs 3-set Day-B same lift) | Sessions evaluate against their own set count |
| e1RM computed for carries (nonsense "E1RM PR" badges from step counts) | e1RM restricted to rep-based loaded lifts |
| Week timers fired one week early (phase "8 weeks" at 7 completed) | Strict completed-week timers |
| Deloads advisory-only | "Took one" starts a visible 7-day deload week: −10% advisories, deload sessions excluded from progression memory |

### Periodization / program data
- Phase prompt now fires in all three recommendation states (a healthy lifter previously
  never saw it and would sit in Phase 1 forever).
- Swapped-in exercises now periodize; swap suggestions respect location.
- `db_row_b` correctly encoded as unilateral (`/side`, per-side tonnage).
- Home squat patterns credit glutes 0.5 (parity with partner counterparts).

### UX / UI / platform
- Prefill padded to today's set count (literal `undefined` in extra set inputs — both rounds).
- Bogus barbell plate diagrams on DB/KB history rows ≥ 11.5 kg removed (plate breakdowns
  gated to bar lifts).
- Reset All Data clears the active-workout backup + timer (no "Resume?" ghost of wiped data).
- Cancel button re-renders on disarm (label no longer lies after 3 s).
- Auto rest-timer fires from rep entry on prefilled lifts; resume restores session notes
  + warm-up checklist; destructive day/location/start actions warn about a pending
  resumable session.
- Timer: overtime displays (`+0:37`); pill floats above the iOS safe area and pads the
  page so it can't cover Next/Finish; AudioContext armed on first tap (iOS beep).
- Stepper: off-ladder values step to the nearest rung (used to slam to bar-only).
- Charts: duplicate integer ticks on small ranges, `undefined` x-labels, clipped labels,
  heatmap missing today, Day A/B color similarity — all fixed.
- Contrast/touch: RPE-5 color 2.2:1 → 4.5:1, set-ticks 28→36 px, larger nav/form
  buttons, bolder target `sets×reps` line.
- DST-safe calendar math in `dAgo` and six recency cutoffs.
- Warm-ups snap to a coarse ladder (no 0.25 kg micro-plate warm-up sets).
- Offline typography: Google Fonts runtime-cached (dedicated SW branch; stylesheet loads
  with `crossorigin` so responses carry real status codes); cache `rft-v48`.
- Imported `band`/`notes` coerced to strings and escaped at render (self-XSS hardening).
- Bloat removed: dead `HEX_LM_EX`, dead `warmup` view route, unread `trainingWeek`
  session field, dead CSS (`.wk-1/.wk-2/.bg-d/.ch`), pre-v12 storage keys cleaned up.
- CI: GitHub Actions runs all three suites and warns when `index.html` changes without a
  SW cache bump.

---

## 3 · Assumptions reviewed and deliberately kept

1. **Landmine load = bar + single-end plates; leverage not modelled.** Progression needs
   monotonic consistency, not biomechanical truth. Documented in-app.
2. **Balance dashboard normalizes to sets/week** (Round B) while windowing over 10 days
   so a full A→B→C rotation is always captured.
3. **Strength standards are approximate signposts** for unconventional lifts; labelled so.
4. **Single-file, no-build architecture** — zero toolchain, trivially deployable, fully
   offline; the test harness extracts the real shipped code.
5. **e1RM display blend stays** for PRs/slopes/standards (conservative at high reps is
   the right bias there); only *translation* moved to pure Epley.
6. **Demo SEED ships in the bundle** — replaced on first real use; reset gives a true
   blank slate; restore onto a demo state now drops the demo rows.

---

## 4 · Open decisions — RESOLVED (v27 pass)

The user chose the recommended default for every open decision. Applied and tested:

- **P1 · Partner MEV-floor buffer** — `db_rear_fly` (Day A) and `db_sl_rdl` (Day C) went
  3→4 sets, lifting hamstrings and rear delts off the exact MEV floor (both now 7 vs MEV
  6). The "On track" consistency verdict now requires **≥3.0 sessions/week** (was 2.5), so
  the app stops endorsing a cadence that breaks its own weekly-MEV math. Quads (8),
  side delts (8.5) and biceps (8.5) stay near floor by design — the stricter threshold is
  their guard; dips also push chest to 11.5.
- **P2 · Calves** — NEW single-leg calf raise 3×15–20 on Day C at both venues (`calf_raise`
  KB at home, `db_calf_raise` DB at the partner's), plus a **Calves row on the balance
  dashboard**. Tracked but not MEV-gated (3 maintenance sets are deliberately below a
  growth MEV; treated like the rotator-cuff row so it never shows a false "below MEV").
- **P3 · Partner dips** — NEW band-assisted `pb_dips` 3×4–8 on partner Day B, mirroring
  home. Dips now train at both venues (frequency is the fix for the pinned sticking point);
  partner chest → 11.5, triceps → 11, both well under MAV.
- **P4 · Session length** — left as is (known volume-over-brevity trade; adherence fine).
  The Day-C calf addition lands on the *short* day, so it doesn't worsen the A/B imbalance.
- **P5 · Phase-3 quality slots** — `bb_rear_row` and `cossack_squat` removed from the P3
  adj map; they now fall back to their base hypertrophy ranges (12-15 / 8-side) instead of
  heavy strength loading that contradicted the rear-delt coach note. They still periodize
  P1→P2 (membership intact — not a dead exemption).
- **P6 · Small slot fixes** — (a) `lm_pallof` tempo `2-2-1-0` → `2-0-1-2`, moving the pause
  to the press-out hold (the loaded anti-rotation position) instead of the relaxed chest;
  (c) home `dead_bugs_a` gained a control-over-load note mirroring the partner version;
  (e) the partner/home set divergence (laterals 3 vs 4, OHP 3 vs 4) is now annotated in the
  program as deliberate. (b/d not taken — hex_carry suitcase split and a 2nd side-delt tool
  were lower value and add clutter/session length.)
- **A1 · Cadence-aware clocks** — phase timer now fires on `min(8 calendar weeks, 24
  in-phase sessions)`; the deload timer likewise on weeks **or** ~3×/week-equivalent
  sessions. A training break no longer silently eats a chunk of a block.
- **Plate ceiling `MAX_BB` 80 → 85 kg** — uncapped to the true inventory limit (bar + all
  plates), so the last loadable rungs are no longer hidden behind a false "🔒 MAX".

- **MAX_BB cap raised 80 → 85 kg** — the true inventory-loadable ceiling (11 kg straight
  bar + all 74 kg of plates = 37 kg/side mirrored). The straight-bar ladder now exposes its
  last rungs (top 85 kg), the hex tops at 81 kg and the landmine at 85 kg single-end, each a
  valid plate combo. "🔒 MAX" now fires only at the genuine plate ceiling.

### Still open (deliberately deferred)

- **iOS home-screen icon** (deferred) — SVG-emoji manifest icons; iOS wants a PNG. Only
  matters if you install on an iPhone.
- **Permanent swaps** (A2, deferred) — session-scoped by design; making a swap stick is a
  small program-editing feature, worth its own pass.
- **Per-phase tempo/rest** and **emoji→SVG icon set + type-scale** (deferred) — cosmetic /
  low-value; left untouched.

---

## 5 · Verification

- **317/317 tests pass** — calc 137, hex 126, render.smoke 54 — including 22 new v27
  regression tests (calf raises exist/seed/track/tonnage at both venues, partner dips,
  MEV-floor buffer set counts, Phase-3 quality-slot ranges, `lm_pallof` tempo, cadence-aware
  phase + deload clocks, and the 85 kg plate ceiling) on top of both prior rounds' suites.
- Live render check: home Day C renders the calf raise (seeds "Try 8kg"), partner Day B
  renders dips, partner Day C renders the DB calf raise, and the Progress → Balance
  dashboard shows the new Calves row.
- Partner per-cycle volume re-verified against MEV: chest 11.5, quads 8, hams 7, rear
  delts 7, side delts 8.5, biceps 8.5, triceps 11 — all ≥ MEV; calves tracked (ungated).
- CI (`.github/workflows/test.yml`) runs all suites on every push.

Run locally: `node tests/calc.test.js && node tests/hex.test.js && node tests/render.smoke.js`
