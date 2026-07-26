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
- **P2 · Calves** — ⚠ **SUPERSEDED by the v16 Day-C trim (see §11).** A single-leg calf raise
  3×15–20 was added to Day C at both venues (`calf_raise` KB at home, `db_calf_raise` DB at
  the partner's) with a Calves row on the balance dashboard. v16 later removed both slots
  (Day C ran 12 exercises and was too long). **The program has no direct calf work today.**
  The lifts survive as legacy stubs carrying their `MG` credit so pre-trim history still
  resolves; the Calves row is gone from `MG_INFO` (a row no active exercise can fill only
  ever rendered ≈0 sets).
- **P3 · Partner dips** — NEW band-assisted `pb_dips` 3×4–8 on partner Day B, mirroring
  home. Dips now train at both venues (frequency is the fix for the pinned sticking point);
  partner chest → 11.5, triceps → 11, both well under MAV.
- **P4 · Session length** — left as is (known volume-over-brevity trade; adherence fine).
  The Day-C calf addition lands on the *short* day, so it doesn't worsen the A/B imbalance.
- **P5 · Phase-3 quality slots** — `bb_rear_row` and `cossack_squat` removed from the P3
  adj map; they now fall back to their base hypertrophy ranges (12-15 / 8-side) instead of
  heavy strength loading that contradicted the rear-delt coach note. They still periodize
  P1→P2 (membership intact — not a dead exemption). *(v17: the frontal-plane slot is now
  `lm_lateral_squat` — Landmine Lateral Squat — with the same P3 fallback treatment.)*
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

- *(counts below are as of v27 — see §11 for current totals)*
  **317/317 tests pass** — calc 137, hex 126, render.smoke 54 — including 22 new v27
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
  ⚠ **Palette superseded — see §11.** The shipped day trio is now
  A `#0069b8` azure / B `#ea62ab` pink / C `#0b7a3f` green (its own validation run:
  protan ΔE 9.5, normal 21.0). The purple-B trio described here is history; the
  *reasoning* — validate every pair, keep the day letter as a secondary encoding —
  still holds and is mirrored in the `:root` comment block.
- Chart craft: titles wear text ink (never series color), native `<title>` tooltips
  on bars/dots, recessive grid, 2px lines, 8px markers, flat-series tick-dedup fix.
- Screenshot review at 360px found the other screens already solid; targeted fixes
  only (nav tracking so SETTINGS can't clip, phase-card span fusing, PR badge wrap).

**Verification: 436 tests** (calc 213 · hex 134 · render 89) plus a 25-assertion
Chromium e2e (core loop, all five segments, band view, chart aria, resume card,
noProg, two-tab gen sidecar — zero console errors at 360px). SW cache → `rft-v52`.

---

## 8 · Volt reskin + deeper stats (9 Jul 2026, third pass)

- **Momentum decimals** — slopes display at uniform 1 decimal (raw 2-dp rounding
  printed `+2.4` beside `+2.34`); comparisons keep full precision.
- **Volt reskin** (user-picked from four rendered palette mockups): lime `#c9f24b`
  accent on warm graphite/olive-black surfaces. Every token + hardcoded mirror moved
  together (CH_* chart consts, chart series literals, DAY_COLORS.A, header/nav
  backdrop rgba, theme-color meta, manifest colors/icons). Day palette re-validated
  for colorblind separation (lime/purple/green/amber — weakest pair ΔE 13.7 deutan,
  above the 12 target; heatmap day letters retained as secondary encoding).
  ⚠ **SUPERSEDED — see §11.** The shipped identity is a **light cyan** theme
  (`--pr:#007ba8` on a cool near-white base, with a full dark-mode mirror), not volt
  lime on graphite. The token-discipline point stands: every hardcoded mirror still
  moves with the CSS vars, which is why `applyTheme()` exists.
- **Deeper stats** (all four user-selected):
  - `periodCompare` — Overview "Last 4 wk vs prior 4 wk" strip (tonnage %, sessions,
    sets, neutral-colored RPE delta); hidden until a full prior window exists.
  - `big4Weekly` — Overview "Big-4 e1RM Total" line: summed weekly best e1RM of the
    four tier lifts, carry-forward on untrained weeks, starts only when all four
    have data.
  - `e1rmProjection` — Lifts detail: next 5kg e1RM milestone + straight-line ETA
    (null on flat/negative trends or ETA >12 wk); hedged copy. `recentPRs` entries
    gained an `id`, powering a "Last PR · Nd ago" line.
  - **Recent Sessions log** — Lifts detail table of the last 10 sessions (date, load
    or band, reps, worst-set form chip, ▲PR marker, ✓/– at-target marker judged only
    against current-phase sessions).

**Verification: 457 tests** (calc 228 · hex 134 · render 95) + 28-assertion Chromium
e2e (adds: momentum decimal check, live volt token, session log, all segments).
SW cache → `rft-v53`.

---

## 9 · Partner starting weights + real DB ladder (9 Jul 2026, fourth pass)

15 partner lifts had no computed starting point ("First time — find your weight"):
11 with no `RELATED_EX` entry, 4 more chained to those unseeded peers, and no seed
ever crossed locations. Fixed end to end:

- **Inventory model** — the user photographed the partner's two spinlock DB sets
  (4×0.5 + 4×1.25 + 8×2.5 kg and 8×1 + 4×2 kg plates, four bars). Bar+collars =
  2.0kg exactly from Set 2's box math (20kg − 16kg plates / 2 bars); Set 1 assumed
  equal (single correctable const). `buildDBW` enumerates every loadable per-bell
  weight — MATCHED mode (two identical bells for `per_db` lifts, 4 plates per
  denomination step) 2→18.5kg in near-continuous 0.5 steps; SINGLE (whole pool,
  one bell) to 22kg; sleeve cap 4 plates/end. `dbwOf`/`snapDB`/`fmtDbEnd` mirror
  the barbell `vwOf`/`snapW`/`fmtPl`.
- **Seeds for all 15** — cross-location conversions from HOME history where a sane
  proxy exists (db_ohp ← barbell OHP ×0.32/DB, db_rdl ← hex RDL ×0.35/DB,
  db_row_b ← hex row ×0.45 single-bell, db_bss/db_lunge ← landmine squat,
  db_1arm_press/db_floor_press_v ← floor press, db_carry ← hex carry; multipliers
  fold the equipment + rep-range shift), deliberate statics for strict isolation
  (3kg laterals/rear flies — hypermobile shoulders) and the fixed-8kg clubbells,
  plus on-ladder fallbacks everywhere so even a fresh device seeds. Computed DB
  targets snap to the ladder. All notes hedge: estimates; session one finds the
  groove; the overshoot re-anchor corrects upward fast.
- **DB progression on real rungs** — step-ups, overshoot jumps, deloads and phase
  re-anchors for db lifts land on ladder rungs (top of the rack reports MAX like
  the barbell plate ceiling) instead of flat ±0.5 arithmetic.
- **Workout UI** — db lifts gain ± ladder-stepper buttons and a "Spinlock per end:
  2×2.5 + 1kg · two matched bells" readout; free typing retained.

**Verification: 520 tests** (calc 232 · hex 188 · render 100) + Chromium e2e incl.
a partner first-run pass. SW cache → `rft-v54`.

**Addendum — DB plate visuals + exact solver (same day):** the per-end breakdown was
greedy, and the spinlock denominations aren't greedy-friendly — the user's live
16.5kg/DB suggestion showed "per end: —" (7.25 = 2.5+2.5+1.25+1; greedy dead-ends).
`dbEnd` is now an exact fewest-plates DFS with a ladder↔solver agreement test (every
rung resolves). Dumbbell lifts gained the barbell-style plate visual: chrome chips
(matching the real plates, deliberately not the barbell color code) on the workout
screen, expanded History rows, and two DB ladder sections on All Valid Weights.
**537 tests** (calc 232 · hex 196 · render 109). SW cache → `rft-v55`.

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

---

## 10 · v28 — lower-back prevention slots (13 Jul 2026)

The hex/landmine migrations deliberately traded away the program's highest
peak-lumbar-load lifts (straight-bar DL → hex, straight RDL → hex "easier on the lower
back", both Zerchers → hex squat / landmine squat). Right call for injury exposure, but
it left prevention thin on two axes:

- **Anti-lateral-flexion** had shrunk to the single suitcase set cued at the end of the
  Day-C hex carry (partner venue: none — its carry is bilateral).
- **Extensor endurance** — low-load erector work, the trunk quality best correlated with
  back resilience — had no slot at all once the Zerchers left.

Fix (both venues; pure bodyweight so the slots never compete with hinge recovery;
static like the dead bugs/carries — no `PHASES.adj` entries):

- **`side_plank` — Day B finisher** (the only day with zero core work): 3×20–40s/side,
  seconds logged in the rep field like the carries log steps/metres. Progression cue:
  raise the top leg / load the hip, not longer grinding holds.
- **`bird_dog` — Day C finisher**: 3×8/side with 3s holds (tempo `2-0-2-3` — pause at
  full extension, mirroring `lm_pallof`'s press-out pause). Progression cue: longer
  holds, not reps/load.
- Both movements are identical at both venues, so they **share ids across
  home/partner** — a deliberate first (every prior cross-venue pair differed by
  implement); one movement, one progression history, and the bw suggestion engine
  reads either venue's sessions.
- `MG`: both credit `core:1`, no back credit (sub-threshold erector load, same
  reasoning as `db_sl_rdl`). Core rises 7.5 → 13.5 effective sets/cycle at both venues —
  ≥ MEV 6, ≤ MAV 16. Day counts: home A=8 B=8 C=10, partner A=7 B=9 C=9.

⚠ **PARTIALLY SUPERSEDED by the v16 Day-C trim (see §11).** `bird_dog` was removed again
(Day C was too long), so **only `side_plank` shipped**. Anti-lateral-flexion is covered at
both venues; the extensor-**endurance** axis this section identifies is once more unfilled —
a known, accepted gap rather than an oversight. Current day counts: **home A=9 B=8 C=10,
partner A=7 B=9 C=7.**

**Verification: 549 tests** (calc 232 · hex 208 · render 109) — the home day-count
assertion updated, plus 12 new v28 assertions: slots exist at both venues with shared
ids and a single deduped `ALL_EX` definition, `core:1` credit, core ≥ MEV and ≤ MAV at
both venues, bw holds excluded from tonnage, no phase adjustment at P1–P3, 3×40s reads
as progress / below-target as stay, and a partner-logged session feeds the home
suggestion. Live Chromium check: both slots render on their days at both venues (set
inputs, no kg input, coach note visible), zero console errors. SW cache → `rft-v56`.

---

## 11 · Engine-correctness pass + doc reconciliation (25–26 Jul 2026)

### Read this first — how to use §1–§10

Sections above are a **chronological log, not a description of HEAD.** Several decisions
were later reverted and the entries were never updated, which cost a full audit round
re-deriving the program from source. The superseded ones are now flagged in place
(§4-P2 calves, §7/§8 palette, §10 bird dog). The reversals all trace to one commit —
**v16 "trim calf raise + bird dog from Day C (both venues)"**, which landed *after*
v27/v28 in real time despite the lower narrative number.

**Ground truth at HEAD** (assert these, don't trust prose):

| | Value |
|---|---|
| Day counts | home **A=9 B=8 C=10** · partner **A=7 B=9 C=7** |
| Direct calf work | **none** (stubs + `MG` credit kept for history; no `MG_INFO` row) |
| Extensor-endurance slot | **none** (`side_plank` covers anti-lateral only) |
| Theme | light **cyan** `--pr:#007ba8` + full dark mirror |
| Day trio | A `#0069b8` · B `#ea62ab` · C `#0b7a3f` |
| Tests | **726** — calc 354 · hex 212 · render.smoke 160 |

A new hex assertion — *every `MG_INFO` key is reachable from an active exercise* — makes
this class of drift fail CI instead of surviving three release cycles.

### Fixed — engine (all three reproduced before and after)

| Defect | Fix |
|---|---|
| **An accessory set turned a target-hitting session into a failure.** `hitTarget`/`inRange` capped the set COUNT but still scanned EVERY performed set, so 4×10 + a lighter back-off set read as "below min" — and three of them forced an ~11% deload on a lifter who hit target every time. The engine walked users into it: its own plateau tip says "Add a set", and the workout screen ships a "+ Add set" button. | `nS(h)`/`workSets(h)` slice judging to the first `ex.s` counted sets — **convention: the first `ex.s` sets are the working sets, the rest is accessory volume.** Applied to hit/stall/regress *and* the AMRAP overshoot (a back-off set used to drag `minRep` under target and silently suppress the proportional jump). `traj` stays unsliced — extra work is still work. Also completes the cross-day set-count fix in the untested direction (a 4-set Day-A session now satisfies the 3-set Day-B slot). |
| **Per-set kg overrides were invisible to progression** — the same session minted a 35 kg weight PR (`exMaxWt`) and recommended 32.5 kg. | New `sessLoad(e,nSets)`: the load **sustained** across the working sets, i.e. `min(setWt)` over that window. Deliberately the MIN — three sets at 35 out of four is not a 35 kg session, and one hot top single must never re-anchor a lift. When the session ran heavier than its anchor the suggestion names the number to match on every set. **Strictly additive**: `wts` is absent on all pre-v15 and all uniform sessions, so `sessLoad` returns `e.wt` unchanged and no prior assertion moved. |
| **The 2-stall cluster prescription triggered the deload it exists to prevent.** The advice is `(s+1)×(mn-2)` — deliberately sub-minimum — so a compliant session scored as strike three and the next render cut 10%. | `isClusterAttempt` detects it by shape (same load, ≥ `ex.s+1` sets, every set ≥ `mn-2`) and holds the load so the base scheme gets a fresh attempt. Reads **unsliced** reps — the extra sets are the signal, the one place the new slice must not apply. Guarded on two prior consecutive stalls at that load, so it can't become a free pass. Missing the floor still deloads. |

### Fixed — data integrity

- **`load()` discarded malformed sessions silently.** No counter, no banner, and no rescue
  copy (the `-corrupt` snapshot was written only from the `catch`, which a parseable-but-
  malformed store never reaches) — so the next `save()` made the loss permanent with nothing
  to recover from. A non-array `sessions` field emptied the whole log just as quietly. Now
  counted into module-scope `LOAD_DROPPED` (never persisted/exported/merged), the raw store
  is parked under the existing `-corrupt` key, and the rHome rescue banner distinguishes a
  partial drop ("N sessions couldn't be read, the rest loaded normally") from a total loss.
  Import already reported skipped sessions; the load path now matches it.
- **`saveSumm` promised safety it hadn't verified.** Its quota-failure path called `saveAW()`
  — a bare `try/catch` — then unconditionally said "your workout is still safe in the resume
  backup". A full localStorage is exactly when *that* write fails too. `saveAW` now returns
  whether the write landed and the warning branches on it.

### Deliberately not taken in this pass

Still open from the 25 Jul audit, in rough priority order: **6** home lifts with no
fresh-device seed (`ohp`, `floor_press`, `dead_bugs_a`, both pull-up slots, `dips`) — the same
gap §9 closed for the partner program; `lastDeload` adoption not gated on `wasFresh` in
`mergeImport`; `esc()` is not attribute-safe (self-XSS + a `"` in a note corrupts the input,
and the render stub over-escapes so no test can catch it); the barbell stepper is a `<div>`
while the DB stepper beside it is a `<button>`; `beginW`'s resume guard is inert once a blob is
hidden by a venue/phase switch; the service worker's navigation fetch is network-first with no
timeout.

*(Corrected 26 Jul: this paragraph originally said "12 home lifts" and listed `hex_row`. Both
were wrong — carried over from the 25 Jul audit without re-deriving. Computed from
`getProgram` × `RELATED_EX` the count is 6, and `hex_row` has had a seed all along. All six are
closed in §12.)*

---

## 12 · Third pass — auditing the two previous passes (26 Jul 2026)

The first two passes were audited against their own claims rather than re-read. **Three of the
eleven fixes had shipped with regressions, and two more were incomplete.** Every one was found
by running the fixed code one step past the scenario its own tests covered.

### Regressions introduced by the earlier passes

| Fix | Defect | Why the tests missed it |
|---|---|---|
| **§11 cluster** | Forgiving *every* cluster made the hold unbounded — logging 5×6 repeatedly held the load forever, so the escalation ladder never terminated. Worse than the deload it prevented. And the cluster still scored as a stall next session, so a failed retry deloaded citing "4 sessions below 4×8" — billing the lifter for the app's own prescription, the exact miscount the fix targeted. | The suite asserted the FIRST cluster after two stalls and stopped. Nothing ran a second cluster, or the session after a hold. |
| **§11 load-drop banner** | `LOAD_DROPPED` describes the boot that set it; the rescue copy outlives it. From boot 2 the banner fell back to the total-loss copy — *"what you see now is a fresh/demo state"* — to a user whose history was fine. Boot 1 lasts one session, so the wrong message is what users actually live with. | The test booted the app once. Booting twice against the same store is what exposed it. |
| **§11 SW timeout** | No `e.waitUntil`, so when the timer won, the browser was free to kill the worker mid-refresh. The commit's claim that "the next load picks up the new shell" was unreliable *precisely* on the slow connections the timeout exists for. | No committed SW coverage at all — flagged at the time, and this is the cost. |

### Gaps the earlier passes left open

- **The set-count window had a cap but no floor.** `nS` takes its count from the session so a
  3-set Day-B session satisfies a 4-set Day-A slot — but one set at target earned a full
  increase, captioned "Hit 4×10". Floored at `ex.s-1`, verified against the program: only
  `db_lateral` and `db_rear_fly` vary, both 4→3.
- **Weight-only rows read as failed sessions.** `savePast` commits a row on a weight alone;
  three of them forced a ~10% deload and raised `stalledMajor`, built entirely from rows
  containing no reps.

### Also closed

`load()` accepted any cue key while `mergeImport` constrained the charset (keys are
interpolated into an onclick — guarding one entrance and not the other is the asymmetry that
gets relied on later); the document `<title>` still said v12, which is the PWA install name;
`resetAll` never re-applied the theme, so a factory reset visibly kept the old palette.

### What this pass changes about how to audit this repo

**A fix's own tests are written by the person who believes the fix works.** Every regression
above sat inside a green suite. What found them was running the code one step past the case
the fix was designed around — a second cluster, a second boot, a second session after a hold.

Two habits worth keeping: assert the *sequence*, not the moment (an escalation ladder needs a
test that it terminates, not just that it holds once); and never let a test double be safer
than production — the over-escaping render stub hid the `esc()` bug for its entire life, and
one new branch here threw a TDZ `ReferenceError` on the exact case it was added to handle
while the suite stayed green, because nothing exercised it.

**819 passing** — calc 384 · hex 220 · render.smoke 177 · **sw 38** — plus a 15-mutation check.
SW cache `rft-v74`.

*(Two commit messages in this pass state inflated totals — 785 and 789 — from adding the
per-suite numbers wrong. The counts above are the measured ones. Noted rather than rewritten:
the history is accurate about what changed, only the arithmetic in two footers is off.)*

### `sw.js` now has coverage — and the coverage has coverage

`sw.js` was the only shipped file with no tests, which is precisely where the `waitUntil`
regression above slipped through. `tests/sw.test.js` covers install, activate,
notificationclick and all four fetch branches, including the caching guards that keep a 503
deploy response from poisoning the offline shell.

Two things about it worth keeping in mind:

- **A new test file passing on its first run has proved nothing.** `tests/sw.mutate.js` breaks
  `sw.js` fifteen ways — drops `waitUntil`, reverts the navigation deadline, caches an
  unsuccessful shell, loses the `./index.html` fallback, stops evicting old caches — and
  requires every one to be caught. If a mutation stops applying because `sw.js` moved on, that
  is reported as a failure too, so the check can't quietly rot into a no-op.
- **One mutation escaped on the first run, and the reason mattered more than the fix.**
  Reverting the navigation to no-deadline makes the handler never respond, so an `await` hung,
  Node drained the event loop and exited **0 with no summary** — CI would have read that as a
  pass. The battery now fails on any exit that happens before it prints its summary. A test
  suite that can exit silently is worse than no suite.

The stubs are written to mirror real behaviour including the inconvenient parts — Cache Storage
keys on URL, so `addAll(['./index.html'])` genuinely does not match a navigation to `/workout`,
which is why `sw.js` needs its explicit shell fallback. A lenient cache double would have hidden
that requirement, the same way the over-escaping render stub hid the `esc()` bug.

Still open, untouched: cardio inflating the fatigue frequency term; rest-day card UX; Balance
"Priority" nudge on an empty account; heading structure and tab semantics (a11y); History
pagination; dark-mode under-MEV heat fill; `saveBod` can't clear a mistyped measurement;
two-tab merge drops cues/noProg; `checkResume` re-parses every render; manifest `theme_color`
is light-only; duplicated dark-theme token block; home venue exceeds 3 MAV landmarks; glute
credit inflated; no extensor-endurance slot (accepted since v16).

---

## 13 · Fourth pass — re-check + backlog clearance (26 Jul 2026)

### The third pass's own work held up

14 adversarial cases against HEAD, all correct: cluster run boundaries (first-ever session,
load change mid-run, a clean session resetting the run, 6-set clusters), repless rows
interleaved in a stall run, and the `minSets` floor against both legitimate cross-day cases.
Worth recording: `band_er` has `s=2`, which would give it a floor of 1 — but it is a band lift
and never enters the weighted branch where `minSets` lives, so the floor is sound for every
lift it actually governs.

### Fixed

| Finding | Before → after |
|---|---|
| **Cardio counted as a full session in the fatigue score.** Each entry added a whole session to the frequency term, and easy cardio (`diff 2`) simultaneously dragged the effort term down. | 7 easy walks + zero lifting: **5.0 Ready → 1.2 Fresh**. Both documented calibration anchors unmoved. |
| **The two-tab conflict merge dropped cues.** `mergeStores` had no `cues` branch at all, so a cue typed in one tab vanished when the other saved. `noProg` was lost the same way on an id collision, silently re-admitting an excluded session to the engine. | Cues union by key (local wins); `noProg` is sticky from either side. |
| **The Balance "Priority" nudge fired on an empty account** — every gated muscle sits at 0, so the largest MEV won by default and a brand-new user was told to add sets to Back/Lats. | Guarded on having history, matching the empty state the card above it already used. |
| **No heading structure** — two heading tags across nine screens. | `h1` app / `h2` screen / `h3` section, with sr-only titles where the design has no title text. Nothing moved visually. |
| **Incomplete tab pattern** — `role="tab"` in a `role="tablist"`, no `tabpanel`, no `aria-controls`. | Chips get ids + `aria-controls`; a `tabpanel` names the *selected* chip back, so the association follows the switch. |
| Session notes only reached memory on blur (`onchange`), unlike `SNOTES` which already synced on input. | `oninput` added; a kill mid-typing no longer loses the text. |
| The "use previous" control is a real `<button>`, but its hit area was the 10px text. | Expanded via an overlay pseudo-element — target grows, set-row height unchanged — plus a real `aria-label` (`title` is unreliable on touch). |

### Re-documented, not fixed — the previous entries were imprecise

- **Under-MEV heat contrast is NOT dark-mode-specific.** Measured against the untrained cell:
  **dark 1.29:1, light 1.15:1** — light is worse. Reaching the 3:1 non-text threshold needs
  alpha ≈0.6 in dark and is unreachable in light without changing the amber itself. That is a
  palette re-derivation against both themes, not a coefficient tweak, so it stays open with
  numbers attached rather than being half-fixed and called done.
- **The rest-day card does not block training.** It ships a "Day X anyway" button; what it
  omits is the A/B/C *picker*, so the suggested day is the only one reachable in one tap. The
  original entry overstated this. Low severity, and de-emphasising training on a rest day looks
  deliberate.
- **`saveBod` genuinely cannot clear a measurement** (`if(!isNaN(v))` skips empty inputs, so the
  old value persists). Not a one-liner: blank normally means "not measuring this today", so
  clearing needs an explicit affordance to express intent. Stays open.

### What this pass says about testing, again

Three of this pass's own tests were wrong before they were right, all in the same direction —
**passing against something other than what they claimed to check**:

- The heading test asked for view `'hist'`. `render()` dispatches via `fn[VIEW]||rHome`, so it
  silently rendered **Home** and passed while asserting nothing about History.
- The tab test hardcoded 5 tabs; `SEGS` has 6. It now derives the count from the rendered
  markup.
- One suite run was committed with a failing assertion because the shell pipeline ended in
  `tail`, which masks the exit code. Test commands now check exit status explicitly.

The pattern across four passes is consistent: the code under test is usually fine, and the
thing that lies is the harness — an over-escaping stub, a suite that exits silently, a test
pointed at the wrong screen. Distrust the scaffolding first.

**892 passing** — calc 398 · hex 220 · render.smoke 236 · sw 38 — plus 15/15 mutations caught.
SW cache `rft-v75`.

*(Corrected: this line first read 868. Three totals in this branch — two in §12, one here —
were wrong because they were summed by hand. Read the figures from the runner, not from the
prose: `for f in calc.test hex.test render.smoke sw.test; do node tests/$f.js | tail -1; done`.)*

Still open: History pagination; `checkResume` re-parses every render (6 calls); manifest
`theme_color` is light-only; duplicated dark-theme token block; under-MEV heat contrast (above);
`saveBod` clearing (above); rest-day day-picker (above); home venue exceeds 3 MAV landmarks;
glute credit inflated; no extensor-endurance slot (accepted since v16).

*(§14 works this list and finds four of its nine entries wrong. Read it before trusting the
line above.)*

---

## 14 · Fifth pass — clearing the backlog, and correcting it (26 Jul 2026)

The §13 backlog was the input to this pass. Verifying it before working it changed it: **four
of the nine entries were wrong or overstated.** Two of those errors had already been repeated
forward into the PR description.

### The backlog was wrong

| §13 said | Measured |
|---|---|
| `checkResume` re-parses **every render (6 calls)** | **One** call, on the Home render only (`rHome`). The other five call sites are user-action handlers — phase change, venue switch, resume. Not a per-render cost. **Nothing to fix; entry withdrawn.** |
| manifest `theme_color` is light-only | `applyTheme()` was already rewriting the `theme-color` **meta** at runtime, so the address bar followed the theme from INIT onward. The real gap was the pre-JS paint, which is fixed below. The manifest itself has no media mechanism, so the **install splash stays light in both themes — a platform limitation, not an open defect.** |
| under-MEV 3:1 is "unreachable in light without changing the amber" | Unreachable only under the old `alpha ≤ 0.5` cap. Solid amber is **3.55:1**, which clears it. The correct read is not "the hue is wrong" but "the alpha ramp was the wrong channel". |
| §7: "back ≤ MAV. Exact-value tests added so drift fails loud" | Back is **22.5 vs MAV 22**. One guard did exist (`≤ MAV + 0.5`) — an earlier draft of this section claimed there was none, which was wrong. But it was one-sided, so back could drift *down* unnoticed, and **glutes (16/12) and triceps (15/14) had no ceiling guard at all.** |

Re-measured from `getProgram` × `MG`, three home muscles exceed MAV: **Back/Lats 22.5/22
(+2%), Glutes 16/12 (+33%), Triceps 15/14 (+7%)**. Partner is clean; every muscle at both
venues is ≥ MEV.

**Decision on the glute overage: accepted, not corrected.** The home program is deliberately
hinge-led — three hinge slots crediting glutes 1.0 each — and MAV is a guideline ceiling, not
a cap. Re-modelling the credit would retroactively change what every past session reports;
cutting a set would trade away the volume the program is built around. All three overages are
now pinned to their exact accepted values in `hex.test.js`, so a change in either direction
fails loudly. That is the guard §7 said it had added.

### Fixed

| Finding | Before → after |
|---|---|
| **Under-MEV muscles were near-invisible on the heat map.** The alpha ramp put the amber floor at **1.26:1** against the untrained fill in light and **1.45:1** in dark — the one state that asks the user to act was the hardest to see. | Bands are solid reserved states: amber **3.55/6.10**, green 3.87/6.17, cyan 3.71/5.12, mute 4.62/5.05 (light/dark), all clearing 3:1. The magnitude the ramp encoded was already carried by the bars directly below, exactly and with a text tag. |
| Under-MEV rested on hue alone. | It now also carries a dashed outline. Dash geometry chosen by **rendering it** — a tight dash crenellates on the narrow quad/ham ellipses into what reads as a rendering artifact, and a solid ring reads as gloss on the light amber. |
| Muscles with no MEV landmark (rotator cuff) scaled against the overall max and rendered as cyan **"high"**. | Muted fill — the state the bar list already gives them. |
| **40 dark tokens declared twice**, byte-identical, one copy per dark path. | `applyTheme()` writes the *resolved* theme to `data-theme`, so one block serves both. A 2-token media rule survives for the pre-JS paint only. |
| A dark-OS device painted **light browser chrome** from parse until INIT. | Media-scoped `theme-color` pair, which `applyTheme()` removes when it takes ownership — leaving it would let the dark media rule override an explicit light preference. |
| History rendered **every** session card into one `innerHTML`, on every render including every card tap. | 30 per page behind a "Show more". The heading still reports the true total. |
| **`saveBod` could not clear a mistyped measurement.** | A blank field deletes the key. On a first log that is a no-op, so "blank = skip" and "blank = retract" are the same line. §13 deferred this as needing an affordance to express intent — the prefill already *is* that affordance, which the earlier entry missed by reading the save path without reading the form. |

### The harness, a fourth time

**`hex.test.js` and `render.smoke.js` had no `process.exit(1)`.** CI runs each suite directly
and reads the exit code, so both exited 0 no matter how many assertions failed. **468 of the
branch's 926 assertions could not fail the build** — every render check and every
program-volume check among them. Both now exit non-zero, verified by mutating `index.html`
until each one fails.

That is the fourth harness defect in five passes, after an over-escaping stub, a suite that
drained the event loop and exited 0, and a test pointed at the wrong screen. The tally across
the branch is lopsided enough to be the branch's main finding: **the scaffolding lied more
often than the code did.**

Two smaller instances of the same thing, from this pass:

- Two mutation checks "passed" because the `sed` silently didn't match. A mutation that
  doesn't mutate is indistinguishable from one that isn't caught. Verify the file changed.
- A `grep | head -12` truncated away the one MAV assertion that did exist, which produced a
  confident and wrong claim that none did. Corrected above.

### Method note

Contrast was **computed, not eyeballed**, and the tests now compute it too — every band
against the untrained fill in both themes, read straight off a single `HEAT_PAL` object so a
retune in one theme cannot skip the other. The dash geometry, by contrast, could only be
settled by rendering the thing and looking at it; the first choice passed every assertion and
looked broken.

**949 passing** — calc 414 · hex 225 · render.smoke 272 · sw 38 — plus 15/15 mutations caught.
SW cache `rft-v76`.

*(Read that total from the runner. **Six** hand-summed totals in this branch have now been
wrong, three of them in this pass — including, on the first draft, the line directly above
this one. Every one was caught by re-running the suites, none by re-checking the arithmetic.
The habit to copy is not "add carefully"; it is "do not add".)*

Still open, with nothing left that was mis-stated: the rest-day day-picker (low severity —
"Day X anyway" already ships, only the A/B/C picker is missing); the light install splash
(platform limitation, above); no extensor-endurance slot (accepted since v16).

---

## 15 · Sixth pass — bottom-up, from the untrodden edges (26 Jul 2026)

Five passes had concentrated on the progression engine, the data/load path, accessibility,
the theme system and the service worker's navigation branch. This pass started from the
places nobody had executed: `save()` under a full disk, the two-tab merge under a real
deletion, cardio, the fatigue meter's own stated invariant, and the service worker's *font*
branch. Everything below was reproduced by running the real function and printing before and
after; nothing here is a code-reading argument.

Five behavioural changes, one per commit, each with the reproduction in its message.

### Fixed

| # | Finding | Reproduction (before → after) |
|---|---|---|
| **F1** | **A quota-blocked save silently destroyed another tab's sessions.** `save()` bumped `D.gen` *before* the `setItem`, so a write that threw still advanced the generation. That left the tab's gen ABOVE the sidecar, and the conflict guard only merges when `sidecar > D.gen` — so the merge was skipped on the next write. The quota alert tells the user to free space and tap Save again, which is exactly the sequence that triggers it. | Two vm contexts sharing one `localStorage`, tab A on a tight quota: two failed saves (`gen 2, 3`), tab B logs and saves (`store: s1,sB`), A frees space and saves → **`store: s1,sA` — `sB` gone**. After: failed saves leave `gen 1`, the merge fires, **`store: s1,sA,sB`**. |
| **F2** | **The fatigue meter fell when you logged more work.** `getFatigue`'s comment asserts twice that this can never happen, and load-weighting the two averaged terms was supposed to have secured it. It did not: *any* mean is non-monotone, because the added entry lands in numerator and denominator at once. | One brutal session (RPE 5, 10t) read **8.6 Fatigued**; adding one easy light session (RPE 1, 1t) dropped it to **4.9 Ready** — two bands down for strictly more work. Cardio hit the same wall: **3.1 Ready → 2.9 Fresh** after a 10-minute row. Swept: **182 of 1080** lifting+cardio states scored lower with the cardio logged; **724 of 25 380** crossed a label boundary downward. After: **0 of 20 000** randomised "add one entry" fuzz cases, and 0 of the 105 deterministic sweep cases now in `calc.test.js`. |
| **F3** | **A mistyped cardio entry was permanent.** Cardio had no delete and no edit anywhere in the app. 300 minutes typed for 30 skews the fatigue meter, the Monthly minutes total, the Cardio Minutes/Week chart and the heat map forever — and the cardio merge in *both* `mergeImport` and `mergeStores` is purely additive, so re-importing a corrected backup does not remove it either. The only escape was Reset All Data. | Chromium, 20 seeded rows: before, the Log Cardio screen has no list and no delete control in the DOM. After, a `Recent · 20` list with one confirm-gated ✕ per row; **cardioLog 20 → 19 in memory and 19 in `localStorage`**, verified in light and dark, no console errors. |
| **F4** | **A stale tab resurrected a session you deleted.** `mergeStores` unions the append-only logs, which is right for everything except deletion. Delete a session in one tab, then save *anything* in a second open tab — a banner dismiss, a theme tap, a cardio entry — and the still-present row was unioned back in. | Two vm contexts, real `delS` (two taps): A deletes `sA` → `store: s1,sB`; B saves a cue → **`store: s1,sA,sB`**. After: **`store: s1,sB`**. |
| **F5** | **A hanging font host stopped the app booting.** The Google Fonts stylesheet sits in `<head>` above the inline app script, so it is render- *and* script-blocking. The SW's font branch was cache-first-then-network with a `.catch` — and `.catch` only fires on a *failed* fetch. On a captive portal or a dead-but-connected signal the request **hangs**, and the page stays blank. This is the exact hazard the navigation branch races a 3s timer against; the font branch had no deadline. Nor is it first-load-only: `activate()` evicts the previous release's cache, so the launch right after **every update** re-fetches the fonts. | Chromium, SW installed and controlling, font cache entries evicted the way `activate()` does, every `fonts.g*` request left hanging (never fulfilled, never aborted): before, the cached shell was served in **43 ms** and the app screen was **still blank after 20 s**. After, the app rendered at **2.6 s** in fallback typography. |

Implementation notes worth carrying forward:

- **F2's shape.** Effort and per-session volume are now *peaks* instead of load-weighted means.
  A max over non-negative per-entry terms can only grow, so monotonicity holds by
  construction. On a **uniform** week max == mean — and all three documented calibration
  anchors are uniform weeks — so the calibration reproduces exactly: 3 sessions @RPE3 2.9t
  = **4.9 Ready**, 5 hard sessions @RPE4+ = **9.8 Fatigued**, 1 light session @RPE2 =
  **1.5 Fresh**, 7 easy walks with no lifting = **1.3 Fresh**. It differs only on *mixed*
  weeks, and only upward: it now reads "the hardest thing you did, plus how often you
  trained" instead of letting an easy session average a hard one away.
- **F3 opened a third door to an old sink.** Cardio ids now reach an inline `onclick`, the
  same sink cue keys and session ids feed. `mergeStores` adopted the other tab's cardio rows
  verbatim — the one unguarded entrance — so it now applies `mergeImport`'s charset filter and
  dedupes ids *within* the incoming list as well as against our own. The render site
  independently refuses to emit a row whose id it cannot safely address.
- **F4's tombstones.** `D.deleted` holds up to 300 deleted session ids (~20 bytes each);
  `mergeStores` unions them from both stores and applies them to both sides, so a delete in
  either tab wins and then propagates. An **import** is allowed to lift a tombstone: it is an
  explicit, reported act, unlike the silent union, so restoring a backup genuinely restores.
  Stores written before this release simply have no such field.
- **F5 is cache-first still.** A cached font short-circuits with no network call and no timer
  at all. Only a MISS is put on a 2.5 s deadline, and losing the race costs one load of
  fallback typeface; the in-flight fetch is held open by an explicitly-claimed `waitUntil`,
  so the font still lands in the cache for the next launch.

### Checked and found clean

Each of these was **executed**, not read. Every probe below was then deliberately broken to
confirm it could fail — the ones that could not are called out.

| Area | What was actually run | Result |
|---|---|---|
| **Plate math and the three loading ladders** | Independent brute-force re-derivation of every reachable total for VW / VWH / VWL, compared set-to-set against the shipped ladders; `perSide` re-solved for **every** rung and checked against the per-side pair caps and the bar weight; `nxUp`/`nxDn`/`snapW` round-tripped on every rung; `dbEnd` re-solved for every DB rung against the 4-plates-per-sleeve cap. | **Clean.** VW 149 rungs (11–85), VWH 149 (7–81), VWL 297 (11–85), DBW_PAIR 31 (2–18.5), DBW_SINGLE 37 (2–22). No missing rung, no extra rung, no cap violation. Claimed "exhaustively verified" twice before; it holds. |
| **Date and timezone math** | `dayDiff`, `weekKey`, `weekKeys`, `daysAgoStr` across both 2026 NZ DST transitions and 400 consecutive days, under **six** timezones including two half-hour and two southern-hemisphere zones. All five suites re-run under three timezones. | **Clean.** No off-by-one, no non-Monday week key, no `weekKeys` gap, no `daysAgoStr` skip. Suites pass identically under Pacific/Auckland, America/St_Johns and UTC. |
| **Chart rendering with degenerate data** | `svgBars` / `svgLine` / `spark` over empty, single-point, all-zero, all-equal, negative, 1e9-range and 60-point inputs, plus out-of-range marks and a target above the max; every emitted numeric SVG attribute and every `points` list parsed. | **Clean.** No `NaN`, no `Infinity`, no `undefined` in any attribute. *(The first version of this probe reported 130 false positives because its regex matched substrings of `viewBox` and `text-anchor`; it was then verified to fail on a real defect by removing `svgBars`' `,1` floor, which produces `height="NaN"`.)* |
| **Deload / phase state machine with interleaved venue switches** | 60 sessions with 9 venue switches, 2 phase changes and a deload, re-reading the entire surface at every step: `getPhaseInfo`, `getDeload`, `getFatigue`, `getCycleInfo`, `consistency`, `statSnapshot`, every suggestion on every day at both venues, and a deep `NaN`/`Infinity`/`"undefined"` scan of every analytics return value. | **Clean.** No throw, no non-finite number anywhere, no `NaN`/`undefined` leaking into suggestion text. Probe verified to fail (612 issues) when `e1rm` is made to return `NaN`. |
| **Rest timer, alarm and midnight** | Wall-clock resync after a simulated 90-second background gap; alarm-takeover build-once-per-transition; the ~60 s sound cap with the overlay persisting; dismiss leaving the overtime pill; restart and `clearTimer`; and a workout started at 23:50 finished after midnight. | **Clean.** The pill resyncs to `+1:30` from a single late tick, the overlay markup is byte-stable across ticks, and the session is dated by its **start** day. Probe verified to fail on both counts (tick-counting instead of wall-clock; `ymd(new Date())` instead of `ymd(new Date(SS))`). |
| **Hostile-input rendering (XSS)** | A break-out payload placed in session notes, per-exercise notes, band, cardio type and every cue value, then **every** view rendered — Home, all six Progress segments, per-lift detail, Body, History (collapsed and expanded), Log Past, Plates, Settings, Cardio, Workout — and the output scanned for the raw payload. | **Clean.** `esc()` escapes quotes as well as `&<>`, so it is safe in attribute position too. |
| **Hostile / partial import** | `mergeImport` against `null`, `{}`, non-array `sessions`, all-malformed sessions, `phase:9` / `phaseStart:'banana'` / `location:'moon'` / `nextDay:'Z'`, object-valued `band`, array-valued `notes`, string `wt`, all-null `wts`, id-less cardio, junk body-log keys, and a `__proto__` cue key. | **Clean.** Unsalvageable input throws (caught by `impD`, "nothing was changed"); salvageable input is coerced; no prototype pollution. |
| **Schema migration from old backups** | A v11-era store planted under `rft-v11`, `rft-v9` and `rft-v5` in turn, plus the both-keys-present case. | **Clean.** Sessions preserved, venue derived from exercise ids, tonnage recomputed to the current formula (900 / 600 kg — correct for the `per_db` doubling), dead fields (`dayCFocus`, `confirmed`, `difficulty`) dropped, stale keys cleared, and the current key wins when both exist. |
| **Service worker end-to-end** | Real Chromium: register, control the page, reload, inspect cache keys and contents, then go offline and reload. | **Clean.** One cache (`rft-v81`) holding exactly `/`, `/index.html`, `/manifest.webmanifest`; the offline navigation is served from cache with `responseEnd` at **43 ms** and 48 sessions intact. The 13-second offline reload this first appeared to show was entirely the font stylesheet — which is F5, not the navigation branch. |

### Corrections to §1–§14

- **§13 overstates the cardio-fatigue fix.** The entry reads as though load-weighting removed
  the effect that "easy cardio dragged the effort term down". It reduced it; it did not remove
  it, and the invariant the source comment states remained false in 17% of sampled
  lifting+cardio states. It was also never only a *cardio* problem — an extra easy **lifting**
  session broke it harder (8.6 → 4.9). Superseded by F2.
- **§11–§14 treat `mergeStores` as complete.** It is described as unioning "the append-only
  logs", which is accurate as far as it goes, but the store is not append-only: `delS` removes
  rows, and until F4 nothing carried that across the merge. Two of the three unguarded-sink
  audits (cues in §13, session ids earlier) also missed that cardio ids were adopted verbatim
  from the other tab.
- **The CI cache-bump check is a warning, not a failure.** `.github/workflows` emits
  `::warning::` and the step exits 0. Every commit in this pass bumps it anyway
  (`rft-v76 → rft-v81`), but a future pass should not assume CI will stop a missed bump.

### Deliberately left

- **Cardio duration accepts negative and absurd values.** `saveCardio` guards only
  falsiness, so `-30` is stored as `-30` and skews every cardio total. F3 makes this
  recoverable — you can now delete the row — which drops it from "unrecoverable" to
  "annoying". A clamp belongs in the same place as the equivalent body-measurement guard;
  not taken here to keep F3's commit to one behaviour.
- **The Cardio Minutes/Week chart includes the in-progress week.** The tonnage and
  sessions charts on the same screen deliberately exclude it ("complete weeks only") and
  report it as a "this week so far" line instead. The cardio chart does not, so mid-week
  reads as a crash. Cosmetic; the inconsistency is worth closing, but it changes a chart's
  meaning and deserves its own pass.
- **The Training Cycle timeline overflows its card** on a 390 px viewport: with five recent
  sessions the "next" node — the most useful thing in the strip — sits off-screen behind an
  `overflow-x:auto` with no scroll affordance. Confirmed by screenshot. Cosmetic.
- **Import duplicates rows that are duplicated inside the backup itself.** The seen-sets for
  `cardioLog`, `bodyLog` and `discomfort` in `mergeImport` are seeded from the current store
  and never updated inside the loop, so a file containing the same id/date twice inserts both.
  `mergeStores`' cardio branch was fixed as part of F3; the import side is harmless in
  practice (the app never writes such a file) and was left alone.
- **The Body screen's history list is capped at 20 with no "show more"**, so with a longer
  log the older entries are neither visible nor deletable. History itself got pagination in
  §14; Body did not.
- **The update toast can be missed.** `updatefound` is attached after `register()` resolves,
  so a worker that finished installing before that point never fires it. Harmless in
  practice — `skipWaiting()` means the new version is live on the next launch regardless.
- **First-ever load still blocks on the font stylesheet.** F5's deadline lives in the service
  worker, which is not yet controlling the page on a cold first visit. Making the `<link>`
  non-blocking would fix that too, at the cost of a fallback-font flash on *every* load; not
  worth it for the one visit that is almost certainly online.

### Method notes

Two of this pass's five findings were only visible because a probe was pointed at something
nobody had executed, and **two of the probes were wrong before the code was**:

- The degenerate-chart probe reported 130 failures that were all its own regex matching
  substrings of `viewBox` and `text-anchor`.
- The service-worker font-deadline test hung the whole suite on first run, because the font
  deadline is armed *after* the cache lookup resolves — so the fake clock had to let
  microtasks drain before it could see the timer at all. The suite's own hang guard caught it.

That is now **six** harness defects in six passes. The rule that keeps paying: after a probe
passes, break the thing it claims to watch and confirm it fails. Applied throughout:
**14** `index.html` mutations guarding the four in-app fixes (F1 ×1, F2 ×3, F3 ×4, F4 ×6),
**3** new `sw.mutate.js` entries for F5, **4** more used to prove the read-only probes above
could fail at all, and **4** baseline mutations run first to confirm every suite still
propagates a failure to a non-zero exit. Each was asserted to have actually changed the file
before its result was believed — one candidate turned out to be a semantic no-op and was
discarded rather than recorded as an uncaught escape.

One mutation-harness subtlety worth recording: adding the font deadline gave `sw.js` a
**second** `net.then(r => { clearTimeout(timer); done(r); })`, and `String.replace` patches
the first match — so the pre-existing "leaves the deadline timer pending" mutation silently
moved off the navigation branch and onto the new one. It still "passed". Both are now anchored
on their own `setTimeout` line, and both are tested independently.

**1007 passing** — calc 449 · hex 225 · render.smoke 286 · sw 47 — plus 17/17 SW mutations
caught. SW cache `rft-v81`.

*(Total summed by a script reading the four runners, not by hand. Seventh time lucky.)*
