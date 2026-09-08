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
not automatically prescribe extra work.
