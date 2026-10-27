# Rack-Free Tracker

A local-first, installable workout tracker tailored to home barbell, hex-bar, landmine, band,
bodyweight, dumbbell, and clubbell training. It runs as a static progressive web app with no
server-side account or build step.

Live app: <https://lizardman472.github.io/tracker/>

## Data model and privacy

Workout, body, cardio, cue, and discomfort data are stored in the browser's `localStorage`.
A fresh install contains no sample workouts or implied history. Use **Settings → Export**
regularly: clearing browser/site data can remove the only local copy.

Imports validate sessions and auxiliary logs before merging them. Corrupt local data is parked
as a downloadable raw recovery copy when possible. The repository's historical regression
state is test-only under `tests/fixtures/` and is never loaded by the app.

Only one tab can edit this device's data at a time. Other tabs can browse and export; choose
**Use this tab** to transfer editing once the current tab has finished its workout or data
entry. Closing the editing tab also releases its browser lock. The next editing tab reloads
saved data before making changes, so an old view cannot restore deleted entries or undo a reset.
This uses the browser's Web Locks API on HTTPS or localhost. Browsers without that capability
remain available for viewing and export.

A failed save leaves the previous committed data intact and displays recovery actions.
Keep the tab open to retry or download the pending change. Workout recovery retains the same
session identity through interruption and retry. Browser storage remains device-local: this
coordination does not synchronize different devices. After updating from an older release,
close and reopen existing app tabs so every tab uses the same storage rules.

If an imported unfinished workout cannot be stored, its recovery warning stays visible and
replacement actions are blocked. Keep that tab open and choose **Retry save**, **Download
imported workout**, or **Discard imported workout**. Downloading keeps the pending copy
available; explicitly discarding it preserves any earlier stored resume workout and saved
history. Discarding from the Resume card also requires confirmation. Canceling keeps its
sets, ratings, notes and identity.

Activation, exercise navigation, swaps, History details and Import use keyboard-operable
buttons. Opening an exercise moves focus into its card; warm-up and History buttons retain
focus after changing their state.

## Run locally

Serve the repository root over HTTP; service workers do not run correctly from `file://`.

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

There is no compilation or dependency installation for the application itself.

## Tests

The deterministic Node suites have no package dependencies:

```sh
node tests/calc.test.js
node tests/hex.test.js
node tests/storage.test.js
node tests/recovery.test.js
node tests/analytics.test.js
node tests/render.smoke.js
node tests/sw.test.js
node tests/sw.mutate.js
```

`tests/browser.test.js` uses Playwright when Chromium is available. GitHub Actions runs every
suite and installs the browser in CI.

## Repository map

- `index.html` — application styles, program definitions, state, calculations, and UI.
- `sw.js` — offline shell/runtime caching and notification routing.
- `manifest.webmanifest` — install metadata.
- `tests/` — calculation, program, render, browser, service-worker, and mutation coverage.
- `.github/workflows/test.yml` — CI and the mandatory cache-version guard.

## Release invariant

Any change to `index.html` must bump `const C` in `sw.js`. CI fails otherwise, because an
installed PWA could continue serving the previous application shell.

## Interpretation limits

### Deload and shorter A/B/C

Expand **Recovery plan and routine choices** on Today, or use Settings, then choose
**Start deload today** or **Start deload tomorrow**.
This is an opt-in home routine; the original programme and Partner routine remain available.
The app captures starting loads from your own history, never from sample workouts.

- **Deload:** seven calendar days, at most three sessions on nonconsecutive days, six
  working sets per session, approximately 82% of the earlier load and 4–5 clean reps left.
  Missing a session does not require making it up. Rest instead if an easy session feels draining.
- **Check-in:** the app does not advance automatically. At the displayed review date,
  choose **I feel ready** only when easy sessions feel manageable and recovery between
  sessions feels normal, or choose **Still tired** for two more rest days.
- **Easy return:** another seven calendar days, five exercises with two sets each,
  approximately 90% of the earlier load and about three clean reps left. Loads stay held.
  At its review, explicitly choose **Linear** or **Hypertrophy** before confirming the
  shorter routine. Recovery is a stage, not an active Linear/Hypertrophy phase.
- **Shorter A/B/C (default after recovery):** five exercises and 11 working sets per home day,
  2–3 clean reps left, and
  rep-first progression. Two comparable sessions on different dates must reach every
  target with Solid/Strict ratings and at least two self-reported reps left before an increase.
  Missed sets, unknown ratings and deliberate light sessions do not earn increases.
  The save screen records why a workout ended; an unfinished session or a fatigue/discomfort
  ending does not count as a confirmation even when one lift reached its rep target.

The percentages, stage lengths and progression rules are practical app policies, not
validated individual readiness thresholds. Deload and return sessions stay in History
and analytics but are excluded from weight progression. The plan survives export/import
to a fresh device; importing into a device with existing training does not replace its plan.
Plan changes are blocked while an unfinished workout is waiting to resume.

**Original A/B/C Essentials** means the pre-deload home list: eight or nine exercises and
24–26 working sets per day. The routine is the exercise list and set prescription; the
phase (Linear, etc.) governs rep targets and is chosen explicitly before regular training.
Phase choice does not change exercise lists or set counts. Full
adds optional work beyond Essentials and is unavailable during gradual return.

**Return to original routine** is an optional choice after the easy return week or while
using the shorter routine. Choose its Linear/Hypertrophy phase first. Earlier loads are
re-anchored for the chosen targets using a conservative Epley estimate that never estimates
a heavier load for a lower-rep choice. It starts three held steps, each at least seven days:

1. Two sets per original Essentials exercise, capped at 90% of phase-adjusted reference loads and no higher
   than the latest logged load.
2. Original Essentials sets, capped at 95% of phase-adjusted reference loads.
3. Held practice toward earlier loads, capped at 100%.

Each later step adds at most 5% of the phase-adjusted reference to the latest logged load, rounded
down to available plates. Manual-control exercises remain manual. Bands start easier
and advance at most one rung per confirmed step toward the earlier band. Unknown loads
start light. Completing one manageable A/B/C on separate days in a step and confirming
readiness are required to advance; fatigue/discomfort endings and effort ratings of 4–5
do not qualify. Missing sessions extend this optional return, never trigger a jump.
The final confirmation resumes original progression from logged practice loads, even
when they remain below earlier loads. Early steps are excluded from progression; complete,
non-fatigue final practice records are retained as the new anchors. **Keep shorter routine
(default)** remains available throughout this optional return.

Today embeds compact routine controls in the workout-start panel with guidance and choices
collapsed. Workouts show
only the current prescription; Settings exposes the full controls. Saved history, current
next A/B/C day are preserved throughout routine changes. Confirming a new phase updates
the phase and starts its review clock; it never rewrites old workouts.

### Phase choice and transition context

The compact controls show **Current phase** and **Next** on Today and in workouts, while
the expandable guidance explains **When** and **Why this stage**. Progress and Settings
use the same phase context. Deload/easy return do not highlight a regular phase as active.
Existing shorter plans keep their mixed rep ranges until the user explicitly chooses a
phase; updating the app cannot silently change an unfinished prescription.

For regular shorter A/B/C, Linear applies Phase 1 lower-rep targets and Hypertrophy applies
Phase 2 higher-rep targets, keeping five exercises and 11 sets. The selected phase also
governs Partner rep targets. A phase change derives starting loads from recent performance
and requires fresh comparable sessions in that phase to earn increases. Phase choices
are held during recovery and all gradual-return steps, and changes are blocked during
unfinished workouts. Phase and adjusted-load fields survive export/import to a fresh device.

The shorter routine displays an optional phase review after four weeks of manageable
training; staying in the phase is allowed. The original routine retains its eight-week or
24-session review signal, with repeated compound stalls determining recommendations.
Future-dated sessions do not count toward that signal. Neither timer switches phase.
These dates and estimates are practical app policies, not validated readiness thresholds.

### Shorter-routine progression and deload prompts

Each lift's Today preview and workout suggestion shows its next action: **Add reps when
ready**, **Repeat target (1/2)**, **Increase weight**, or **Hold progression**. Keep the
same load and try one extra total rep within the range when control and 2–3 clean reps
remain. An increase still needs two comparable, complete sessions on different dates,
all targets met, Solid/Strict form and at least two recorded reps left. Missing ratings
and mixed per-set loads cannot masquerade as confirmations. Bands advance one set at a
time; bodyweight work keeps its control-first guidance. Equipment ceilings hold weight.

Regular shorter A/B/C now gets a compact deload check inside the existing routine panel.
It uses the last three distinct training dates within the past 14 calendar days. Two
Too tired endings, or at least two effort ratings averaging 4/5 or higher, prompt
**Consider a deload** without waiting for a phase timer. An alternative signal is three
comparable below-range workouts at the same load on each of two main lifts, within
28 days with the latest within 14 days. These comparisons require complete workouts,
the current phase and prescription, and uniform per-set loads. A single most-recent
fatigue/discomfort ending or high-effort session prompts a temporary hold and reassessment.

Recovery workouts, future dates, other venues, previous plan cycles, weight-only rows,
and deliberately ignored sessions cannot manufacture a new signal. Fatigue/discomfort
endings remain eligible for the recovery check even though they are correctly excluded
from weight progression. Phase changes do not erase recent fatigue reports. Old ratings
are not reused when recent data is missing. With missing ratings the UI asks for them;
it does not claim the lifter is recovered. Four weeks is an optional recovery check-in,
separate from the phase review, and never a forced deload or automatic phase switch.

A recovery warning holds suggested weight/band increases and offers **Start deload
today** outside an active workout. Confirmation starts the actual seven-day recovery
plan; it does not simply mark a deload as already taken. Active workouts show guidance
without plan-switch buttons. These thresholds are practical app policies, not validated
individual readiness tests; the user still confirms how they feel.

### Recovery mode and load controls

Today and the active workout show **Recovery: On / Off / Scheduled**, the current phase,
and **Load: Held / Progression on** inside the existing routine panel. Held percentages
refer to the plan's reference loads, not a measured 1RM; the exact buildable kilograms
remain on each exercise. Original-return steps also show held loads even though deload
is off. Partner keeps its own routine, explicitly labelled separately from the home plan.

Expand routine choices (or open Settings) to select **Recovery mode**: Off, Deload, or
Easy return, then **Apply recovery mode**. A confirmation is required. Recovery can be
started again from shorter training; its reference uses recent logged practice rather
than restoring old heavy loads. Switching between recovery stages keeps their reference
loads and starts a fresh seven-day review. Selecting the current mode does not restart it.

A new recovery cycle uses counted set bands from recent practice. When those bands are
mixed, its reference uses the easiest performed setup: more assistance for pull-ups/dips,
less resistance for resistance-band work. An unused exercise default cannot seed a harder
recovery setup. Unchecked sets do not supply that reference.

Turning recovery off requires choosing Linear or Hypertrophy and confirming readiness.
It starts shorter regular training with adjusted loads, including when ending recovery
before its review date. It does not restore the longer routine or old weights. The ready
check at the review date remains the usual path. These manual controls never erase
history, change the next A/B/C day, or replace an unfinished workout. Regular shorter
training retains its separate phase selector; the original routine remains optional.

For a deliberate return to the usual pre-deload routine after rest, Home recovery controls
also offer **Resume original A/B/C after rest**. Confirming restores original Essentials
(eight or nine exercises, 24–26 working sets) in the existing phase, including Strength.
It preserves the phase start, next A/B/C day, last-deload date and all saved history. It
does not require completing the easy return week or the separate gradual-return steps.
Full remains an optional workout choice. Readiness is the user's explicit choice; dates
and missed sessions never create completed workouts or earned load increases.

This direct choice saves a unique return marker with conservative load and band references.
Initial suggestions are held at the reference or lower actual same-phase Home practice,
rounded down to an available load. If the apparatus minimum exceeds that reference, the
exercise explains it. Only counted sets supply per-set weights and bands; resistance-band
starters use one visible easiest band without hidden mixed overrides. Reduce the setup
whenever needed. A new workout captures its marker at Start and carries it through the
unfinished draft, summary and save. An older or imported draft does not acquire that tag
just by being saved after the choice.

Only real, matching Home sessions after that choice supply original progression credit.
Earlier successes, future/foreign sessions, retroactive entries, ignored rows and recovery
sessions do not earn it. Once fresh practice exists, the original single-hit, confirm-lift
and overshoot rules apply; the shorter routine's two-session policy is separate. History,
analytics and safety evidence remain available. Fresh-device imports preserve the marker
and saved tags; additive imports preserve the current device's routine policy. A phase
change, new recovery plan or reset clears the marker. Cancel or a blocked/failed transition
keeps the committed plan; failed saves retain an atomic retryable proposal. Any saved
unfinished draft, including notes-only work, or unreadable draft storage blocks this choice.

Stop a set when control breaks down or discomfort rises. Save only work actually performed.
Persistent or worsening fatigue, especially outside workouts, warrants medical advice.
Session time targets are planning aids and never shorten necessary rests.


Landmine lateral raises record reps **per side**: entering 15 means 15 on each side.
Landmine anti-rotation records **combined reps**: entering 16 means 16 across both sides.
These conventions preserve the original rep entries; historical records are not rewritten.

Anti-rotation uses manual load selection because rep counts alone cannot establish trunk
control. Choose a lighter setup whenever control breaks down; automatic load jumps and
miss-count resets do not apply to this exercise. The landmine readout uses bar plus free-end
plate mass for logging, not measured resistance at the hands. A controlled press and return
is consistent with [ACE's anti-rotation guidance](https://www.acefitness.org/resources/everyone/exercise-library/332/standing-anti-rotation-press/);
manual progression is this app's policy, not a validated readiness test.

The tracker provides conservative training suggestions, not medical advice. Estimated 1RM,
muscle-set credit, workload, relative-strength bands, and body trends are directional tools.
They are not direct measurements of fatigue, muscle gain, body composition, or injury risk.
Discomfort and recovery gates intentionally hold increases rather than trying to diagnose a
problem.

Recent analytics use exact inclusive local calendar dates and exclude future-dated entries.
Strength momentum uses per-set estimated 1RM, requires at least three observations over
14 days, and shows only lifts last recorded within 21 days. Those are display policies, not
readiness thresholds. Cards expose the sample dates and observed change. Band rep trends
restart when the recorded band, set conditions, or phase changes. Muscle-set references do
not automatically prescribe extra work or generate an Essentials warning. They remain neutral
context in Progress because fixed set credits and population-level reference ranges cannot
establish an individual's minimum effective volume.
