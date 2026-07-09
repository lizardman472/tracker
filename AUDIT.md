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

---

## 6 · Ultra-audit pass (9 Jul 2026) — residual findings

A further full-layer pass over the already-audited branch. Every anchor in the audit
brief was re-verified against the code first; the genuinely-open findings below were
fixed in order P0 → P1 → P2, one behavioral change per commit. **384 tests pass**
(calc 192 · hex 134 · render 58) plus an 18-assertion real-Chromium end-to-end run
(boot → log → finish → save → history toggle → resume card → charts, zero console
errors). SW cache bumped `rft-v50` → `rft-v51` with this pass.

### Brief drift (brief said / code is)
- ~~SW cache `rft-v13`~~ → was already `rft-v50`, network-first + update toast; healthy.
- ~~`buildVW` interrupted mid-implementation~~ → finished long ago: `VW` (11 kg), `VWH`
  (7 kg hex), `VWL` (landmine single-end) + coarse warm-up ladders, all callers wired.
- ~~volt-green `#c4f82a` theme~~ → deliberately reskinned to sky-cyan `#38bdf8` on main
  (commit `3656488`, the day after volt landed). Kept cyan; fixed the stale comment.
- ~~`workout-CLEAN-import.json` canonical state~~ → not in the repo (live data lives on
  the device); ~~glitch-session exclusion~~ → no such mechanism existed — **built now**
  (noProg, below) per user decision.

### Fixed (P0)
| Finding | Fix |
|---|---|
| **Export→clear→import round-trip was unprovable** — the merge logic lived inside FileReader-bound `impD` | Extracted pure `mergeImport(cur,d)` (identical behavior, `impD` is a thin wrapper); round-trip proof now in calc.test: rich state → `JSON.stringify` (what `expD` writes) → `freshState()` → `mergeImport` → field-for-field equality across sessions/body/cardio/discomfort/cues/lastDeload/phase/phaseStart/location. Device-local by design (documented): `notify`, `dismissed`, `lastBackup*`, `gen`. Fresh restores now also adopt a validated `nextDay` (manual rotation overrides used to be lost). |
| **Resume blob silently purged with logged work inside** — `checkResume` deleted any `rft-active` blob >2h old or program-drifted, destroying uncommitted sets | Blobs with ≥1 logged rep are never auto-deleted: surfaced with age label (`3h ago`/`2d ago`) + drift note and an explicit Resume/Discard; only zero-rep blobs are purged. `resumeW` clamps `CIDX`; session date still stamps from workout start (locked by test). |

### Fixed (P1)
| Finding | Fix |
|---|---|
| **Two open tabs clobbered each other's writes** (whole-store last-writer-wins, no cross-tab signal) | `D.gen` + `rft-v12-gen` sidecar: a conflicting write is detected in `save()` and unioned in via pure `mergeStores` (sessions/cardio by id, body by date, discomfort by composite; scalars keep the in-memory tab). Happy path = one extra `getItem`. `resetAll` adopts the sidecar gen so a wipe can't be un-done by the merge. |
| **MG attribution inconsistencies**: `b_stance_rdl` missing the `back:0.5` its RDL siblings carry; `hex_carry` core 1.0 vs the identical bilateral `db_carry` 0.5 | Fixed both; carry rule documented (unilateral 1.0 / bilateral farmer 0.5). Home core stays 7.5 ≥ MEV 6; back ≤ MAV. Exact-value tests added so drift fails loud. |
| **No way to exclude bad sessions from progression** (the "glitch session" gap) | Per-session **noProg** toggle in History (⏸ badge): invisible to `getSmartSugg`/`getRelatedSuggestion` only — still counts for rotation, history, tonnage, analytics. Additive field; survives import/round-trip. |
| **CI SW-bump check warned on every push** — depth-1 clone has no `HEAD~1`, both diffs failed into the warning branch | `fetch-depth: 0` + diff against the PR base sha / `event.before` with a rev-parse-guarded fallback. |

### Fixed (P2)
- **SEED hygiene**: demo state now carries `programVersion:12` and no dead `confirmed`
  field (coupled — the v12 migration no longer runs on it); `load()` stamps
  `phaseStart=today()` on seeding so fresh installs don't boot into "phase overdue".
- **Zoom + contrast + tap targets**: `user-scalable=no` removed; `--p1` plate chip
  3.2:1 → ~6:1 (`#8b97ab`); set ticks 36→44 px, warm-up boxes 28→36, form buttons
  32→40 (per-set 24→30), timer ✕ 34→44, banner/update ✕ get padded hit areas.
  (`--dm` on `--bg` measured ≈6:1 — checked, passes, unchanged.)
- **A11y light touch** (user-chosen scope): set ticks / discomfort chips are real
  `<button>`s with `aria-pressed`; charts get `role="img"` + descriptive labels;
  `<nav>`/`<main>` landmarks; global `:focus-visible` ring.
- **Chart palette consts** (`CH_GRID/CH_TXT/CH_DOT/CH_TARGET`) replace repeated hexes,
  documented as mirrors of the CSS tokens; stale "volt glow" comment fixed.
- **Repeat-day hint**: manually re-picking the day you just logged warns that it stacks
  the same movement patterns (the fixed A→B→C rotation otherwise prevents pressing
  from stacking across consecutive sessions — verified static-by-design).

### Verified sound, no change needed
- Confirmation brake: exactly two consecutive at-load target hits (`hitsAtW<2`,
  float-tolerant buckets, re-arms after deloads) — no off-by-one.
- Phase clocks (8 wk **or** 24 sessions), deload gating (timer AND fatigue/stall
  signals), overshoot-before-brake ordering, return-from-disruption snapping to the
  pre-deload peak. Plate math on all three ladders vs the real inventory (`MAX_BB` 85).
- Side delts ≥ MEV at both venues (~10 home / ~8.5 partner effective sets); calves
  tracked-not-gated per the explicit v27 decision.
- Timezone-safe local-date math, week bucketing, `validSession` import guards,
  corrupt-store rescue path.

---

## 7 · Progress-tab rebuild + UI elevation (9 Jul 2026, second pass)

**Progress tab rebuilt around five segments** — Overview / Lifts / Balance /
Consistency / Lifetime chips under the always-visible status header — replacing one
~6–8-screen scroll. Every shared helper now computes once per render (statSnapshot
ran 3×, momentum/consistency 2× each) and segment-only work (per-exercise PR walk,
muscleWeekly loop, weeklySeries, exercise deep-dive) runs only when its segment is
open. `STAT_SEG`/`STAT_PRS_ALL` are in-memory only — zero stored-data changes.

**New insights (all four chosen):**
- **Band progression** — pull-ups/dips progress by band+reps but showed a permanently
  dead weight chart. Band lifts now get a band-ladder row (current rung highlighted;
  assist reads toward None, resist toward the heaviest band), a total-reps chart, and
  a reps-trend stat via `repsSlope` (e1rmSlope's guards, reps domain).
- **Phase/deload markers** — `svgBars` gained `opts.marks`; `weeklyMarks` maps stamped
  phase transitions + the deload week onto the tonnage chart; Overview opens with a
  "Phase N · name · week X/Y" context card.
- **Form trend** — `formWeekly` charts each lift's weekly mean worst-rated set (1–5).
- **Cardio trend** — `cardioWeekly` charts minutes/week with an intensity split.

**Quirk fixes:** momentum + e1RM-chart gates unified on `E1RM_TYPES` (club lifts
could PR but never trend); `consistency().perWk` now spans to *today* (a layoff
finally lowers the cadence the ≥3/wk verdict judges); the below-MEV priority nudge is
stated once (Overview) instead of three times; balance numbers hedged with ≈ and
"directional, not precise"; All-Time PRs collapse to top-8 with Show-all.

**UI elevation (dataviz-guided, current identity kept):**
- **Day B is purple, not blue** — A-cyan↔B-blue failed the colorblind separation
  check (deutan ΔE ~10, tritan ~9, validated with a palette checker). Shared
  `DAY_COLORS` const + `.bg-b`; heatmap cells now also carry their day letter
  (secondary encoding), cardio a dot.
- Chart craft: titles wear text ink (never series color), native `<title>` tooltips
  on bars/dots, recessive grid, 2px lines, 8px markers, flat-series tick-dedup fix.
- Screenshot review at 360px found the other screens already solid; targeted fixes
  only (nav tracking so SETTINGS can't clip, phase-card span fusing, PR badge wrap).

**Verification: 436 tests** (calc 213 · hex 134 · render 89) plus a 25-assertion
Chromium e2e (core loop, all five segments, band view, chart aria, resume card,
noProg, two-tab gen sidecar — zero console errors at 360px). SW cache → `rft-v52`.

### Deferred (with reasons)
- **Committed-session editing** (user chose defer) — delete + re-log remains the fix
  path; a good inline editor is its own feature, a `prompt()` one is poor phone UX.
- **iOS PNG icon / apple-touch-icon** — previously deferred by explicit decision.
- **Analytics memoization** — Progress tab is O(muscles×sessions) per render, but at
  this data volume (100s of sessions) it's milliseconds; complexity > benefit.
- **Full a11y sweep** (every div-onclick → button) — user chose light touch.
- **Timezone-change week re-bucketing** — inherent to the local-date design; one device.
- **Gap-aware swap-picker badges** — picker already filters by primary muscle; deemed
  clutter for the value.
