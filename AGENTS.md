# Working here

The maintainer's notes live in a private Notion workspace; outside contributors can ignore those links. Notion owns intent, decisions, standing rules and how to work with Yesito. Before agentic coding, read [LLMs](https://app.notion.com/p/4083e863069080df9e63d165128a1522), which routes to the rest, and this project's [Notion home](https://app.notion.com/p/4113e86306908045b350d491a11c2d30). `README.md` describes the service.

Use Bun, and Node 24 for the Vite build. `node` on this machine's PATH may be newer, so put `yesid.static-template/.tools` first on PATH.

- `bun install --frozen-lockfile`
- `bun run check`
- `bun test tests`
- `bun run copy-editor`, then `bun run build:login`
- `bun run test:e2e` signs in with a real browser against a local Worker. It needs a Playwright Chromium install.
- `bun scripts/new-client.ts` prints SQL for adding a client. It changes nothing by itself.

This is a live sign-in service for real clients, at `login.yesid.dev`. The Worker is `yesid-login`. The database keeps its first name, `site-editor-login-proof`, because nothing outside the configuration uses it and renaming it would mean copying production data.

- All changes to this repository go through the `yesid.login` thread, at Yesito's request (2026-11-07).
- Only that thread deploys, and only for changes Yesito has authorized. A release goes to staging first with `bun run deploy:staging` (Worker `yesid-login-staging` at `staging.login.yesid.dev`, database `yesid-login-staging`, App `yesid-login-staging` on the sandbox repository only), passes a real sign-in and save there, then goes to production with `bun run deploy`. Both run the build, tests, check and browser E2E first. By the 2026-11-10 owner rule, the owner may instead ship a chosen commit with `bun run release:now` after a build only, without tests, required checks, staging or waiting. A request from another thread does not authorize a deploy.
- Confirm a PR is merged before deploying. Apply a new migration before the Worker that needs it. Migrations must stay additive, and applied ones never change. One approved exception: before the repository went public, migration 0003 lost its client rows, with Yesito's approval (2026-11-07); the production database was not touched.
- Production database writes need a backup first and a reason Yesito has accepted. Report counts, never addresses.
- Do not weaken `src/guard.ts`, `src/relay.ts`, `src/graphql-read.ts`, permissions, neutral sign-in wording or `sameCodeFailure`. A request the closed GraphQL list or content rules refuse is a finding to report, not a rule to loosen.
- Never read, print or commit secrets, `.dev.vars` files or one-time codes. Send real email only to Yesito's own inboxes or where he asks.
- Client data never goes in a tracked file, including migrations; a test enforces this. Clients are added with `scripts/new-client.ts`.
- The legal text in `login/legal/copy.ts` is unreviewed by a lawyer. Do not add legal claims, and keep FR, EN and ES in step.
- In Svelte, `{` in an attribute is an expression: a `pattern` with a quantifier needs an escaped brace or an expression.
- Working files are CRLF. Commit as its own plain command, because hooks can block long chained commands containing `git commit`. Never use `--no-verify`.
