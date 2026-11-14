# Local D1 browser-harness diagnosis

Observed on Windows, 2026-11-13 (America/Toronto), Bun 1.4.4, Node 24.11.0, Wrangler 4.158.0. Branch starts at cbf25c2. All HTTP ports used for this investigation were 8830–8839. No production or staging requests, real email, production writes, or changes to the deployed Worker.

## What is established

The old browser harness starts `wrangler dev` and repeatedly starts another workerd through `wrangler d1 execute --local`, both opening the same persisted D1 database. With overlapping HTTP writes, this arrangement produces `database is locked: SQLITE_BUSY` in both the Worker and fixture CLI. Switching fixture writes to the existing runtime's binding removes that second SQLite owner. This is a demonstrated harness defect and a clean workaround for local D1 contention.

The original supplied opaque references were not reproduced. These experiments do **not** prove what generated those particular reference IDs. In particular, an unrelated SQL constraint failure can also be hidden by workerd as an internal error ([upstream report](https://github.com/cloudflare/workers-sdk/issues/16314)). Do not infer a SQLite cause from a reference ID alone.

Separately, extending the persistence path produces `workerd/util/sqlite.c++:661: failed: unable to open database file: SQLITE_CANTOPEN`, even without a running Worker. This establishes a Windows path-sensitive failure independently of contention; it does not establish the cause of the originally reported initialization failure.

## Reproduction and hypotheses

`node e2e/reproduce-d1.mjs <cli|binding> <idle|traffic> <port> [state]` creates a minimal local Worker with one D1 table. Each HTTP request inserts one row. The CLI mode starts a second process for each fixture insert; binding mode sends each fixture insert through the serving runtime's own D1 binding. The initial CLI schema command finishes before the Worker starts. Errors are fatal; the probe contains no retries. Use a fresh state directory to compare runs.

| Hypothesis | Prediction and observed result |
| --- | --- |
| Two SQLite owners contend | Initial CLI loop: 30/30 writes pass with Worker idle. With sustained HTTP writes, CLI fails with `SQLITE_BUSY`, reproduced in multiple fresh runs. Tracked probe also reports Worker `D1_ERROR: database is locked: SQLITE_BUSY` and CLI `SQLITE_BUSY`. Same-runtime binding: 1,000 writes with concurrent HTTP writes pass, no failed HTTP requests (27.253 s in the captured run). |
| Windows persistence path | A path extended by 13 repetitions of `long-path-` fails on table initialization with `SQLITE_CANTOPEN`, before starting a Worker. The normal worktree path initializes and completes the idle loop. Shortening paths cannot explain the short-path contention failures. |
| Shared global state between independent folders | Two simultaneous CLI/idle probes in separate source folders, using the same Worker name and database ID, pass 30 writes each (98.439 s and 100.604 s). Ports 8836 and 8838 are distinct; inspectors are disabled. This does not rule out all global-state defects, but independent folders alone did not reproduce this one. |
| External defect | SQLite errors are captured below the generic CLI message. Cloudflare also tracks local D1 concurrency failures ([workers-sdk #14916](https://github.com/cloudflare/workers-sdk/issues/14916)); this investigation does not bisect versions or claim that issue is the exact same regression. |

Reproduce using the tracked probe:

```powershell
node e2e/reproduce-d1.mjs cli idle 8836
node e2e/reproduce-d1.mjs cli traffic 8836
node e2e/reproduce-d1.mjs binding traffic 8836
# Extended-path initialization fails before the probe starts its Worker:
node e2e/reproduce-d1.mjs cli idle 8836 ('.wrangler/diagnosis/'+('long-path-'*13)+'/state')
```

CLI stderr uses `WRANGLER_LOG=debug`. The underlying errors captured were `SQLITE_BUSY` and, separately, `SQLITE_CANTOPEN`.

## Harness change

Bun bundles application imports, including token JSON, then starts the runner under Node 24. Node is required for the fetch dispatcher used by Wrangler and Miniflare. `unstable_startWorker` uses the real `wrangler.toml` bindings, assets and compatibility settings, with the existing explicitly selected `e2e/worker.ts` outbound-network stub. Its own Miniflare runtime supplies DB; a missing runtime is an explicit error. This uses the exposed `raw` surface of an unstable API, so a Wrangler upgrade needs these regression checks.

Every run gets fresh ephemeral storage. The real additive migrations run in sorted order through the binding before browser traffic. Fixtures use Wrangler's SQL splitter and D1 batch, preserving multiline SQL and formatted SELECT output used by existing assertions. Explicit `e2e/empty.env` and fake binding overrides prevent loading developer `.dev.vars`. Nothing adds a route or flag to the production Worker. No package versions change.

`COMMAND_LIMIT_MS = 60_000` and `RUN_LIMIT_MS = 10 * 60_000` remain unchanged. Migration and fixture commands retain the minute limit. Startup, migrations, browser failures, interruption and normal completion all enter bounded cleanup. Every browser section and assertion is preserved; sign-in, editor handoff and email-change behavior is unchanged.

## Timings and validation

The historical source comparison ran f1f5504 and cbf25c2 back to back with identical dependency versions. The final implementation runs are consecutive full-suite passes after merging main at e73d196, including its added code-entry and storage-recovery checks. Builds run separately and are excluded from the suite budget. Measurements were under load and are not a hardware performance guarantee.

All section times below are seconds. Timed commands are included in their containing sections. The final passes are the consecutive runs of the final code, after the historical pair.

| Section | f1f5504 (historical) | cbf25c2 (historical) | Merged pass 1 | Merged pass 2 |
| --- | ---: | ---: | ---: | ---: |
| prepare | 14.514 | 17.181 | 11.793 | 18.441 |
| forgivingCodeEntry | n/a | n/a | 4.987 | 6.226 |
| pendingStorageRecovery | n/a | n/a | 1.314 | 1.737 |
| startupRecovery | n/a | 24.542 | 20.938 | 25.781 |
| startupEffectAndIsolation | n/a | 2.228 | 1.093 | 1.384 |
| legalInitialFragment | n/a | 1.864 | 1.694 | 1.692 |
| legalWithoutJavaScript | n/a | 4.060 | 3.229 | 4.020 |
| legalLanguageHash | n/a | 3.717 | 3.303 | 5.645 |
| analyticsCounting | 4.518 | 4.606 | 4.071 | 4.491 |
| themeAtSendTime | 1.711 | 1.094 | 1.033 | 4.762 |
| legalNavigation | 3.197 | 6.801 | 2.691 | 3.567 |
| accountNavigation | n/a | 66.209 | 23.222 | 29.346 |
| signsInWithARealCode | 24.457 | 18.978 | 9.513 | 9.794 |
| refusesAWrongCode | 7.490 | 9.964 | 10.590 | 10.397 |
| keepsItsPlaceWhenLanguageChanges | 5.962 | 7.491 | 1.776 | 1.923 |
| navbarIsWhole | 4.391 | 4.616 | 4.362 | 4.471 |
| invitationFlow | 22.940 | 23.517 | 8.697 | 8.522 |
| peopleCorrectness | n/a | 12.434 | 30.311 | 22.769 |
| expiresInBrowser | 12.421 | 10.373 | 4.508 | 4.414 |
| accountFlow | 21.577 | 11.773 | 4.083 | 4.480 |
| visualMatrix | 218.299 | 252.226 | 139.293 | 140.489 |
| emailSamples | 8.753 | 22.260 | 16.249 | 11.550 |
| startWorker | n/a | 5.303 | n/a | n/a |
| total | 358.458 | 511.958 | 309.627 | 326.985 |

The historical pair built in 6.488 s and 4.921 s. Their CLI commands totaled 166.407 s for 50 commands and 202.652 s for 62 commands. The tracked sequential red/green probe failed with `SQLITE_BUSY` through the CLI and passed 1,000 binding writes in 39.672 s, verifying the stored count with zero HTTP failures.

No sharding is needed by these measurements: the historical and current suites both completed below 600 s. Keep the ten-minute budget. If future suite growth requires sharding, separate protocol/Account/People checks from the visual/startup/email matrix, each process with its own ephemeral database and the existing budget. Do not run two processes against one persistence folder. That is a future proposal, not an implemented split.

## Cleanup verification

Review follow-up: cleanup attempts the browser and Worker concurrently, including pending launches, under a five-second bound. The watchdog and forwarded interruption use the same cleanup. Startup creation and its first fetch share the original one-minute deadline; failure disposal is bounded too. On Windows, the launcher relays signals over IPC so Node can clean up before exiting. Other platforms receive the native signal.

Cleanup measurements use each launch's descendants and a fresh dedicated temp directory. Counts exclude pre-existing processes and folders. W = workerd processes, C = Chromium processes including renderers, T = runtime-created temp directories inside a fresh empty measurement container. Descendant PIDs and creation times identify each launch's processes; these are not machine-wide counts.

| Control | Exit | Before W / C / T | Observed peak W / C / T | After W / C / T |
| --- | ---: | --- | --- | --- |
| Full passing run 1 | 0 | 0 / 0 / 0 | 2 / 7 / 4 | 0 / 0 / 0 |
| Full passing run 2 | 0 | 0 / 0 / 0 | 2 / 6 / 4 | 0 / 0 / 0 |
| Forced watchdog (40 s) | 1 | 0 / 0 / 0 | 2 / 8 / 4 | 0 / 0 / 0 |
| SIGINT relay | 130 | 0 / 0 / 0 | 2 / 6 / 4 | 0 / 0 / 0 |
| SIGTERM relay | 143 | 0 / 0 / 0 | 2 / 5 / 4 | 0 / 0 / 0 |

The watchdog test temporarily lowered the local run limit to 40 seconds. Signal tests temporarily dispatched SIGINT or SIGTERM through the Bun launcher's handlers. The watchdog/signal controls were measured in the prior cleanup review. All temporary triggers were removed before the consecutive passing pair; the committed run limit is ten minutes. Physical console Ctrl+C and POSIX signal delivery were not exercised.

An initial 15-second stop exposed the browser-launch race: it left one Chromium process and one profile directory at the immediate post-exit snapshot. The pending-launch cleanup fixes that race. That process subsequently exited, and the initial control's leftover profile directory has been removed. The final control directories above contain no residual runtime folders. Raw logs stayed local.

## Final validation

`bun run check` passes with zero errors and warnings. `bun test tests` passes 279 tests across 24 files, with 1,890 expect calls, including seven lifecycle regression tests. Copy-editor and the Node 24 build pass (Vite 5.03 s). The consecutive merged-suite passes run 1,301 checks each in 309.627 s and 326.985 s; their 65 fixture commands total 3.330 s and 3.995 s. The missing-Node smoke test fails immediately with the clear Node 24 PATH message. The Wrangler range, lockfile and both existing limits remain unchanged; all scenario/assertion functions from merged main are preserved.

## Main integration and launch-error reporting

Main at `e73d196bda15c94fcd74f5d0076fd7a8c648751f` was merged with merge commit `19c894e273fee84c868a3d617c26c306ff69a5bf`. A direct source comparison confirms every scenario/assertion function from main is retained, all 21 scenario calls run in their original order, and `e2e/account-navigation.ts` is unchanged. Every fixture call, including Account navigation and code-entry checks, uses the serving Worker's D1 binding. A grep for D1 CLI execution in `e2e/` finds none outside the tracked reproduction script.

Rejected startup and browser-launch promises now contribute no second failure during cleanup, preserving the original error. Actual resource-close failures still propagate. Two regression tests reproduced the previous masking behavior and pass with the rejection handler. The launcher also reports a clear Node 24 PATH message when `node` is absent.
