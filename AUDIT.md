# Audit status

This repository was reviewed top to bottom on 2 September 2026. Earlier working notes were
removed from the distributed tree because they reproduced private training history and were
not appropriate application source.

## Integrated findings

- Fresh installs start empty; deterministic historical data lives under `tests/fixtures/` only.
- Progression increases are held after a 5/5 session, a sharp same-load rep drop, repeated
  related-joint discomfort, or recent partner split-squat/lunge work before a home lower-body
  increase. A zero-warm-up entry remains an adherence warning, not a progression veto.
- Shoulder, elbow, wrist, lower-back, hip, knee, and ankle flags are available. Related-lift
  flags aggregate by upper/lower movement family.
- Home strength pillars rest 2:00, other demanding compounds 1:30, and accessories 1:00.
- Set-clock analytics report completion-to-completion intervals. They do not label or grade
  those intervals as measured rest because setup and the following set's work are included.
- History flags same-date sessions with matching exercises, loads and reps for manual review;
  it never deletes a possible duplicate automatically.
- The focused Essentials session keeps the main lifts plus targeted stability work; the full
  accessory-inclusive session remains available.
- Essentials shows an 80-minute pacing budget without shortening prescribed rests, removing
  work at the deadline, or changing progression. A measured A/B/C Essentials cycle is still
  required before making any further time-driven program change.
- Pull-ups use a comfortable shoulder-width grip instead of a forced wide grip. Dip depth is
  controlled and pain-free, and the direct-triceps finisher is explicitly optional.
- RIR is labelled as a prescribed target, not an app measurement. The custom 1–5 post-session
  self-report is labelled session effort rather than inaccurately calling it RPE.
- Loaded dead bugs and anti-rotation presses use quality-first progression: one smallest-step
  increase, no cluster prescriptions, and no influence on strength-phase reassessment.
- Whole-program phase changes require at least two genuinely stalled compound lifts. Isolated
  accessory stalls remain visible but cannot redirect the program while key lifts are moving.
- Phase 2 is accurately described as a higher-rep emphasis with performance-based load
  re-anchoring; it does not claim to add sets or promise a fixed percentage reduction.
- Heuristic set, strength, workload, and external-load displays are labelled as estimates or
  app references rather than measurements or universal standards.
- Service-worker activation deletes only `rft-*` caches, and CI blocks application changes
  that omit a service-worker cache-version bump.

## Remaining architecture debt

The app is intentionally deployable without a build step, but `index.html` still combines
styles, state, calculations, rendering, and interaction code. Splitting those concerns into
small browser-native modules is the highest-value maintainability follow-up. That refactor
should preserve the current storage schema and land separately from training-logic changes.

The public Git history may still contain material removed from the current tree. Rewriting
published history and coordinating downstream clones is a separate destructive operation and
is not performed by normal feature work.
