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

Initial minimal-loop commands (throwaway script under `.wrangler/diagnosis/repro.ts`):

```powershell
bun .wrangler/diagnosis/repro.ts .wrangler/diagnosis/state 8830 idle
bun .wrangler/diagnosis/repro.ts .wrangler/diagnosis/traffic-state 8830 traffic
# Extended-path initialization, Worker stopped:
bun .wrangler/diagnosis/repro.ts ('.wrangler/diagnosis/'+('long-path-'*13)+'/state') 8830 stopped
```

The tracked probe retains the contention experiment without application fixtures. CLI stderr uses `WRANGLER_LOG=debug`; the original probe also captured both Worker stdout and stderr. The underlying errors are `SQLITE_BUSY` and, separately, `SQLITE_CANTOPEN`, rather than an unexplained internal-error reference.

## Harness change

Bun bundles application imports, including token JSON, then starts the runner under Node 24. Node is required for the fetch dispatcher used by Wrangler and Miniflare. `unstable_startWorker` uses the real `wrangler.toml` bindings, assets and compatibility settings, with the existing explicitly selected `e2e/worker.ts` outbound-network stub. Its own Miniflare runtime supplies DB; a missing runtime is an explicit error. This uses the exposed `raw` surface of an unstable API, so a Wrangler upgrade needs these regression checks.

Every run gets fresh ephemeral storage. The real additive migrations run in sorted order through the binding before browser traffic. Fixtures use Wrangler's SQL splitter and D1 batch, preserving multiline SQL and formatted SELECT output used by existing assertions. Explicit `e2e/empty.env` and fake binding overrides prevent loading developer `.dev.vars`. Nothing adds a route or flag to the production Worker. No package versions change.

`COMMAND_LIMIT_MS = 60_000` and `RUN_LIMIT_MS = 10 * 60_000` remain unchanged. Migration and fixture commands retain the minute limit. Startup, migrations, browser failures and normal completion all enter cleanup. All existing browser sections and assertions run; S-*, H-* and A-* behavior is unchanged. This is harness infrastructure outside the Gate A product rows, supporting their acceptance checks rather than changing those rows.

## Timings and validation

All times are contended measurements. Other threads were left running at the owner's instruction; no process belonging to another thread was stopped. Historical source snapshots use the installed cbf25c2 lockfile dependencies, so these compare source/suite changes rather than dependency-version differences.

An initial cbf25c2 run passed in 373.640 s (62 subprocess commands, 147.100 s total); the first modified full run passed in 236.645 s (61 fixture batches, 3.553 s total). The initial fixed timing counted fixture batches but excluded its migration batch; the final instrumentation includes migrations as a fixture command. The visual matrix remains the largest browser section. Builds are separate from `test:e2e`; they do not consume its ten-minute budget.

All section times below are seconds. Timed commands are included in their containing sections. The final passes are the consecutive runs of the final code, after the historical pair.

| Section | f1f5504 | cbf25c2 | Final pass 1 | Final pass 2 |
| --- | ---: | ---: | ---: | ---: |
| prepare | 14.514 | 17.181 | 6.252 | 5.019 |
| analyticsCounting | 4.518 | 4.606 | 4.182 | 4.160 |
| themeAtSendTime | 1.711 | 1.094 | 1.265 | 1.147 |
| legalNavigation | 3.197 | 6.801 | 3.217 | 3.424 |
| signsInWithARealCode | 24.457 | 18.978 | 8.574 | 8.584 |
| refusesAWrongCode | 7.490 | 9.964 | 3.154 | 3.446 |
| keepsItsPlaceWhenLanguageChanges | 5.962 | 7.491 | 3.229 | 1.737 |
| navbarIsWhole | 4.391 | 4.616 | 4.824 | 4.325 |
| invitationFlow | 22.940 | 23.517 | 7.976 | 7.296 |
| expiresInBrowser | 12.421 | 10.373 | 5.522 | 3.486 |
| accountFlow | 21.577 | 11.773 | 4.756 | 3.532 |
| visualMatrix | 218.299 | 252.226 | 109.934 | 107.212 |
| emailSamples | 8.753 | 22.260 | 10.614 | 8.361 |
| startWorker | n/a | 5.303 | n/a | n/a |
| startupRecovery | n/a | 24.542 | 19.692 | 18.319 |
| startupEffectAndIsolation | n/a | 2.228 | 1.150 | 1.180 |
| legalInitialFragment | n/a | 1.864 | 1.617 | 1.882 |
| legalWithoutJavaScript | n/a | 4.060 | 3.823 | 3.289 |
| legalLanguageHash | n/a | 3.717 | 3.879 | 3.865 |
| accountNavigation | n/a | 66.209 | 27.373 | 24.771 |
| peopleCorrectness | n/a | 12.434 | 17.000 | 14.643 |
| total | 358.458 | 511.958 | 248.775 | 230.107 |

The back-to-back pair built in 6.488 s (f1f5504) and 4.921 s (cbf25c2). Fixture/CLI totals were 166.407 s for 50 commands and 202.652 s for 62 commands respectively. The latter started at 2 workerd / 1 Wrangler and ended at 4 / 3; f1f5504 started and ended at 2 / 1. Counts are machine-wide boundary snapshots, not proof of constant CPU load. A short D1 probe and unit checks overlapped part of the historical run; the current run was left free of our other probes. No claim of an idle-machine speedup is made.

The final tracked-probe invocation `node e2e/reproduce-d1.mjs cli traffic 8836` exited 1 with `SQLITE_BUSY`; `node e2e/reproduce-d1.mjs binding traffic 8836` then passed 1,000 writes in 39.672 s with the persisted write-count assertion and zero HTTP failures. This is a sequential red/green comparison of database ownership, with no retry. Earlier binding probes completed in 27.253 s and 31.038 s.

No sharding is needed by these measurements: the historical and current suites both completed below 600 s. Keep the ten-minute budget. If future suite growth requires sharding, separate protocol/Account/People checks from the visual/startup/email matrix, each process with its own ephemeral database and the existing budget. Do not run two processes against one persistence folder. That is a future proposal, not an implemented split.

Validation before the final consecutive pair: `bun install --frozen-lockfile` passed; `bun run check` reported zero errors and warnings; `bun test tests` passed 238 tests / 1,813 assertions across 22 files; `bun run copy-editor` and `bun run build:login` passed (Vite 6.99 s). No screenshots are needed for this harness-only change; the full suite still produces its complete screenshot matrix. An additional full pass completed in 283.386 s with 62 fixture commands totaling 2.708 s; the subsequent final pair includes the restored startup readiness cap.

A direct source comparison of the complete `function check` through the last browser scenario confirms that all scenario and assertion function bodies are unchanged from cbf25c2. The final implementation also retains the original one-minute startup readiness cap.

## Final validation

The final consecutive browser runs passed all 1,268 checks each: 248.775 s and 230.107 s. Their 62 migration/fixture commands totaled 6.014 s and 2.078 s respectively. Both runs started and ended at 2 workerd / 1 Wrangler. The preceding full pass was 283.386 s; the initial full pass was 236.645 s. All used the same ten-minute budget. Final `check` has zero errors and warnings; unit tests pass 238/238 (1,813 expect calls); copy-editor and the Node 24 build pass.

The two historical commits have the identical bun.lock blob, `97b8d1a37a00dc56dff5d80376306d10cae6318e`, so their dependency versions are equal. These are contended source comparisons, not a hardware performance guarantee. We did not obtain an idle-machine benchmark or decode the originally supplied internal-error references.

Machine-wide load samples (workerd / Wrangler process counts at run boundaries):

| Run | Start | End |
| --- | ---: | ---: |
| f1f5504 | 2 / 1 | 2 / 1 |
| cbf25c2 | 2 / 1 | 4 / 3 |
| Additional fixed pass | 2 / 1 | 2 / 1 |
| Final pass 1 | 2 / 1 | 2 / 1 |
| Final pass 2 | 2 / 1 | 2 / 1 |

Local raw evidence is under `.wrangler/diagnosis/`: `before-f1f5504-measured.log`, `cbf25c2-measured.log`, `fixed-final-2.log`, `fixed-final-3.log`, `load.jsonl`, `cli-traffic-final.log`, `binding-traffic-final.log`, `parallel-a.log`, `parallel-b.log`, `long-path-failure.log`, and `final-{check,unit,build}.log`. Logs stay local; the commands, outcomes and per-section measurements needed for review are recorded here.
