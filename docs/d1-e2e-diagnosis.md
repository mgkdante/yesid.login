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

## Shard temp paths on Windows (2026-11-14)

PR #53's original launcher (`071d0b2`) assigned each child `TMP`, `TEMP` and `TMPDIR` to a unique `.wrangler/e2e-temp-N-*` directory **inside the checkout**. This made ephemeral D1 depend on checkout depth. `persist: false` disables reuse, not disk storage: the installed Miniflare creates a `miniflare-<32 hex>/d1/miniflare-D1DatabaseObject/` directory under `os.tmpdir()` and workerd opens SQLite files there.

The underlying failure is established, not inferred from the opaque reference. A diagnostic-only tap on raw workerd stdout/stderr captured this structured native error before Wrangler's log handler omitted it:

```text
workerd/jsg/util.c++:415
 e = workerd/util/sqlite.c++:661: failed: unable to open database file: SQLITE_CANTOPEN
 wdErrId = 2oh97k4kptb3rnpi2sdibobu
```

The D1 binding returned `internal error; reference = 2oh97k4kptb3rnpi2sdibobu` with `cause: undefined`. `WRANGLER_LOG=debug` and verbose logging alone still showed only the opaque exception. The raw tap was removed; the restored Miniflare file's SHA-256 equals the original installed file. No dependency instrumentation is part of the fix.

### Paths

Lengths count Windows path characters, without quotes or a terminating NUL. Random directory and object names have fixed lengths.

| Checkout | Root length | Original child temp root length | Observed D1 path | Longest observed runtime file |
| --- | ---: | ---: | ---: | ---: |
| Normal passing checkout | 69 | 97 | 242 base / 246 with `-shm` | 253 |
| Nested failing checkout | 88 | 116 | 261 attempted base / 265 with `-wal` or `-shm` | 222 actually created before failure |
| Short checkout | 7 | 35 | 180 base / 184 with `-shm` | 195 |
| Fixed OS temp root, from the nested checkout | 88 | 49 | 194 base / 198 with `-shm` | 209 |

Normal root: `C:\Users\otalo\.t3\worktrees\yesid.login\t3-a9275d58-6ed236104b90d1c0`.

Nested root: `C:\Users\otalo\.t3\worktrees\yesid.login\t3-a9275d58-6ed236104b90d1c0\.wrangler\adoption`.

Short root: `C:\yl46`.

The following D1 filename is reconstructed from the observed failed namespace and the same binding's deterministic object filename in the passing control:

```text
C:\Users\otalo\.t3\worktrees\yesid.login\t3-a9275d58-6ed236104b90d1c0\.wrangler\adoption\.wrangler\e2e-temp-1-NkpxR8\miniflare-e58964e67fd499e6a2ba5e6b93dc4fba\d1\miniflare-D1DatabaseObject\35c7a3e86ca6d39d5d6c407007bf03af0952ae09f3a9ab0546c67a0091ad88b4.sqlite
```

That 261-character file was never created; the namespace's shorter metadata files existed. The longest project-local Wrangler bundle file observed during the fixed nested run was 147 characters, ending in `.wrangler\tmp\bundle-4rpGkl\middleware-insertion-facade.js`. Moving only runtime temp storage fixes the SQLite failure; moving the checkout or changing Wrangler's bundle directory is unnecessary.

### Controlled initialization experiments

The minimized probe starts the actual `e2e/local-worker.ts` Worker with the same fake bindings, applies every migration through that Worker's D1 binding, inventories temp paths before disposal, and exits nonzero on failure. It starts no browser and has no retry or fallback. One process tests initialization without parallelism; four processes each use their own ephemeral Worker and distinct ports. Diagnostic HTTP ports were 8844–8847.

| Dependencies / app | Checkout | Processes | Original temp allocation | Fixed temp allocation |
| --- | --- | ---: | --- | --- |
| main + #53, v0.41.0 | normal | 1 | pass | — |
| main + #53, v0.41.0 | nested | 1 | `SQLITE_CANTOPEN` | — |
| main + #53, v0.41.0 | nested | 4 | all four fail initialization | — |
| Same main app/harness, only the five design dependencies changed to rc.3 | nested | 1 | same initialization failure | — |
| #46 + #53, rc.3 | short | 1 | pass | — |
| #46 + #53, rc.3 | short | 4 | all four pass | — |
| #46 + #53, rc.3 | nested | 4 | original suite: all four fail before scenarios | all four pass migrations |

Both package sets use Wrangler **4.158.0**, Miniflare **5.20261104.0-beta**, workerd **1.20261104.1**, Node **24.11.0** and Bun **1.4.4**. Only `@yesid/analytics`, `@yesid/motion`, `@yesid/seo-kit`, `@yesid/tokens` and `@yesid/ui` differ between the v0.41.0 and v0.42.0-rc.3 dependency sets. The reduced probe uses the same local Worker and migration code; the merged suite retains #46's LOG-10 assertions and motion observers.

### Fix

`createShardTempDirectory` allocates a unique `yl-e2e-N-*` child under the OS temp directory, outside the checkout. The launcher passes it to each Node child through all three temp environment variables and removes it in the existing `finally` after that child exits. A random suffix separates concurrent invocations of the same shard. There is no fixed shared database directory, retry, longer limit, persistent state, or suppressed initialization error.

The long-checkout allocation regression test was recorded red against the project-relative implementation, then green against OS-temp allocation. It checks the external temp-root contract and separate roots for concurrent invocations. Actual workerd binding probes supply the native red/green evidence, because Bun's own SQLite build can open longer paths than this workerd build.

### Full-suite verification after the fix

All durations below include cleanup. Main's fixed suite passes 1,622 checks. The merged adoption suites pass 2,373 checks; all 2,364 check occurrences from the original #46 unsharded run remain, with only nine extra per-browser aggregate checks (script errors, positive motion sampling and no infinite animation). Counter comparisons normalize only the local port and motion-sample count in check names. Scenario/helper bodies are unchanged.

| Full suite | Shard 1 | Shard 2 | Shard 3 | Shard 4 | Wall seconds | Checks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Main + fix | 151.496 | 117.576 | 105.418 | 198.734 | 198.797 | 1,622 |
| #46 + fix, original 88-character nested checkout | 156.374 | 112.151 | 123.119 | 298.404 | 298.487 | 2,373 |
| #46 + fix, `C:\yl46` | 154.289 | 98.961 | 110.628 | 285.900 | 285.959 | 2,373 |
| #46 + fix, normal sibling worktree (63-character root) | 155.444 | 104.835 | 111.123 | 281.456 | 281.501 | 2,373 |

The original unsharded #46 runner also passes from `C:\yl46`, using the old project-relative child temp layout, at 593.556 seconds before cleanup / 597.375 seconds including cleanup (port 8848). This single-process control overlaps the full nested run; the main-based and short adoption runs also overlap. The final normal-worktree headroom run starts after those controls finish. Do not read those overlapping totals as an isolated benchmark of checkout depth.

The normal sibling path is `C:\Users\otalo\.t3\worktrees\yesid.login\t3-a9275d58-e2e46proof`. Its staged tree hash, `76a9c64fb0d6be3a76e804a2d7b594f6b46ee596`, exactly matches the explicit local merge tree of #46 (`c964d61b`) and #53 (`071d0b2`) plus the temp-root fix. These validation checkouts are detached; #46's branch is unchanged.

Every full adoption run ends with 0 workerd, 0 Chromium, 0 newly allocated runtime temp folders and 0 Wrangler temp folders. The fixed-temp SIGTERM fan-out returns 143 with 0 remaining processes/folders after tracking 45 process IDs and creation times. A broad ancestry sampler can include unrelated processes when a historical parent PID is reused; resource counts here refer to workerd/Chromium, not unrelated desktop helpers. No unrelated desktop process is terminated.

`bun run check`: zero errors/warnings. `bun test tests`: 315 pass, 0 fail, 2,029 expectations across 28 files. Copy-editor and the Node 24 build pass. No scenario/assertion, fixture/startup/run limit, migration or production source changes.
