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

---

## 16 · Sixth pass, in parallel — the form layer, the notification path, and a dead stub (26 Jul 2026)

*§15 and §16 are both sixth passes. They were audited concurrently from the same base
(`a4f986e`) and neither saw the other's findings until the merge; the numbering is order of
landing, not order of work. Their findings do not overlap and neither contradicts the other.
This section also verifies §14 — every number in it reproduces — closes the rest-day picker
§14 left open, and adds one contrast pair §14's sweep did not measure.*

### §14 is the first pass in this branch whose claims all hold

Every number §14 recorded was re-derived from scratch — WCAG luminance written from the spec
text rather than borrowed from the suite that computes it, program volume re-summed from
`getProgram` × `MG` — and every one reproduced exactly:

| §14 claimed | Re-measured |
|---|---|
| amber 3.55/6.10, green 3.87/6.17, cyan 3.71/5.12, mute 4.62/5.05 (light/dark vs untrained) | identical to two decimals, all ≥ 3:1 |
| home over MAV: Back 22.5/22, Glutes 16/12, Triceps 15/14; partner clean; every muscle ≥ MEV | identical |
| `hex.test.js` and `render.smoke.js` now exit non-zero | confirmed by mutation, both suites |
| History heading reports the true total; `HIST_N` resets on `go` | confirmed |
| `saveBod` clears a blanked field and no-ops on a first log | confirmed — **and it has five test calls, contrary to a claim this pass nearly made; see the method note** |

Four passes running, the backlog was the least reliable document in the repo. This time it
was right. The thing that was wrong this pass was the *auditing*, twice — both times mine.

### Fixed

| Finding | Before → after |
|---|---|
| **The accessibility pattern stopped at the form layer.** §13 gave every screen a heading outline and completed the tab pattern, then stopped. **1 of 4 `<select>`s and 4 of 12 `<input>`s had an accessible name**; the rest leaned on a placeholder (`—`, `kg`, `S1`, `Notes...`) or on a `<div class="lb">` caption associated with nothing. A screen-reader user reached the cardio form and heard "edit text", twice. | The captions became `<label for>` (they already sat above controls that already had ids — nothing was invented, only connected); controls with no visible caption got `aria-label`. `.lb` gains `display:block`, which is now load-bearing: a `<label>` is inline by default and would collapse onto the control's line. |
| Three icon-only `✕` buttons had no name — two deload dismissers and the cue delete. The warm-up dismisser **three lines above the first** already had `aria-label="Dismiss"`. | All three named. |
| **The two notifications a user meets first both used the delivery path that does not work.** `notifyRestDone` routes through `reg.showNotification` and its own comment says why — page-context `new Notification` is unhonoured on most mobile browsers and throws outright on Android Chrome in an installed PWA. The **permission confirmation** and the **"Send test ping" button** used the constructor anyway, each behind a bare `catch`. On Android both did nothing, silently: grant permission, see no confirmation, tap a button labelled "Send test ping", see nothing, conclude notifications are broken — while the real rest ping would have fired. | One `showNotif(title,opts)` helper, SW-first, constructor as documented fallback. All three sites call it. The test ping now carries the real ping's icon and badge too — if the icon is what breaks delivery, the test must break with it. |
| The same button carried `notifyRestDone.__test=1;` in its `onclick`. `__test` is read nowhere in `index.html` or `tests/`. | Deleted. |
| **`sw.js` returned a failed asset fetch as a 200.** `new Response('Offline')` defaults to status 200, so a stylesheet or script that never loaded came back as a *successful* response whose body is the word `Offline` — CSS silently no-ops, JS throws a syntax error, and neither reads as "offline". The fonts branch in the same file already returned 504. | `504`, matching the fonts branch. The old test asserted `r.body === 'Offline'` and so passed on exactly this bug; it now asserts the status. |
| **Backlog cleared: the rest-day card had no day picker.** It shipped "Day X anyway", so on the day after a session the suggested day was the only one reachable in one tap — you could train, but not choose. | Both heroes now share one `picker`/`repeatHint` definition. No engine change: `nd` already came from `PICK_DAY||D.nextDay` and the "anyway" button already honoured it — the picker was simply never rendered on that branch. |

### Recorded, not fixed — one number §14's sweep never took

§14 measured all four *trained* bands against the untrained fill and cleared 3:1 everywhere.
It never measured the untrained fill itself. Against the silhouette it sits on, `none` is
**1.09:1 in light and 1.14:1 in dark** — worse than the 1.26/1.45 under-MEV floor that §14
called "the one state that asks the user to act was the hardest to see", and zero sets is at
least as actionable as under-MEV.

It is not fixed here because `none` is the reference all eight passing ratios are measured
*against*: moving it re-derives every one of them. That is a palette pass, not a token tweak,
and half-doing it is how §13's "half-fixed and called done" entries happened. Both values are
now **pinned in `calc.test.js`** at their known-bad measurements, so the number cannot drift
in either direction while it stays open — the same treatment §14 gave the accepted MAV
overages.

### The harness, a fifth time

**`global.navigator = {...}` is a silent no-op on Node 18+.** `navigator` is a getter-only
accessor on `globalThis`; the assignment neither takes nor throws. All three eval-based
harnesses used it, so **every `navigator` stub in this repo has been inert since it was
written** — anything reading `navigator` got Node's real one. Nothing depended on it yet, so
nothing failed. It was a trap set for the first test that did, and this pass was that test:
the notification routing test failed with `Cannot read properties of undefined` on a stub that
looked assigned. All three now use `Object.defineProperty` and **throw if the stub did not
take**.

That is the fifth harness defect in six passes, after an over-escaping stub, a suite that
drained the event loop and exited 0, a test pointed at the wrong screen, and two suites with
no `process.exit(1)`. §15 independently found a sixth in the same pass — a `String.replace`
mutation that silently moved onto a newly-added second match and kept "passing" — which two
audits running blind to each other both landing on the scaffolding says more than either
finding does alone.

Two more from this pass, both caught only by mutation:

- The new accessible-name sweep **passed over two controls that were never rendered** — the
  Progress exercise picker (on the `lifts` segment; the sweep only visited `overview`) and the
  Settings cue-delete button (the fixture had no cues). Both mutations escaped. A sweep is
  only as wide as the fixture: it now walks all six Progress segments and seeds a cue, with
  explicit assertions that each screen renders the controls it is being swept for.
- `calc.test.js` gained its first async block. Printing the total inline would have reported a
  figure taken before those assertions ran *and exited 0 while they were still pending* — the
  same defect class as the two suites that exited 0 with failures. It has an `exit` hook that
  fails the run if the suite ever finishes without reporting.

### Method note — I made §14's own mistakes, twice

§14 ends by warning that a `grep | head -12` truncated away the evidence and produced a
confident, wrong claim. This pass ran `grep "saveBod\|bodyLog" tests/*.js | head`, watched the
`bodyLog` hits fill the window, and concluded **"§14's `saveBod` fix shipped with no test."**
It has five test calls and a full block of assertions. `grep -c` first, then read.

And the first four mutations run against §14's exit-code claim all "escaped" — one `sed` that
did not match, three aimed at strings no suite asserts. §14 warns about exactly the first of
those. **A mutation that does not mutate, or that mutates something untested, is not evidence
the suite is broken — it is evidence the auditor is.** Every mutation in this pass checks that
the file changed and names the suite it expects to fail.

**1059 passing after the merge with §15** — calc 458 · hex 225 · render.smoke 327 · sw 49 —
plus 18/18 mutations caught. SW cache `rft-v82`.

*(§16 alone was 1000 — calc 423 · hex 225 · render.smoke 312 · sw 40, 16/16 mutations, cache
`rft-v77`; §15 alone was 1007 at `rft-v81`. The merged figure is not the sum of the two: both
passes extended the same four suites, and §16's accessible-name sweep grew by one assertion
during the merge, below. `rft-v82` because neither input shell was ever served with the
other's changes.)*

*(Read from the runner, and this time summed by the shell too:
`for f in calc.test hex.test render.smoke sw.test; do node tests/$f.js | tail -1 | grep -o '^[0-9]*'; done | paste -sd+ | bc`.
Six hand-summed totals in this branch have been wrong. The seventh was not attempted.)*

### What the merge itself found

§15 and §16 merged with three conflicts — the SW cache version, the cardio form (§16 turned
its two captions into `<label for>`; §15 restructured the same function's tail to add the
Recent list), and the two `## 15` headings. All three were mechanical. **Neither pass's fixes
collided and neither pass's claims contradict the other's.**

The one real finding came from running §16's accessible-name sweep against §15's new markup:
**it reported the Cardio screen clean while §15's per-entry delete buttons were not being
rendered at all**, because the fixture's `cardioLog` is emptied earlier in the file and the
Recent list is gated on it being non-empty. That is the third time in one pass that this sweep
passed over a control that did not exist — the Progress exercise picker, the Settings cue
delete, and now these. The sweep now seeds `cardioLog` too, and asserts the delete buttons are
present before claiming they are named; removing §15's `aria-label="Delete cardio entry"` now
fails the build, and did not before.

The general lesson is the one this branch keeps relearning in new clothing: **a sweep reports
on what the fixture rendered, not on what the app contains.** Every gate that hides a control
is a hole in the sweep, and the only way to find those holes is to mutate the fix away and
check that something fails.

### Still open after both sixth passes

Merged from §15's "Deliberately left" and §16's own list. Nothing either pass opened was
closed by the other.

From §16: the untrained-vs-silhouette heat contrast (measured, pinned in `calc.test.js`,
needs a palette pass because `none` is the reference every passing band ratio is measured
against); the light install splash (platform limitation — the manifest has no media
mechanism).

From §15: cardio duration accepts negative and absurd values; the Cardio Minutes/Week chart
includes the in-progress week when its neighbours do not; the Training Cycle timeline
overflows its card at 390 px; `mergeImport` duplicates rows already duplicated inside a
backup; the Body history list is capped at 20 with no "show more"; the update toast can be
missed when a worker installs before `updatefound` is attached; a cold first load still
blocks on the font stylesheet, which F5's service-worker deadline cannot reach.

Standing: no extensor-endurance slot (accepted since v16).
## 17 · Program v18 — the triceps extension goes back on the ground (27 Jul 2026)

**Not an audit finding — a lifter request.** v13 swapped Day B's Lying Barbell Triceps
Extension (`bb_skullcr`) for an Overhead Triceps Extension (`oh_triceps_ext`) on the usual
long-head-stretch argument. v18 reverts it. The reason is practical, not hypertrophic: on
the floor the bottom depth is capped by the floor itself and the bar can be parked mid-set,
neither of which the overhead version allows once the bar is behind the head.

| | before (v13–v17) | after (v18) |
|---|---|---|
| Day B slot | Overhead Triceps Extension | Lying Barbell Triceps Extension (floor) |
| active id | `oh_triceps_ext` | `bb_skullcr` |
| retired stub | `bb_skullcr` | `oh_triceps_ext` |
| `PHASES.adj` | `oh_triceps_ext` P1 10-12 / P2 12-15 / P3 8-10 | same numbers, on `bb_skullcr` |
| `RELATED_EX` | `oh_triceps_ext` ← `bb_skullcr` × 0.9 | `bb_skullcr` ← `oh_triceps_ext` × 1.1 |

Sets (3), rest (0:50), bar (straight, 11kg), tempo and `MG` credit (`triceps:1`) are all
unchanged, so weekly triceps volume does not move and no MEV/MAV landmark shifts. Day counts
stay home A=9 B=8 C=10.

**The one rough edge, recorded rather than papered over.** `getRelatedSuggestion` fires only
when an exercise has *no* history at all. A device that logged skullcrushers before v13 has
`bb_skullcr` history — months stale — so it reads its own last pre-v13 session instead of the
×1.1 carry-forward from the overhead slot. Rewriting logged sessions to fix that would be
worse than the symptom, so the slot's coach note asks for one manual re-anchor instead. Fresh
devices, and anyone whose extension history is entirely post-v13, get the correct carried load
automatically.

`migrateToV18` is a stamp — both ids live in `ALL_EX`, so every session logged on either one
still resolves in history, charts, PRs and tonnage.

**1010 passing** — calc 451 · hex 226 · render.smoke 286 · sw 47 — plus 17/17 SW mutations
caught. New assertions: Day B carries `bb_skullcr` on a straight bar and no longer carries
`oh_triceps_ext`, the overhead stub still resolves from `ALL_EX`, the ×1.1 carry-forward is
wired, `bb_skullcr` periodizes and `oh_triceps_ext` no longer does, and `migrateToV18` stamps
18 idempotently while touching nothing else. SW cache `rft-v82`.

---

## 18 · Program v19 — the core block moves off the lifting days (27 Jul 2026)

**Also a lifter request, but it started as a misdiagnosis worth recording.** The reported
symptom was "core is below MEV". The program was not short on core: a full A→B→C week is
**10.5 effective sets against MEV 6**.

| Day | Slot | Credit |
|---|---|---|
| A | Dead Bugs (Barbell) ×3 | 3.0 |
| B | Side Plank ×3 | 3.0 |
| C | Landmine Anti-Rotation ×3 | 3.0 |
| C | Hex Carry ×3 (bilateral carries score 0.5) | 1.5 |

The dashboard reads a rolling **7 days**, so it drops under 6 in exactly two situations: a
week catching only two sessions (A+B lands on **6.0 — on the line**, and one dropped set puts
it under), or the side plank being skipped. Both were happening. Core was a *finisher on every
day*, which is precisely the slot that gets cut when a long session runs late.

So the fix is placement, not volume. The four core slots leave A/B/C and become one
off-rotation day `X`, run on a cardio or rest day, started from the Cardio screen.

| | before | after |
|---|---|---|
| home days | A=9 B=8 C=10 | A=8 B=7 C=9 **+ X=4** |
| partner days | A=7 B=9 C=7 | A=7 B=8 C=6 **+ X=3** |
| home core | 10.5 (A/B/C) | **12.5** (A/B/C/X) |
| partner core | 12.5 (A/B/C) | **12.5** (A/B/C/X) |
| anti-extension | dead bugs | dead bugs **+ `bb_rollout`** |
| extensor endurance | *(none — §15's accepted gap)* | **`bird_dog`**, reactivated |

`side_plank` is replaced at home by **`bb_rollout`** at the lifter's request. It is `tp:'bw'`
deliberately: a rollout progresses by *leverage* (knees → feet), and **bigger plates make it
easier**, so a kg ladder would have been actively wrong. The plank survives at the partner
venue, which has no barbell for a rollout.

⚠ **Recorded, not hidden:** anti-lateral flexion at home is now covered only by the Day-C hex
carry's single-side last set — the rollout doubles up on anti-extension with the dead bugs.
The lifter declined a carry in that slot after being shown this trade-off. Accepted with eyes
open, logged here so a later reader doesn't mistake it for drift.

### Off-rotation is the part that could break silently

Day `X` is a **real** session — real sets, real MG credit, real progression history — that sits
outside the cycle. Logging one must never advance `nextDay`, or every core block would quietly
consume a lifting day. Four sites derive `nextDay` from history (`saveSumm`, `delS`, retro-log,
`mergeStores`); all four now route through `isRotDay`/`lastRotSession`. `getCycleInfo` filters
off-rotation sessions out entirely — leaving them in made the timeline's rest-day gaps *lie*,
reading a core block on a rest day as back-to-back training.

**Three defects were found by writing the probes, not by review:**

1. **`ALL_EX_RAW` only spread A/B/C.** The core block's exercises had no `ALL_EX` entry at all,
   so suggestions, swaps, tonnage and history lookups fell through on every one of them. Caught
   by an existing test (`db_dead_bug` tonnage) the moment the slot moved.
2. **The dead-`PHASE_ADJ` guard swept only A/B/C** — so it reported `lm_pallof` as dead the
   instant it moved to X. The guard existed *specifically* to catch ids drifting off the active
   program, and it had the same blind spot as the thing it was watching. Same for the weekly-
   volume sweeps and the MG-coverage check: five whole-program sweeps, all A/B/C-only.
3. **The card's button called `startW`, which is not a global.** Every unit test passed; the
   real browser threw `ReferenceError` on click. The exposed name is `beginW`. Nothing short of
   loading the page could have found this — the test now asserts the handler names a function
   that actually exists.

Defect 2 is the one worth keeping: a guard that sweeps `['A','B','C']` cannot see a fourth day.
The sweeps now use a single `PROG_DAYS` constant, and a **negative** assertion pins it — an
A/B/C-only core sweep must read *under* MEV. If that test ever passes, a sweep has lost day X.

**Live Chromium check:** core card renders on the Cardio screen with all four movements; the
block starts, logs and saves; `nextDay` **A → A** across a saved core block while the session
count goes 8 → 9; 7-day core reads **11 sets**; history badge reads "Core", not "Day X1";
heatmap cell shows `✦`, and a Day-B session logged the same date correctly wins the cell back.
Only failed request is the Google Fonts CDN (no network in the sandbox). Zero page errors.

This closes the **"no extensor-endurance slot (accepted since v16)"** standing item that
§16 was still carrying — `bird_dog` is active again, in both core blocks.

SW cache `rft-v84` (rebased onto the parallel-pass merge, which had already claimed v82).

---

## 19 · Program v20 — the core block comes back, and every day is sorted by implement (28 Jul 2026)

**Three lifter requests in one pass**, and the first of them reverses §18.

### 19.1 · The off-rotation core block did not survive contact with reality

§18's diagnosis still looks right: core was a *finisher on every day*, and finishers get cut
when a long session runs late. The fix was wrong in a way no amount of code review would have
caught — it moved the work to a session that has to be *started on purpose, on a rest day*.
A block that needs its own session on a rest day is a block that does not get run at all.
Reported plainly: "this separate core day on rest isn't working for me."

So the movements go back onto the lifting days, but placed by **implement** rather than
appended as finishers — which is the same principle as 19.2, and the reason both landed
together:

| | v19 (day X) | v20 (back on the rotation) |
|---|---|---|
| home | `bb_rollout` `dead_bugs_a` `lm_pallof` `bird_dog` | A ← `dead_bugs_a` · B ← `bb_rollout` + `bird_dog` · C ← `lm_pallof` |
| partner | `db_dead_bug` `side_plank` `bird_dog` | A ← `bird_dog` · B ← `side_plank` · C ← `db_dead_bug` |
| home days | A=8 B=7 C=9 **+ X=4** | **A=9 B=9 C=10** |
| partner days | A=7 B=8 C=6 **+ X=3** | **A=8 B=9 C=7** |
| core volume | home 12.5 / partner 12.5 | **unchanged — 12.5 / 12.5** (MEV 6, MAV 16) |

Same slots, same sets, re-homed. `dead_bugs_a` closes Day A's straight-bar block on the empty
bar; `bb_rollout` follows the lying extension on the same bar; `lm_pallof` folds into Day C's
landmine block. The three bodyweight slots cost no setup at all, so they sit last.

### 19.2 · Every day re-sorted to minimise equipment changes

Same-implement lifts now run back-to-back, and within a block the load **descends** so plates
only come off. The no-plate slots (band-assisted pull-ups and dips, bodyweight) are slotted
*inside* the loaded blocks wherever they cost nothing, rather than piled at the end.

| day | implement order |
|---|---|
| home A | hex bar → landmine ×2 → straight bar ×5 |
| home B | hex bar ×2 → straight bar ×2 → landmine |
| home C | hex bar ×2 → landmine ×4 → hex bar (carry) |
| partner A/B/C | dumbbells → clubbell |

**Two compromises, both deliberate, both flagged in the source so they don't read as sorting
mistakes.** Home A runs the landmine lateral raise 3rd (the light end of its block), which
pre-fatigues side delts slightly before the floor press — accepted, because the alternative
buried the day's only quad slot behind six upper-body exercises. Home C returns to the hex bar
for the farmer's carry *after* the landmine block: one extra bar swap, bought because running a
loaded carry before a 4-set landmine squat taxes the trunk and grip that squat needs.

### 19.3 · Every prescribed rest is now 1:00

Lifter's call, applied across the board — both `rst` (what the slot line prints) and `rstS`
(what the timer button starts), which are set independently in the program literal and so are
asserted independently.

⚠ **Recorded, not silently absorbed:** the five heavy pillars (`hex_dl`, `hex_squat_b`, `ohp`,
`pullup_a`, `dips`) were on 2:10–2:30 because that is roughly what phosphocreatine resynthesis
takes. At 1:00 the top-end sets should be expected to come down. That is the trade, not a bug —
the progression engine simply re-anchors to whatever gets logged. If strength stalls on those
five specifically, the rest is the first thing to put back.

### What §18's own tests got right, and what had to be inverted

§18 closed with: *"a negative assertion pins it — an A/B/C-only core sweep must read under MEV.
If that test ever passes, a sweep has lost day X."* That test has now been **inverted on
purpose**: with the core back on the rotation days, an A/B/C-only sweep must read *over* MEV.
The `PROG_DAYS` constant §18 introduced is what made this a one-line change across five whole-
program sweeps — the guard survives the reversal it was written for.

### Stored day-`X` sessions are the part that could break silently

Nothing prescribes `'X'` any more, but stores written between v19 and v20 contain sessions
logged against it. Everything that reads them is **kept, not cleaned up**:

- `isRotDay`/`lastRotSession` stay, so an old core block can never retro-shunt the A→B→C
  pointer through any of the four `nextDay` derivation sites.
- `dayBadge` still renders `'X'` as "Core"; the heat map still marks it `✦` in violet; the
  `--dayX` hue stays in both themes for exactly that reason.
- `getCycleInfo` still filters them out of the rest-gap timeline.
- Every one of the four movements is still in `ALL_EX` — they just arrive through A/B/C now —
  so their loads, charts and MG credit resolve unchanged.

The suggestion-history probes deliberately keep `day: 'X'` fixtures for that reason: a pre-v20
core session must still feed the slot now that it lives on a lifting day.

### Harness

`migrateToV20` is stamp-only (no stored session is rewritten); `programVersion` 19 → 20 in both
`SEED` and `freshState`. New assertions: implement-order sequences per day at both venues,
superset adjacency, every day opening on a loaded compound, both rest fields at 1:00/60 across
both venues, and the rest button/timer stepped across *every* card of a day — checking one card
would have passed no matter what the other eight said.

Suite: 464 + 247 + 344 + 49 passing, 18/18 SW mutations caught.

SW cache `rft-v85` — a stale v84 shell would keep serving the old day order and the old rest
times, so the key moves with the program.

---

## 20 · Program v21 — the partner split collapses into one repeatable session (29 Jul 2026)

The lifter asked for a partner-venue audit — "is it good, is it efficient, is it appropriate,
are the workouts set up well, are there enough reps, sets, weights" — and supplied a full
export (62 sessions, 2026-02-26 → 2026-07-29). The honest summary: the partner program was
well-designed on paper and mis-specified for how it is actually used. Three findings, in
dependency order — the first causes the other two.

### 20.1 · The premise was wrong, and it was what made the days too big

§9/v23 and v27 designed the partner program so that a full A+B+C partner week independently
clears MEV for every muscle. That is why the days had grown to 7-9 exercises.

**That week has never happened.** Partner sessions are 7 of 62 logged (11%), spread over 21.9
weeks with gaps of 3, 14, 22, 13, 21 and 35 days. Day A had been run **once**. At the observed
cadence a full partner A→B→C cycle takes **9.4 weeks**.

The requirement was never one the engine imposed, either: `getWeeklyVolume` counts effective
sets across ALL locations by design ("muscle stimulus accumulates regardless of venue"), and
home supplies 89% of sessions. A per-partner-cycle MEV number described a week that does not
occur, and enforcing it was the sole reason for the exercise count.

### 20.2 · Efficiency — Day B was a 141-minute session

Counting per-side lifts as two bouts, calibrated against the 11 Jul session (32 bouts → 97 min
actual, so ≈3.03 min/bout):

| | exercises | sets | bouts | modelled |
|---|---|---|---|---|
| v20 Day A | 8 | 27 | 32 | ~94 min |
| v20 Day B | 9 | 29 | **46** | **~141 min** |
| v20 Day C | 7 | 23 | 33 | ~100 min |

Logged partner durations climbed 63 → 72 → 83 → 97 min, and those were 15-25-set sessions.
`db_lateral` and `db_rear_fly` appeared on BOTH Day A and Day B — 7 sets of each per cycle, at
5kg, while home already runs `lm_lateral`, `bb_rear_row` and `face_pull`.

### 20.3 · Weights — the venue is out of plates, and the engine cannot self-correct here

Recomputed from `buildDBW`: the MATCHED pair (per_db lifts) tops out at **18.5kg/DB** over 31
rungs; a SINGLE bell reaches **22kg** over 37.

| lift | last logged | reps vs target | headroom |
|---|---|---|---|
| `db_rdl` | 16/DB | 12 vs 10 | **2.5kg** |
| `db_floor_press` | 16/DB | 12 vs 10 | **2.5kg** |
| `db_row_b` | 19 | 10-12 vs 10 | **3kg** |
| `db_carry` | 20 | — | **2kg** (home hex carry: 32) |
| `db_lunge` | 10/DB | **16 vs 10** | 8.5kg |
| `db_curl` | 11/DB | **16-20 vs 12** | 7.5kg |

Every primary loaded compound sits within one or two rungs of the rack ceiling. `db_rdl` at
2×18.5 = 37kg total is the most the venue can ever ask of the hinge; the home hex RDL is 43kg.
The venue is already a maintenance venue for hinge and horizontal press, whether or not the
program says so — so the coach notes now say it and prescribe tempo/pause/leverage escalations
instead of an ↑0.5kg ladder that cannot continue.

The under-loaded lifts could not fix themselves either. The big-overshoot re-anchor moves
≈2.5%/rep over target, capped +12%/session, and the comment at the `over>=4` branch claims "a
light seed self-corrects in 2-3 sessions". True at home. At the partner's, `db_lunge` at 10kg
logged for 16 reps against a target of 10 walks 10 → 11.0 → 12.5 → 14.0 → 15.5 → 17.0: five
Day-C visits, which at one Day C per 7.3 weeks is **about nine months**.

On 11 Jul — the only session run against anything close to the current Day A — **2 of 7 lifts
landed in their prescribed rep range.** Four were over (too light); `db_rear_fly` was prescribed
15-20 at RIR 2-3 and logged 10/10/12/12 at 5kg, i.e. too heavy for its own rep target. §9 had
seeded that lift at 3kg for hypermobile shoulders.

### 20.4 · What v21 does

The lifter's own framing settled the design: *"I'm there irregularly and I just need to have a
day that I can do that is close to home so I'm still working out and progressing to some
degree."* A 3-way split cannot deliver that at 3 visits/month. So:

- **A, B and C now share one full-body base** (`PARTNER_BASE`, 7 movements) and differ only by
  a finisher. Every visit trains the same seven lifts, so the re-anchor gets its 2-3 exposures
  inside a month instead of never. The A/B/C keys are kept — rotation, day badges, history and
  `nextDay` all derive from them, and a partner visit should still consume the slot it lands on.
- **Finishers rotate** so nothing goes stale: A = DB curl ⚡ rear-delt fly, B = dip negatives,
  C = farmer's carry. Plus **one optional clubbell per day** (Mills / Shield Cast / Arm Cast) —
  every partner session ever logged included clubbell work, so all three stay in rotation.
- **v25 is REVERTED.** It had swapped the inverted rows and the Day-C volume row for
  "neutral-grip pull-ups" on the premise that the bars were high enough to hang under. The
  lifter reports they are not — the movement "is more like a reverse row" — so `pb_pullup_a`
  and `pb_pullup_c` were describing an inverted row all along. `inv_rows_a` is reactivated
  under an honest name and is the one partner slot with **no load ceiling** (progressed by
  leverage: feet down → box → high → one leg → archer), which is why it gets 4 sets.
- **`pb_dips` becomes eccentric-only.** v27 prescribed band-assisted dips, but there is nowhere
  under the bars to anchor a band. 3×3-5 five-second negatives, progressed by lengthening the
  eccentric.
- **Partner rests differentiate again.** v20 flattened every rest everywhere to 1:00; at the
  home barbell that was a knowing strength trade-off, but at 16kg dumbbells it was mostly dead
  time. Compounds 0:45, isolation and the plank 0:30, lateral raise ⚡ side plank supersetted.
  **Home rests are untouched.** `db_ohp` deliberately stays a 0:45 compound outside that
  superset — it is one of the few partner lifts with real headroom, and a lift you can still
  add weight to should not be run on a circuit rest.
- **Nine day-specific lifts retire to stubs** (`db_row_b`, `db_lunge`, `db_floor_press_v`,
  `db_sl_rdl`, `db_1arm_press`, `db_dead_bug`, `pb_pullup_a`, `pb_pullup_c`, plus `db_row_c`
  which already was one). Each duplicated a pattern the shared base covers. Six have logged
  history; the stubs keep it resolving in history, charts, PRs and the muscle split.
- **Loads are re-seeded by coach note**, because `RELATED_EX` only fires on a lift with no
  history — the suggestion reads history, so it cannot re-anchor itself downward or by several
  rungs. Following the `bb_skullcr` precedent from §17/v18, the notes now say explicitly to
  type the number in once: `db_curl` → 15kg/DB, `db_rear_fly` → **down** to 3.5kg/DB (the only
  lift that moved down), `db_carry` → 22kg.

Modelled session length, same calibration: **A ~90, B ~87, C ~87 min** mandatory (add ~18 for
the optional clubbell). Day B falls by 38%; Day A barely moves, but now contains a squat, a
hinge, a horizontal pull, a vertical press and core — patterns it previously lacked entirely.
Recorded plainly: **Day A is still the longest day, and the optional clubbell is the release
valve.** An earlier draft of this pass claimed ~77 min by sharing setup cost across supersetted
slots and counting `db_ohp` as a circuit member; both were wrong and the numbers above use one
consistent model.

### 20.5 · Accepted gaps, recorded so they are not mistaken for oversights

- **No vertical pull at the partner's.** The bars are too low. Home trains pull-ups twice weekly.
- **Rear delts on one partner day only** (the Day-A finisher). Home trains them 3× weekly.
- **No direct calf work at either venue** — this is unchanged, but v27's bullet (c) claimed to
  have ADDED `db_calf_raise` to partner Day C when the v16 trim had already retired it and it
  has been a legacy stub throughout. The claim was inert and misled three subsequent passes;
  the comment is corrected in place.
- **Quads sat at exactly 8.0 vs MEV 8** under v20, despite v27's stated "MEV-floor buffer" —
  the buffer never reached quads. Moot under v21 (per-cycle MEV is no longer the contract),
  but the v27 claim was wrong when written.

### Corrections to §11-§19

§19/v20's "every prescribed rest is now 1:00 across the board" is **no longer true at the
partner venue** and its day counts for partner (A=8 B=9 C=7) are superseded (now A=10 B=9 C=9,
one optional each). Both statements still hold verbatim for home, which v21 does not touch. The
inline comment at the v20 day-count line carries this pointer so the next reader does not have
to find this section first.

### Harness

`migrateToV21` is stamp-only; `programVersion` 20 → 21 in `SEED`. The five retired lifts'
`PHASES.adj` entries are removed — the calc suite's "no dead PHASE_ADJ entries" guard would
have caught them, which is precisely what it is for.

Four existing test groups asserted the *old* contract and had to be inverted rather than
deleted — each is annotated in place with why:

- the partner per-cycle MEV/MAV sweep is now **per-visit**, because three days sharing one base
  triple-counts every base lift for a cycle that takes 9.4 weeks and has never been completed;
- two cross-day set-count tests keyed off the real `db_lateral` 4-vs-3 asymmetry, which no
  longer exists anywhere at either venue. They now build the prescriptions explicitly, which
  isolates the engine property under test from incidental program shape — the reason they broke
  is that they were testing the program when they meant to test the engine;
- the v20 rest sweep splits into a home check (1:00/60s) and a partner check (0:45 or 0:30,
  **string and timer agreeing**, and the 0:30s being exactly the isolation/hold slots);
- implement-order and superset-adjacency expectations move to the new layout.

New assertions: every partner day opens with the same 7-movement base; base lifts appear on all
three days (the property the whole collapse exists to buy); days differ only past the base;
retired lifts keep ALL_EX stubs so history resolves; `pb_dips` is bodyweight with no `bandMode`;
`inv_rows_a` is active and not a stub; every partner day is full-body (hams/quads/chest/back/core
all non-zero in a single visit).

Suite: **473 + 267 + 344 + 49 passing, 18/18 SW mutations caught** (was 464 + 247 + 344 + 49).

SW cache `rft-v86` — a stale v85 shell would serve the old partner program and the old rest
times, so the key moves with the program.

---

## 21 · v21.1 — the phase verdict was reading one venue (29 Jul 2026)

Follow-up to §20, prompted by two questions: *"I thought since I'm still increasing why pause
for hypertrophy"* and *"why isn't the hex DL going up, shouldn't the engine be sorting that
out"*. Both were investigated by replaying the real export through the live engine rather than
reasoning about it. One produced a fix; the other produced a correction to this document's own
premise.

### 21.1 · The phase gate was already evidence-based — the bug was its SCOPE

An earlier draft of this pass asserted that "nothing in the app checks progression before
prompting a phase change". **That was wrong.** `getPhaseInfo` has three verdicts, and the one
this lifter is actually in — `timer_only` — renders as *"N weeks of Linear and lifts are still
moving (X/Y progressing). Switch when ready — or ride the wave a little longer."* The app was
already saying the right thing. No new gate was needed and none was built.

The real defect was narrower and easy to miss: `getPhaseInfo` built its lift pool from
`getCurPR()`, which is **location-scoped**. So a block-level decision about the whole training
year was computed over whichever venue the toggle happened to sit on:

| `D.location` | lifts assessed | stalling | progressing |
|---|---|---|---|
| `partner` (as exported) | 7 | 0 | 5 |
| `home` | 23 | 1 | 15 |
| **after the fix (both)** | **30** | **1** | **20** |

Worse after §20: most partner slots are new, so they resolve as `new`/`up` and a
partner-scoped assessment can essentially never register a stall — the venue holding 11% of
the sessions could veto the stall signal from the venue holding 89%. The verdict happened to
be `timer_only` either way here, which is exactly why this survived: it is invisible until the
counts are close to a threshold, and then it flips a decision on a UI toggle.

Fixed by pooling both programs and deduping by id (ids are shared where the movement is
identical, e.g. `side_plank`). This mirrors `getWeeklyVolume`, which has always counted across
venues on the same reasoning — progression, like stimulus, does not care which room it happened
in. Guarded by four assertions that hold `D.location` as the only variable and require the
verdict, `totalEx` and `stalledEx` to be identical at both venues.

### 21.2 · hex_dl is not stalled — and the engine is behaving correctly

Replaying every `hex_dl` session through `getSmartSugg` in order:

```
after 2026-06-20 (55kg   [6,6,6])    -> cf    → Confirm 55kg
after 2026-06-29 (55kg   [6,6,10])   -> up    ↑ 55.5kg
after 2026-07-05 (55.5kg [6,6,6])    -> stay  → 55.5kg (clean up)   [FORM GATE — rated Loose]
after 2026-07-17 (55.5kg [6,6,7])    -> cf    → Confirm 55.5kg
after 2026-07-24 (55.5kg [6,6,6,7])  -> up    ↑ 56kg
CURRENT SUGGESTION: ↑ 56kg
```

Nothing is broken. The load moved 55 → 55.5 → (now) 56 over five sessions because three
deliberate brakes stack on this lift: the **confirm brake** (`hex_dl` ∈ `CONFIRM_LIFTS`, so
every increase costs an extra session at the same weight), the **form gate** on 5 Jul (a
working set self-rated *Loose* holds the load — correct behaviour, and the lifter's own input),
and the **+0.5kg plate step**. Net cadence: about +0.5kg per two Day-A sessions ≈ +1kg/month.

The `over>=4` big-overshoot re-anchor never fires here because it keys off the LOWEST working
set: 6 reps against a target of 5 is `over=1`. By Epley the implied gap at 55.5×6 is only
~1.6kg, so the engine is not far wrong — it is slow, not mistaken.

**Recorded as a separate, unfixed observation:** the `over>=4` threshold is absolute, which
makes it wildly uneven across rep ranges — it demands 9 reps on a 5-rep target (80% over) but
24 on a 20-rep target (20% over), i.e. it is strictest exactly where a rep is worth the most
load. That is a genuine calibration inconsistency worth revisiting. It is explicitly **not**
the cause of the `hex_dl` behaviour above and changing it would not have altered a single
suggestion in that trace, so it was not bundled into this pass on a rationale that does not
hold.

Suite: **477 + 267 + 344 + 49 passing, 18/18 SW mutations caught.** SW cache `rft-v87`.

**Addendum (same day) — `freshState` version drift.** §20 bumped `programVersion` 20 → 21 in
`SEED` but not in `freshState()`, and the calc suite pinned the two with *separate* literal
assertions, so the stale one passed and hid the drift. `freshState()` is written straight to
`D` by `resetAll()` **without** going through the migration chain (that runs in `load()`), so a
factory-reset device booted stamped v20 until its next reload. Benign in effect — `migrateToV21`
is stamp-only — but it is precisely the shape of bug the §19 note ("bump both") existed to
prevent. Both literals are now 21, and the second assertion is **relative**
(`freshState().programVersion === SEED.programVersion`) so any future drift fails regardless of
the numbers. SW cache `rft-v88`. Suite: 478 + 267 + 344 + 49, 18/18 mutations caught.

---

## 22 · v21.2 — the overshoot trigger goes rep-relative, and the phase banner stops nagging (29 Jul 2026)

Both items were raised as findings in §21 and deliberately left unshipped there; the lifter
then asked for whichever was recommended. Both are taken now, separately and on their own
merits.

### 22.1 · `over>=4` was strictest exactly where a rep is worth the most load

The big-overshoot re-anchor fired on an absolute rep count, which ignores what a rep implies in
weight. By Epley, 2 reps over a 5-rep target is ~5.7% underloaded; 2 reps over a 20-rep target
is ~1.7%. A flat 4 therefore demanded 9 reps on a 5-rep slot (80% over target) but 24 on a
20-rep slot (20% over) — backwards.

The trigger is now `min(4, max(2, ceil(tg*0.4)))`:

| rep target | 5 | 6 | 7 | 8 | 10 | 12 | 15 | 20 |
|---|---|---|---|---|---|---|---|---|
| fires at over ≥ | **2** | **3** | **3** | 4 | 4 | 4 | 4 | 4 |

Clamped to [2,4] deliberately, so it can only ever **loosen** for low-rep lifts and never
tightens anything: every target of 8+ keeps the historic behaviour bit-for-bit. The floor of 2
matters as much as the ceiling — one rep over target is the ordinary top-of-range step, not a
re-anchor, and that is precisely the shape of the real `hex_dl` history in §21.2 (6 reps against
a target of 5, a ~2.9% gap). The 40% scaling tracks the Epley curve closely: at tg 5 it fires at
+2, where the true gap is 5.7% and the prescribed jump is 5%. The confirm-lift 8% cap still
binds on top.

**Verified not to be a silent retro-change:** every loadable lift at both venues was replayed
against the supplied export under the committed pre-change `index.html` and the patched one, and
the two suggestion sets are byte-identical. This changes what happens on future sessions where
a low-rep lift is genuinely beaten by 2+; it moves nothing today.

### 22.2 · The soft phase banner regenerated its own dismissal key

`bannerDismissed('phasetimer', phi.phase+'-'+phi.wk)` keyed dismissal to phase **and week**, so
a new key appeared every 7 days and the banner returned however many times it was dismissed —
worst for exactly the lifter it targets, one who has read the "ride the wave a little longer"
advice and decided to do so. Now keyed on the phase alone.

Safe because this is only the `timer_only` verdict. Once lifts actually stall the `due` branch
takes over, and that banner has no dismiss control at all — silencing the soft prompt cannot
silence the real one. Guarded by three assertions, including one that the `due` branch stays
non-dismissible.

Suite: **488 + 267 + 344 + 49 passing, 18/18 SW mutations caught.** SW cache `rft-v89`.

---

## 23 · v21.3 — the partner cards get the treatment the home cards already had (30 Jul 2026)

Prompted by a plain observation: *"the cards for the workouts are not setup as aesthetically as
the home workout, regarding the plates and colors etc, also lets double check the math on those."*

Both halves turned out to be true, and they turned out to be the same problem seen from two
sides — the partner venue had been treated as the secondary one, so neither its presentation nor
its arithmetic got the scrutiny the home program got.

### 23.1 · The presentation gap, measured

Every active slot at both venues, classified by which load control it rendered:

| card treatment | home | partner |
|---|---|---|
| hero readout (66px) + big round ± + plate diagram + warm-up | **22 of 28** | **0 of 28** |
| 76px number box + two 44px steppers + one bare chip run | 0 | 19 |
| naked 76px number box, nothing else | 0 | 4 |
| no load UI (bodyweight / band) | 6 | 5 |

Not a matter of taste: **zero** partner slots got the hero, and the venue that lost it is the one
with the *short* ladders and the *hard* ceilings — where knowing the exact rung matters most. The
DB card also showed a single run of chrome chips for **one end of one bell**, which needed a
caption to explain what it was.

**Fixed — the partner cards now render the same way the bar lifts do:**

- **Hero readout at the same 66px.** Editable here rather than static, deliberately: three
  partner coach notes literally instruct *"type Xkg/DB in once"*, so free entry had to survive
  the restyle. The input width is computed per-render from the value (`tabular-nums` makes `1ch`
  exactly one digit); a fixed width clips `18.5` and `auto` collapses an empty box to nothing.
  Its `height` is pinned to `.88em` — Chromium gives a bare number input ~19px of intrinsic
  extra height, and the flex row aligns on the *input's* baseline, which floated the unit label
  below the number.
- **The whole dumbbell, not one end.** Both plate stacks mirrored around a handle, small plates
  outboard, which is both how a spinlock is actually loaded and what makes the diagram legible
  without a caption.
- **Denomination encoded by diameter.** The chips stay chrome rather than borrowing the barbell
  colour key, for the reason the original comment gave — and that reason is quantitative: the DB
  denominations are 2.5/2/1.25/1/0.5 and **four of the five** collapse into the barbell's single
  "under 2.5" slate bucket, so hue *cannot* be made true here. Diameter can, it is how the real
  plates encode it, and it is one ordered colourblind-safe scale. Verified by rendering every
  rung of the matched ladder: all 30 read distinctly and each matches its own breakdown text.
- **Warm-up ramp (`dbWarmup`)**, walking the spinlock ladder. Gated at 6kg/bell so the 3kg
  accessories — which *are* the shoulder prep — get no pointless "bar only 2kg × 8".
- **The clubbell and the DB carry stop being naked number boxes.** The carry gets the full DB
  treatment; the fixed 8kg club gets the hero plus an explicit *"Fixed 8kg · progress reps &
  control"* chip instead of implying a ladder it cannot climb.
- **Superset pairings surface as a chip** on the prescription line. The partner base runs two
  supersets and the pairing was stated only inside the 9px grey cue blob at the *bottom* of the
  card — i.e. below the fold on the very exercise it governs. It is prescription, not trivia.
- **Live diagram refresh while typing** (`updDbCard`), because `render()` rebuilds the card and
  would steal focus mid-keystroke — which is why the old card simply left its chips stale.

### 23.2 · The math: three prescriptions the equipment cannot build

The spinlock solver itself is **correct** — re-verified by enumeration: every rung of both
ladders resolves to an exact breakdown, respects the 4-plate sleeve cap and the owned-pair
counts, and the ladders and the solver agree in both directions across 2–25kg with no gaps and
no phantoms. The ceilings it reports (18.5 matched / 22 single-bell) are right.

What was wrong was the program text and one engine branch talking about loads the solver would
have rejected:

1. **`db_carry` prescribed "22kg/bell", which is unbuildable.** 22kg is the ceiling when **one**
   bell gets the whole plate pool — that is `db_bss`, the goblet split squat. A farmer's carry
   needs **two matched bells**, and 22kg/bell wants 4×2.5kg per end × 2 ends × 2 bells =
   **sixteen** 2.5kg plates against the **eight** owned. `dbEnd(22, matched)` returns `null`.
   The buildable matched ceiling is **18.5kg/bell**.
   Worse, the card had no ladder at all: `tp:'carry'` fell through to a bare kg box, and both its
   stepper and its seed rounded on the **barbell** path. It now carries `dbLoad:true` +
   `loadUnit:'per_db'`, steps `DBW_PAIR`, snaps its seed onto real rungs, and its cue names 18.5.
2. **`db_rear_fly` instructed "Type 3.5kg/DB in once" — also unbuildable.** 3.5/bell needs
   **0.75kg per end** and the smallest plate owned is 0.5kg; `dbEnd(3.5, …)` is `null` on *both*
   ladders. The adjacent rungs are 3 and 4, and the lift's own `SEED` already used **3** — so the
   note had been fighting the engine. Corrected to 3kg/DB.
3. **The clubbell branch offered a club that does not exist.** A clean session answered
   `"8kg — smooth? → try 10kg"`, and its no-history fallback was `6kg` — matching nothing in the
   inventory — while all three clubbell notes say progression is reps and control, *"never load"*.
   The three casts now declare `fixedKg:8`; a clean session reads as progress via reps/range/
   control, and the fallback is the implement's real weight. The `+2kg` ladder is kept for a
   hypothetical non-fixed club rather than deleted.

Also corrected: **the rep column named the wrong unit.** It hardcoded `Steps` for every carry and
`Reps` for everything else, so the DB carry's header asked for steps while its own cue asked for
metres, and the side plank's header contradicted its "log SECONDS" cue. `repUnit()` now reads the
unit off the prescription string, where it is already declared — verified against all 28 active
slots at both venues, with `hex_carry → Steps`, `db_carry → Metres`, `side_plank → Secs` and every
other slot `Reps`.

### 23.3 · Reviewed and deliberately left alone

- **Per-cycle MEV at the partner venue.** A full A+B+C partner cycle sits under MEV for rear
  delts and over MAV for glutes in isolation. This is the documented v21 design, not a defect:
  `getWeeklyVolume` counts across **both** venues over a rolling window, because muscle stimulus
  does not care which building you were in. Recorded here so the numbers are not re-"fixed".
- **Chrome chips staying bright in dark mode.** Checked in both themes; the barbell chips are
  equally saturated, so the two diagrams remain consistent with each other.
- **`programVersion` not bumped.** No stored-data shape, day membership, set count or rep range
  changes — this is engine correctness plus presentation, the same shape as v21.1 and v21.2,
  which also left the migration chain alone.

### 23.4 · Verification

Every new guard was **mutation-tested** — each of the five fixes was individually reverted in a
scratch copy and the suite confirmed to fail on exactly that revert (`3.5kg` restored → 2 fails;
carry back on the single-bell ladder → 3; `+2kg` club restored → 1; carry seed unsnapped → 1;
`Metres` removed → 2). Two of the new assertions are deliberately *general* rather than
example-based, so this class of error cannot return: every `"Type Xkg"` instruction in the whole
program must name a real rung on that lift's own ladder, and every partner DB suggestion must
land on a buildable rung. The rendered result was checked in Chromium at 390px in both themes.

Suite: **512 + 277 + 367 + 49 passing, 18/18 SW mutations caught.** SW cache `rft-v90`.

---

## 24 · Progression calibration + the session clock the app never had (13 Aug 2026)

Prompted by a question rather than a bug report: *"I feel like im progressing slowly, or am i
being too hard on myself"*. Answered by replaying a fresh export (`2026-02-26 → 2026-08-12`) through the live engine. Most
of the answer was "too hard on yourself"; two things in the app were genuinely wrong, and both
are fixed here.

**The store carries 68 rows and 66 distinct sessions.** Two pairs are duplicates: 17 Mar Day B
(`s7` / `s1773740828259`) is byte-identical, and 19 Mar Day C (`s8` / `s1773903323258`) differs
in one cosmetic field — `pullup_c.band` reads `Green` on one and `Green (heaviest)` on the other.
A first pass at this section deduped only on exact equality and reported 67; the near-duplicate
is recorded here because a cosmetic diff is exactly what an exact-match dedup misses, and because
`getHist` would have counted that session twice had it fallen inside the 5-session window.

**The baseline, for the record.** 66 sessions over 24.0 weeks = 2.75/week, unchanged in the last
fortnight (6 sessions / 14 days). Median session volume by month: 1,686 → 1,859 → 2,595 → 3,400
→ 5,436 → 7,180 kg. `ohp` 16kg×7,6,5 → 27.5kg×7,7,7,7. `floor_press` 26kg×3×8 → 38kg×15,12,12,12.
`pullup_a` off three rungs of band assistance (Blue → Purple) while adding reps. Of 28 loaded
lifts with two or more points in the last four weeks, **21 up, 6 flat, 1 down** — and five of the
six flat are partner dumbbells at the 18.5kg matched-pair ceiling or deliberately capped light.
v21 also worked as designed: two partner visits in nine days, against 7 in the preceding 22 weeks.

Two hypotheses were **investigated and dropped** before they reached this document, which is the
reason it is worth recording them: `bb_rear_row`'s −11.9% (21 → 18.5kg) is the `stalls>=3` deload
branch behaving exactly as specified after three sessions under the rep minimum, and `db_rear_fly`
holding 5kg while its reps climb 10 → 12 → 14 toward a 15-20 range is the rebuild-reps-before-load
path, also correct. Neither is a defect. Likewise `dips`: the engine has been returning *"↑ Less
assistance (thinner)"* for five straight sessions and the band has not moved — the app is right
and the advice is simply not being taken.

### 24.1 · The re-anchor asked how FAR over, never how LONG

`getSmartSugg`'s big-overshoot re-anchor keys on a single session: `over = minRep − ex.tg`, fired
when `over >= overTrig`, where §22.1 made `overTrig = min(4, max(2, ceil(tg*0.4)))`. That is a
sound question about magnitude and it is the only question asked. Persistence is a separate piece
of evidence, and nothing read it.

The export shows what that costs. Seven lifts sat **above the top of their prescribed range for
3-7 consecutive sessions** without ever tripping the re-anchor:

| lift | prescribed | logged lowest set | consecutive sessions |
|---|---|---|---|
| `dips` | 4-8 | 10 | **7 of 7** |
| `lm_squat` | 6-8 | 10-12 | 6 |
| `floor_press` | 8-10 | 12 | 4 |
| `hex_dl` | 5 | 6 | 4 |
| `db_rdl` | 8-10 | 12 | 3 (at rack ceiling) |
| `db_curl` | 8-12 | 16-18 | fires already (+4) |
| `db_floor_press` | 8-10 | 12 | — |

`+2` is below `overTrig` on every target of 5 or more, so none of these escalated. `hex_dl` is the
clearest case and the one the lifter actually noticed: 55 → 56kg over 51 days, the slowest-moving
loaded lift in the program (+0.9% over four weeks, in a window where `hex_row` did +11.8%), while
every one of those sessions was over target. Three brakes stack on it — the confirm brake, a
+0.5kg plate step, and ~8.5 days between Day A sessions — for a structural ceiling near
+0.9kg/month that no session can beat.

**Fixed** with `OVER_STREAK = 3`: a run of three sessions that each `hitTarget` *and* clear it on
every working set opens the same gate the single-session trigger does. Three is the smallest run
that cannot be one good day. The jump stays `0.025 × over` under the existing 8%/12% caps —
persistence earns the escalation, it does not inflate it — so this can only convert a plate-step
into a proportional step, never overshoot what the reps imply. `hitTarget` is required per session
so a partial or short session cannot extend a run.

**Persistence does NOT bypass the confirm brake, and the first cut of this change did.** The
single-session path deliberately runs ahead of that brake, but its rationale is explicitly *"a
load you beat by 4+ reps on every set"* — plainly too light, so confirming it wastes a session.
At **+1 rep** that argument does not hold, and `CONFIRM_LIFTS` are the heavy spinal movements the
brake exists to protect. A **forward replay** — feeding the engine its own suggestion and logging
one rep over target each time — caught it:

```
without the gate   ↑57.5 ↑59 ↑60.5 ↑62 ↑63.5 ↑65 ↑66.5 ↑68     (56 → 68kg in 8 sessions)
with the gate      cf57.5 ↑57.5 cf59 ↑59 cf60.5 ↑60.5 …        (+1.5kg per 2 sessions)
```

Snapshot testing could not have found this: on the export as it stands both variants look
reasonable. Persistence is now gated on `!isConfirmLift || hitsAtW >= 2`, so a confirm lift still
earns its second session at the weight and persistence only decides how far the step goes — for
`hex_dl` that is +1.5kg per two sessions against the +0.5kg it was getting, 3× faster with the
brake intact.

**Verified against the real export, both venues, every lift with history — exactly one suggestion
changes today:**

```
floor_press   up ↑ 38.5kg   →   up ↑ 40kg
```

`hex_dl` correctly still reads `Confirm 56kg` and takes +1.5kg on the following session instead of
+0.5kg. Everything else is byte-identical: `lm_squat` and `db_curl` already cleared `overTrig` at
+4, `db_rdl` is at the 18.5kg ceiling so `nxt > lastLoad` fails, and `dips` is on the band path.
Eight new assertions including the confirm-brake invariant, mutation-checked (`OVER_STREAK` raised
to 99 → the escalation test fails and only that one).

### 24.2 · `duration` is start-to-save wall clock and decomposes into nothing

§20.2 modelled session length as bouts × 3.03 min, a constant fitted to **one** session (11 Jul,
32 bouts → 97 min). Refitted across all 18 timed sessions since 1 Jul, it does not hold:

```
duration ≈ 98 + 0.96 × bouts        R² = 0.06
```

Bout count explains essentially none of it. Against prescribed work+rest computed from each
lift's `tempo` and `rstS`: **mean prescribed 70 min, mean actual 128 min, 58 min unaccounted**
(median 61, sd 18, range 22-93). And `corr(prescribed, unaccounted) = −0.60` — *negative*. The
fullest session on record (29 Jul, 98 min prescribed, 40 bouts) finished in 120 min; a 66-min
prescription on 4 Aug took 159. No session in six weeks came in under 112 minutes at any
prescribed load between 51 and 98 min.

**"Unaccounted" is not the same as "wasted", and the obvious confound was tested rather than
assumed.** The prescribed figure counts logged working sets only. The program's warm-up is a
3-item activation block (joint circles, isometric hold, single-leg balance) worth ~5 min, and it
prescribes **no ramp sets** — nobody works up to a 56kg hex pull cold, so some genuine unlogged
work is in that 58 minutes. If ramps were the explanation, unaccounted time would rise with the
number of heavy barbell lifts in a session. It does not:

```
corr(heavy barbell lifts, unaccounted) = −0.16     (expect strongly POSITIVE if ramps explain it)
corr(prescribed minutes,  unaccounted) = −0.60
corr(exercise count,      unaccounted) = −0.33
```

Heavy-lift counts range 0-5 across the window, so there is variation to detect. Every correlation
is negative: everything that should make a session longer is associated with *less* unaccounted
time. A fixed floor of legitimate unlogged work certainly exists; what it cannot explain is the
22-93 min *spread*.

The practical consequence is that **trimming exercises cannot buy time back** — on this evidence
it would only raise the unaccounted share — so the day sizes are deliberately left alone here and
the stale model is annotated rather than refitted.

What blocked going further is that the app measures nothing that could locate the 58 minutes:
`duration` is `(Date.now() − SS)/6e4`, one number per session. **Fixed** by stamping
`LOG[id].setTs[i]` when a set is ticked off (cleared on un-tick) and saving it on the finished
session as `ex[].ts` — seconds from session start, offsets rather than epoch ms, key omitted
entirely when nothing is stamped so legacy and retro rows keep their shape. `validSession` gets
the same treatment `wts` has, so `row.ts` existing always implies real timing data. Once a
session carries a set clock, actual rest is measurable against `rstS` and the gap can be
attributed instead of guessed.

### 24.3 · A lift climbing toward its rep floor was being cut one session short

Follow-up, from checking two recommendations this document had made rather than asserting them.
`getDeload` on the live export returns `due:false, consider:true, stalledMajor:0, avgDiff:2.6` —
the gate §11 built specifically to refuse timer-only deloads. A "deload now" recommendation on
that data was wrong, and the app was right. (`getFatigue` separately reads **10/10 Fatigued** off
volume and frequency; the two measure different things and the disagreement is not a defect.)

The second check found a real one. `stalls` counts consecutive below-minimum sessions at a load
with **no regard for trajectory**, so `db_rear_fly` reading 10 → 10 → 14 against a 3×15 floor
scored identically to 10 → 10 → 10 and was about to take the same ~10% cut — one session before
it would have landed in range. **Fixed** with a `climb` guard ahead of the `stalls>=3` cut: hold
the load when the run's reps are still rising and the latest is within 2 of the minimum.

Two details are load-bearing. It compares the **last two sessions of the run, not first-to-last**
— first-to-last does not terminate, since 10, 14, 14, 14… keeps reading "10 → 14" and would hold
the load forever; last-two buys exactly one session at a time and stops when progress does. And
the within-2-of-floor bound keeps a lift climbing from far below (6 → 10 against a 15-rep floor)
on the cut path, because that one is on the wrong load rather than one session short. Four
assertions including the termination case; mutating `to>from` to `to>=from` fails 9 tests.

### 24.4 · Two coach notes had expired and were fighting the cards beside them

`db_curl` and `db_rear_fly` both carried "type this load in once by hand" instructions, written
when the pre-v21 partner cadence meant the engine could never re-anchor unaided. v21 collapsed
the split, the exposures arrived, and the engine overtook both: `db_curl` now proposes **↑15kg/DB
on its own** (3×12+4 clears `overTrig`, ≈10% jump) — the exact number the note asks you to type —
and `db_rear_fly` is rebuilding reps at 5kg under §24.3's guard, not sitting at the 3kg the note
prescribes. Static prose against a live engine expires, and expired prose does not fail loudly;
it just contradicts the suggestion on the same card. Both are rewritten to say the instruction is
spent and why.

The test pinning the literal string `"Type 3kg/DB"` was replaced rather than deleted: pinning a
phrase forces a stale instruction to live forever, so it now asserts the durable property (the
note may *explain* that 3.5kg/DB is unbuildable but must never *prescribe* it) plus a new pair
requiring both expired instructions to stay retired.

### 24.5 · Recorded, not fixed

- **The form gate fails open.** `sessClean` returns `true` when `form` is absent, which is the
  right default, but form ratings have collapsed: **zero in the last 8 sessions**, 12 of 187
  exercises since 20 Jun (6%). The gate that correctly held `hex_dl` on 5 Jul is now inert. Making
  unrated count as unclean would freeze the whole program, so the semantics are deliberately
  unchanged — this is a friction problem in the logging UI, not a calculation bug.
- **`trainingWeek` is a dead field.** Present in the store, zero references in `index.html`.
- **Two band strings in the store are not on the `BANDS` ladder** — `'Blue'` (26 Feb, `pullup_a`)
  and `'Green (heaviest)'` (19 Mar, `pullup_c`), so `BAND_IDX` returns −1 for both. Both come from
  the bundled `SEED` literal rather than from logging, and both sit far outside the 5-session
  engine window, so nothing is currently mis-computed. Worth a `validSession` normalisation if
  band handling is touched again.
- **The app collects four signals it is barely being fed**, which is what limits what any future
  pass can conclude: `bodyLog` has **1 entry** (88kg, 19 Jun) so every bodyweight-relative
  feature — the strength-standards tiers especially — has nothing to stand on; form ratings are
  **12 of 429** exercises (3%); session RPE is on 43 of 66; `cues` is empty.
- **`durationSuspicious` missed a 352-minute session** (24 Jul, a stuck timer). The flag exists
  and did not fire.
- **Three `render.smoke.js` assertions fail on `HEAD`** (Muscle Trend card, strength ladder
  ticks, e1RM tier rows) and did so before this pass — §23.4 claims 367 passing where the file
  now reports 364 + 3 failed. Untouched here, but the suite is not green.
- **`programVersion` not bumped.** No stored-shape, day-membership, set-count or rep-range change:
  `ex[].ts` is additive and optional, exactly the shape §21.1/§22 left the migration chain alone for.

**Net effect on the live export — two suggestions differ from the pre-pass engine:**

```
floor_press   up ↑ 38.5kg      →   up ↑ 40kg          (§24.1 persistent overshoot)
db_rear_fly   dn ↓ 4.5kg/DB    →   stay → 5kg/DB      (§24.3 climbing guard)
```

Suite: **526 + 277 + 364 (+3 pre-existing failures) + 49, 18/18 SW mutations caught.** SW cache `rft-v92`.

---

## 25 · Express day — an on-demand short version of a home session (13 Aug 2026)

Requested plainly: *"a way to on demand initiate an express day for when I'm tired / had a long
day / don't have time, just for home workouts, where the focus is still hitting all the target
muscles at the right volume weight etc but overall shorter."*

### 25.1 · What to cut was answered by the export, not by preference

§24.2's timing pass had already located where a home day's prescribed minutes actually sit, and
it is not in the compounds. On Day C, `lm_pallof` + `hex_carry` + `band_er` + `lm_lateral_squat`
cost **43 of 80 prescribed minutes — 54% of the day** in core, cuff and unilateral finishers,
while `hex_rdl` and `hex_floor_press` cost 6 minutes each. Per-side and high-rep accessory work
dominates the clock; the loaded compounds are cheap.

So express keeps every loaded compound at **full sets and full load** — strength progression is
untouched and the confirm lifts keep their brake — and drops the isolation/core/cuff tail. A lift
survives when it carries a PRIMARY muscle at full weight in `MG`: chest, back, quads, hams or
glutes at 1.0, or `fdelt` 1.0 for the overhead presses.

| day | full | express | cut |
|---|---|---|---|
| A | 9 ex · 76 min | **5 ex · 43 min** | lm_lateral, bb_rear_row, bb_curl, dead_bugs_a |
| B | 9 ex · 69 min | **4 ex · 29 min** | bb_skullcr, bb_rollout, lm_lateral, rear_delt, bird_dog |
| C | 10 ex · 80 min | **6 ex · 37 min** | lm_lateral_squat, lm_pallof, hex_carry, band_er |

**A pure muscle-coverage set-cover was tried first and rejected.** Run greedily over the day's
muscles it produces a 6-exercise Day A — but it keeps `bb_curl` and **drops
`lm_bstance_squat`**, because `hex_dl` nominally "covers" quads at weight 0.5 so the algorithm
believes quads are handled. Coverage-at-any-weight is the wrong objective for a program whose
point is loaded progression, and it is worth recording that the obvious algorithm loses the main
squat pattern.

### 25.2 · The trade is honest, and the guard is the conjunction

Express spends accessory VOLUME to buy time. Coverage and load survive; volume does not. That is
safe *occasionally* precisely because MEV is a **weekly** landmark and `getWeeklyVolume` counts
across sessions and venues — a single express day is absorbed by the rest of the week.

`expressMEVRisk` therefore does not warn on express usage, and does not warn on under-MEV. Either
alone is a false positive: a missed week, a holiday or a deload all put a muscle under MEV
without express being involved, and heavy express use with the volume still landing is the
feature working as intended. **Only the conjunction** — 2+ express sessions in the rolling 7 days
AND a muscle actually short — produces a banner, and it names the muscles with their numbers,
because which tail got cut too often is the part that tells you what to put back.

### 25.3 · Wiring

`EXPRESS` is module state, not a field on `D`: it describes the session being run, not the store.
It is persisted in the active-workout blob (`xp`) so a reload mid-session resumes express rather
than silently restoring the full day, and stamped on the finished session as `express:true` so
history and the guard can see it. `dayExs(day,sw,xp)` filters on the **resolved** movement, so a
swapped-in isolation lift is dropped exactly as its slot's original would have been — otherwise a
swap could smuggle the tail back into a session that asked not to have one. `expressDiff` reads
that same path, so the button's preview can never disagree with what actually starts.

Express is **home-only**, by request and on the merits: the partner venue is already one
collapsed full-body session on 0:45/0:30 rests since v21, most of its lifts are at the rack
ceiling, and cutting it further would leave a session training almost nothing.

### 25.4 · Recorded

- **A shorter prescription will not produce a proportionally shorter session.** §24.2 measured 58
  min/session unaccounted with `corr(prescribed, unaccounted) = −0.60` — every measure of session
  size is *negatively* correlated with time lost. Express cuts real prescribed minutes and is
  worth having, but the two-hour floor is a separate problem and the `ex[].ts` set clock is what
  will resolve it. Do not read the table above as predicted wall-clock.
- **`programVersion` not bumped.** No day membership, set count or rep range changes — express is
  a runtime filter over the existing program, and `express:true` is additive and optional.
- **`xp` on an exercise def** overrides the rule outright (`true` = always keep, `false` = always
  drop) for cases the muscle map cannot express. Unused today; the hook exists so tuning does not
  require touching `isExpressKeep`.

Suite: **542 + 277 + 364 (+3 pre-existing failures) + 49, 18/18 SW mutations caught.** SW cache `rft-v93`.

## 26 · Return from break — the layoff the app could not see (26 Aug 2026)

A week of illness, and the tracker had no concept of what had happened. It is not that the
break went unnoticed cosmetically — it is that every mechanism the app has for "train lighter
for a bit" is wired to the wrong trigger.

### 26.1 · The deload machinery is the wrong tool, for a precise reason

`getDeload` is signal-driven: a timer met, plus either self-rated RPE ≥ 4 or two compound lifts
genuinely stalling. Every one of those inputs measures **accumulated fatigue**. A layoff is the
opposite state — after a week off you are not fatigued, you are de-adapted — so the deload
banner cannot fire for a break, and if it did it would be firing for the wrong reason.

Worse, the break actively *breaks* the fatigue machinery in three separate places:

| Mechanism | What a week off did to it |
|---|---|
| `getSmartSugg` stall ladder | Three light comeback sessions are three below-range sessions, which is the app's literal definition of a stall → a phantom ~10% cut handed to someone just out of bed |
| `getPhaseInfo.stalledMajor` | Those same sessions raise the compound-stall count that feeds the deload gate |
| `getDeload` week timer | Calendar weeks kept ticking through the break, so the banner fired the moment training resumed — recommending a light week to someone who had just had two |

So the ramp is its own object (`D.comeback`) with its own record (`D.comebackLog`), rather than a
second use of `lastDeload`. Reusing that field would have been three lines and a lie: it is the
record of a deload actually taken, it is what `mergeImport` adopts onto a fresh device, and
faking it would make History and Progress claim a deload that never happened.

### 26.2 · The numbers, and how confident they are

- **Threshold: 7 days.** At any sane training frequency a full week off is 2+ missed sessions,
  which is where graduated-return advice starts to apply. Deliberately *not* derived from the
  lifter's own cadence — `avgGap` is dragged upward by the very breaks it would be detecting.
- **Runway: `clamp(gap, 7, 21)` days.** "One day back per day out", the return-to-play rule of
  thumb; cross-checked against "2–3 days of graduated return per missed training unit" (ACC 2022
  expert consensus decision pathway, Gluckman et al., *JACC* 79:17), which for ~3 missed sessions
  lands in the same 6–9 day band. Floor 7: a shorter runway cannot hold two sessions, so there is
  no stage 1. Ceiling 21: past three weeks this is a new block, and the phase clock is the tool.
- **Stage 1 = first 2 SESSIONS,** not the first N days. Two calendar days into a ramp you may
  have trained twice or not at all; the prescription is written in sessions because the thing
  that re-adapts is the tissue that actually trained.
- **Volume before intensity,** and stage 2 rebuilds to the *pre-break* load rather than
  re-earning it: a short layoff does not cost the machinery (myonuclei persist through months of
  detraining — Cumming et al. 2024, *J Physiol* 602:4171) and the first-session deficit is
  largely neural. Re-testing from scratch throws away work that is still there.

This is consensus practice, not RCT-grade dosing, and the code says so. The ramp is **advisory
everywhere**: it never blocks a session, rewrites a prescription, or edits a weight suggestion.

### 26.3 · The one mechanical effect, and why it stops where it does

Stage-1 sessions leave progression memory (`rampMutedDates` → `getSmartSugg`), exactly as deload
weeks already do. That is what kills the phantom deload.

**Stage 2 is deliberately NOT muted.** The first cut of this muted the whole window, which is
correct for a 9-day ramp with three sessions and wrong for a 21-day one with nine: it would
blind the engine to three weeks of real training and leave every suggestion anchored on a
pre-break load that is no longer true. Stage 2's own prescription is "back to pre-break loads,
full volume" — that is honest data and has to reach the engine. Muting stage 1 stops the false
stall; muting more would trade one wrong answer for another. Both halves are tested, including
the negative: the same sessions with no ramp on record still deload.

The deload clock also re-anchors on the most recent *completed* ramp's end date. A layoff
discharges accumulated fatigue as surely as a deload week does. An **active** ramp deliberately
does not re-anchor — it has discharged nothing yet, it is still being served — and instead
suppresses the recommendation outright (`suppressed:'comeback'`), because a deload banner on top
of a running ramp is two contradictory prescriptions on one screen.

### 26.4 · Tracking, and what lands in the record

The lifter asked to track it day by day with an end date, and for it to become history when
done — so the ramp is a first-class object end to end:

- **Home** shows either the offer (`getBreak`) or the live card: *day N of M*, a progress bar,
  the stage prescription, sessions logged, days left, and the date normal progression resumes.
- **The start date is a parameter**, not the moment of the tap. "I'll start tomorrow" is the
  normal case, and a day counter that began when you *read* the banner would be off by one for
  the whole ramp. A tomorrow start also lengthens the gap it is sized from, so the runway grows.
- **Completion is calendar-driven.** `comebackTick()` runs at the top of `render()` — every
  screen goes through it, and it is the one place a read is allowed to become a write.
- **History** carries the ramp record (dates, planned length, days off, sessions, whether it
  ended early) and badges every session trained under one. The weekly tonnage chart gets an
  `RTN` marker at the ramp's start week — without it a comeback reads on the chart as a collapse.
- **Ending early archives; a mis-tap deletes.** A ramp that never started, or started today with
  nothing logged under it, is not an event and does not get a zero-session row in a permanent
  record. Anything else is truncated to today and archived, because "9 days planned, ended on
  day 4" is a different fact from "9 planned, 9 served".

### 26.5 · Recorded

- **`programVersion` not bumped.** No day membership, set count or rep range changes. `comeback`
  and `comebackLog` are additive optional fields that `load()` defaults and validates, so there
  is nothing for a migration to do — same call as §25.4.
- **Both new fields are validated on the load path**, not just trusted. They are not cosmetic:
  the ramp window subtracts dates from progression memory, so a hand-edited or half-written
  store would silently blank real sessions from every weight suggestion rather than merely
  rendering wrong. An over-long window is clamped to `RTN_MAX_DAYS` for the same reason.
- **`comebackLog` is append-only and unions across tabs and imports**; the *live* ramp is current
  state and keeps the local tab's value, and is adopted from a backup only onto a fresh device —
  exactly the rule `lastDeload` already follows, and for exactly the same reason.
- **The demo is excluded.** `getBreak` returns null on a `seeded` store: offering a 21-day ramp
  back from a break that never happened would be the first thing a new install ever showed.
- **Ramp membership is derived from the date window, not stamped on sessions.** The window is
  fixed once the ramp opens, and deriving leaves the session shape, `validSession`, imports and
  the two-tab merge completely untouched by this feature.

### 26.6 · What the headless tests could not see

Everything above was verified headless — Node harnesses against a DOM stub. Driving the real
app in Chromium found one thing the stub could not: **the prescription was invisible on the
workout screen for most lifts.**

The per-lift advisory rides on `sg.regress`, which `getSmartSugg` emits from the middle of its
ladder. Every branch that returns before that point — a first-time lift, a band with no
history, a weight-only row — hardcodes `regress:''`. On a real store one session back, 8 of 9
lifts on Day B took an early return, so the ramp showed on exactly one card. The calc test
asserted on `sg.regress` (the data) and passed; the render smoke test never opened the workout
screen. Both were green, and the feature was not doing its job.

The fix is not to patch six early returns. A ramp is a **session-level** fact — "day 3, run it
at ~90% and stop short" applies to the whole workout, not to one lift — so it is stated once as
a strip at the top of `rWork`, above the first exercise. The per-lift cue stays for the lifts
that do reach it. (The deload advisory has the identical hole and is left alone: its banner
already lives on Home, and widening that is not this change's job.)

Twelve browser checks now cover the offer, a scheduled start, a live ramp, the workout strip,
the History record and badge, the chart marker, dark theme, and a reload round-trip — including
the negative that made the bug visible: the first lift on screen *does* take the `type:'new'`
path, and the strip shows anyway.

### 26.7 · Three edge cases closed, and a browser suite so the next one is caught

A deliberate adversarial pass over the diff, after the §26.6 miss, found three more:

- **The runway burned calendar while you were not training.** Tap Start, never train, and the
  ramp counted down to an end date having served nothing — writing a zero-session row into a
  permanent record, and suppressing the break offer the whole time because a ramp was
  technically open. Now the window rolls forward with today, and *re-sizes*, until one session
  lands inside it; then the dates freeze. That is what makes the end date the promise it is
  meant to be, and it removes the empty-record case entirely. Deleting the only session in a
  ramp puts it back to waiting, which is deliberate: with nothing logged inside it, it has not
  begun.
- **A far-future `comeback.start` parked the app in "scheduled" forever.** `beginComeback`
  refuses a start more than a week out, but `validComeback` did not, so a hand-edited or
  corrupted store could carry one — never rolling (the roll only fires once today passes the
  start), never completing, suppressing the offer indefinitely. Rejected outright: there is no
  defensible date to repair it to.
- **The Express/MEV guard nagged you for following the ramp.** Stage 1 *is* "drop the accessory
  tail", so both halves of that guard's conjunction hold by construction — the app warning a
  lifter for doing exactly what it just told them to do. Suppressed for the whole ramp rather
  than only stage 1, because the guard reads a rolling 7-day window that keeps containing the
  stage-1 sessions for days afterward; missing a genuinely-earned nag inside a ≤21-day window is
  the cheaper error, and Balance still shows the real volume throughout.

**`tests/browser.test.js`** now loads the app in Chromium over real HTTP, seeds `localStorage`
the way the app stores it, and asserts on what a person would see — including the negative that
made §26.6 visible (the first lift on screen *does* take `getSmartSugg`'s early `type:'new'`
return, and the strip shows anyway). It self-skips with a loud message if playwright or a
Chromium build is absent, so it is an addition to the battery rather than a second gate on the
suites that already pass. CI installs Chromium and runs it.

Suite: **625 + 277 + 386 (+3 pre-existing failures) + 49 + 18 browser, 18/18 SW mutations
caught.** SW cache `rft-v96`.

## 27 · The three "pre-existing failures" were a test rotting on the calendar (26 Aug 2026)

Three render-smoke assertions had been failing long enough to be recorded as background noise
in §25.4 and §26.7. They were not render bugs, and nothing in the app was wrong.

Two Progress cards read **rolling windows off today's date**, not off the fixture:

| Card | Window it reads |
|---|---|
| Muscle Trend | `musclePeriodCompare(28)` — last 28 days vs the 28 before, so it needs data inside 56 days |
| Strength Level | `relStrength()` — each lift's best e1RM inside 60 days |

The smoke fixture's newest session is a hardcoded `2026-06-12`. As real time moved past it, both
windows emptied, `musclePeriodCompare` returned `[]`, `relStrength` returned null, neither card
rendered, and the three assertions that read them went red. A test dying of old age.

The fix is four sessions dated **relative to today** — two inside the 28-day window and two in
the 28 before, so Muscle Trend has both a current and a previous period — carrying exactly the
four lifts `relStrength` tracks. They are scoped to the two cards that need them and removed
immediately afterwards, because later suites assert on phase markers, PR counts and the SEED
band ladder, all of which extra sessions would perturb.

**Nothing was weakened to get there**: the diff is 32 insertions and zero deletions, and all
three original assertions are untouched. A fourth assertion was added that checks the
*precondition* — that the fixture actually lands inside both windows — so if this ever rots
again it fails as rot rather than quietly taking the three real assertions down with it.

Do not re-hardcode dates in that fixture. Any fixed date there begins dying the moment it falls
out of the window the card reads.

Suite: **625 + 277 + 390 + 49 + 18 browser, 18/18 SW mutations caught. Zero failures.**

## 28 · The set clock, read back (26 Aug 2026)

§24 built `ex[].ts` — a per-set timestamp, stamped by `toggleSetDone`, offsets from session
start. §24.2 said outright that the 58 unaccounted min/session could not be attributed without
it. It has been writing correctly ever since, and **no screen has ever read it.** The one
instrument that could explain six months of two-hour sessions was filling a field nobody opened.

Replaying the lifter's 26 Feb – 14 Aug export answered it on the first look. One session
carries a clock:

| Day C, 14 Aug | |
|---|---|
| Logged duration | 132 min |
| Ticked sets | 30 (29 gaps) |
| Median gap | **3:59** against a **1:00** prescription |
| Gaps within 1.5× prescribed | **0 of 29** |
| Time spent between sets | **127 of 132 min** |
| Longest | 10:41, between two sets of pull-ups |

First tick at 4.5 min, last at 131.5 — no dead time at either end. The 52-minute overrun against
the §24.2 model (43 work + 37 rest = 80 min for Day C) is not one long break; it is ~3 extra
minutes on every set, thirty times.

**This is why cutting exercises was the wrong lever** (§27 discussion, program left untouched):
removing two exercises at this pace saves ~24 min and lands at 108. Taking the prescribed rest
saves ~50.

### 28.1 · Three readers, no writers

`gapsFrom` / `sessionGaps` / `liveGaps` / `restStats` / `restHistory`. The split exists because a
saved session stores seconds-from-start while the live `LOG` stores epoch ms; each caller
normalises and shares one roll-up. Each gap is charged to the **later** set — that is the set
whose prescribed rest was being waited out. `ts[i] === 0` means *never ticked* and is skipped,
which is also why every test fixture starts its stamps at 30 rather than 0.

Three surfaces, all additive:

- **Session summary** — median gap, gaps over 1.5×, minutes between sets, worst offender. Shown
  while the session is still in mind rather than in a chart weeks later.
- **Workout live strip** — a fourth cell, `Rest med`, updating on the existing 1s tick, amber past
  1.5×. Median-so-far rather than the current gap: the pill already counts the current one, and
  one long rest is not the problem — a median that sits at 4:00 for thirty sets is.
- **Progress → Consistency** — 90-day roll-up, prescribed vs actual as a bar, and it **names its
  own denominator** ("1 timed session") plus a warning under three, because the clock is new and
  most history has none.

### 28.2 · Descriptive, never prescriptive

Nothing here changes a load, a rest, or a suggestion, and a test asserts exactly that: stamping
a session's clock leaves `getSmartSugg` byte-identical. The copy says so too — **long rests do
not cost strength or size**; more recovery means more work at load. They cost session time. The
app's job is to show the number, not to nag, and the lifter should not come away thinking six
months of training were done wrong.

### 28.3 · The app never asked for a bodyweight

Six months, 69 sessions, **one** bodyLog entry (88 kg, 19 June). The backup nag has fired every
three sessions since v9; nothing ever asked for a weight — which is how "am I gaining muscle or
fat" became unanswerable by the app that tracked all of it. A weekly-cadence banner now asks,
dismissable per week (bodyweight is a weekly measurement; a daily prompt trains the dismiss
reflex). Verified against the real export: *"Bodyweight last logged 68 days ago."*

### 28.4 · Recorded

- **Verified against the real export in a browser**, not only against fixtures: the shipped card
  reproduces the analysis independently — 29 gaps, 3:59 median, 29 over, 127 min vs 29
  prescribed, 4.4×, worst 10:41 on pull-ups.
- **`programVersion` not bumped.** No day membership, set count or rep range changed. The program
  is deliberately untouched pending the return ramp.
- **The browser suite now exceeds a 120s foreground run.** It spawns a context per scenario; run
  it backgrounded locally. CI is unaffected.

Suite: **648 + 277 + 399 + 49 + 26 browser, 18/18 SW mutations caught.** SW cache `rft-v97`.
