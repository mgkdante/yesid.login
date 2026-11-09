# yesid.login

Cloudflare Worker behind `login.yesid.dev`, for email-code sign-in and Sveltia CMS 0.261.0. Bun runs scripts and tests. Better Auth uses D1 and signed bearer sessions; Resend delivers codes. A GitHub App supplies repository-scoped tokens that never reach the browser.


This is the production sign-in service for [yesid.dev](https://yesid.dev) client sites, published as a reference. `wrangler.toml` names yesid.dev's own Worker, database and GitHub App, so a fork needs its own. Security reports: see [SECURITY.md](SECURITY.md). Licence: [MIT](LICENSE).

## Documentation

- [Architecture](https://yesid-dev.notion.site/4113e863069081b99778facfd68548a6): how the service works today, verified against this repository: routes, sign-in and sessions, the GitHub relay, the data model, testing, release and known limits.
- [Glossary](GLOSSARY.md): the words used for the service, its sites and their people.

## Routes

| Path | Behavior |
| --- | --- |
| `/` | FR/EN/ES sign-in, then membership-based site choice; one site opens directly |
| `/?site=<slug>` | Same flow, prefers that site only when it is a membership |
| `/<slug>` | Redirect to `/<slug>/` for a known site |
| `/<slug>/` | Generated editor page; boot checks session and membership before loading Sveltia |
| `/<slug>/config.yml` | `cms/config.yml` from that site's repository and branch, for members only; the Worker keeps a copy for 60 seconds, and `boot.js` adds the session to Sveltia's request |
| `/<slug>/api/v3/*`, `/<slug>/api/graphql` | Session and membership required before any GitHub call |
| `/<slug>/people` | FR/EN/ES People app, data and actions gated by the bearer API |
| `/<slug>/people/members`, `/<slug>/people/members/<id>` | Owner/IT membership management |
| `/auth/sites` | All eligible sites before binding; only the bound site afterwards |
| `/auth/bind` | POST a slug once with a signed bearer; eligible membership required |
| `/auth/api/*` | Better Auth, including code flow, session and sign-out |
| `/auth/popup` | Sveltia OAuth popup fallback |
| `/account` | Signed-in account page, including the email change |
| `/legal/privacy`, `/legal/terms` | FR/EN/ES privacy policy and terms of use, public and indexable |
| `/privacy`, `/terms` | Permanent redirect to the `/legal/` address, keeping the query |
| `/admin`, `/admin/` | Redirect to `/` |
| `/editor/*`, `/login/*` | Worker-hosted static files |

Slugs match `^[a-z0-9][a-z0-9.-]{0,62}$`. Reserved: `auth`, `api`, `admin`, `login`, `editor`, `account`, `privacy`, `terms`, `legal`. Unknown or invalid site routes return 404. Relay routes return 401 without a session and 403 without membership. The App token is limited to the site's installation and repository. The existing guards still constrain REST reads and commit branch, repository and file paths. Markdown is writable only directly inside a one-level collection folder, `src/lib/content/<name>/`, where `<name>` matches `^[a-z][a-z0-9-]*$`. This rule applies to every site, and reads use the same rule, so client sites must not keep anything private in such a folder.

## Add a site and a person

Owners and IT can add and remove Employees at `/<slug>/people`. Initial provisioning is an authorized operator task. Grant the GitHub App access to the repository first and obtain its installation ID.

Generate SQL into a temporary file outside the repository:

```powershell
bun scripts/new-client.ts --slug example --owner example-owner --repo example-site --branch main --label Example --installation 123456 --person person@example.test --role owner > $env:TEMP/new-client.sql
```

Review the SQL. It looks up the person by email and sets `confirmed_at` for Owner or IT. If no user exists, explicitly enable the commented optional user insert, which includes a generated ID. Otherwise execution fails instead of silently creating no membership. No signup is enabled.

Back up D1 using the deployment owner's backup procedure before applying reviewed SQL with authorization:

```powershell
bunx wrangler d1 execute site-editor-login-proof --remote --file $env:TEMP/new-client.sql
bunx wrangler d1 execute site-editor-login-proof --remote --command "SELECT count(*) AS sites FROM site WHERE slug='example'; SELECT count(*) AS confirmed_members FROM membership WHERE site_slug='example' AND role='owner' AND confirmed_at IS NOT NULL;"
```

Check that both counts are 1 without printing addresses. Remove a membership to revoke access to that site; delete the person's sessions to revoke sign-in. All three roles authorize editing.

Client data never goes into a migration or a tracked file. A test refuses any real-looking email address outside the operator's own domain and reserved example domains.

Each client repository must contain `cms/config.yml`, with backend settings:

```yaml
backend:
  name: github
  repo: repository-owner/repository-name
  branch: main
  api_root: https://login.yesid.dev/example
  graphql_api_root: https://login.yesid.dev/example
  base_url: https://login.yesid.dev
  auth_endpoint: auth/popup
```

Config is read by members only, but never put secrets in it. Do not enable Sveltia's commit author or sign-off options; the Worker drops commit bodies and any headline holding an email address. Yesito owns client configuration and package updates.

## Local running

```powershell
bun install --frozen-lockfile
bun run copy-editor
bun run build:login # Node 24 LTS must be on PATH
bun scripts/seed-local.ts
bunx wrangler d1 migrations apply site-editor-login-proof --local --persist-to .wrangler/s13-local
bunx wrangler d1 execute site-editor-login-proof --local --persist-to .wrangler/s13-local --file .wrangler/s13-fixture/seed.sql
bunx wrangler dev --local --persist-to .wrangler/s13-local --env-file .dev.vars.s13 --port 8787
```

The helper writes only fake data and an exclusive-create gitignored `.dev.vars.s13`. It refuses to overwrite it. To repeat a session seed, reuse the generated seed SQL while its session is unexpired. `.wrangler/s13-fixture/browser.json` contains the fake signed Sveltia entry to set under `login.session.example` on localhost. It is not a real credential. This fixture never sends a real email or reaches GitHub because the App key is deliberately invalid. Use a browser-only config fixture for Sveltia rendering; do not add a production bypass to the Worker. Generated Sveltia and font files are ignored and copied from exact installed packages. No generated admin config remains.

Runtime bindings: `ASSETS`, `DB`. Variables: `GITHUB_APP_ID`, `EMAIL_FROM`, `ALERT_EMAIL`. Secrets supplied by the deployment owner: `BETTER_AUTH_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `RESEND_API_KEY`. Never put real values in this repository or local test fixtures. Site owner, repository, branch and installation ID live in D1.

```powershell
bun run check
bun test tests
```

Handler tests use SQLite-backed D1 fakes, fetch stubs, and a session resolver passed to a handler factory. Production always uses Better Auth; no environment flag can bypass authentication.

## Pinned Sveltia session contract

At 0.261.0, its localStorage wrapper JSON serializes `sveltia-cms.user`. The minimum restoration entry is `{ "backendName": "github", "token": "<signed Better Auth bearer>" }`. `G9e` accepts an object with a string `backendName`; `X9e` passes `token` and optional `refreshToken` to the backend's automatic sign-in. GitHub then calls `/user` and replaces the entry with the returned profile:

```text
{ backendName, id, name, login, email, avatarURL, profileURL, bot, token, refreshToken }
```

Undefined fields are omitted by JSON serialization. The bootstrap does not fabricate an identity. Every request still requires a server-validated signed session and membership. The browser token is a bearer credential accessible to same-origin scripts, so preserve CSP, the pinned bundle and origin ownership. Recheck this undocumented storage contract whenever upgrading Sveltia.

Sveltia's `iRe` appends `/api/v3`; `aRe` appends `/api/graphql` to the configured per-site roots. Sveltia's sign-out writes `{}` through `V9e`; it does not revoke the server session. Boot keeps the token in memory and observes missing tokens via polling and cross-tab storage events, posts Better Auth sign-out and returns to `/`. Failed sign-out is shown and retried. Boot intercepts same-site relay 401 responses and returns to `/?site=<slug>`. Sveltia ordinarily surfaces API failures as errors and may show its sign-in screen. A full navigation on expiry discards in-memory unsaved work. No preservation guarantee is made for Sveltia's own drafts. Saving again requires signing back in.

## Sign-in app

`login/` is a Svelte 5 client app compiled by Vite to ignored `public/login/build/`.
`/`, `/auth/popup` and `/<slug>/people` load it. Worker HTML references fixed filenames and is never cached;
Cloudflare assets use their normal content-based deployment handling.
`bun run deploy` copies the editor, builds login, runs tests and checks, then deploys.
The build refuses Node versions other than 24 LTS. Bun runs installation and tests.

The exact v0.36.1 UI release uses its explicit peers `@yesid/tokens`, `@yesid/motion`,
`@yesid/seo-kit`, Svelte 5.57.2 and Satori 0.33.5. CSS order is tokens, Tailwind,
UI base; the copied self-hosted font stylesheet loads separately. No SvelteKit router is needed.

The app uses SiteHeader (wordmark `Login`), SiteFooter, Wordmark, Button and ConstructionProps.
ConstructionProps appear only on `/` itself.
The fixed background uses the shared `circuit-grid` class, as the website does.
There is no generic email/code input in this release, so native labelled inputs use semantic tokens.
The layout, localized copy and security-sensitive controller remain app-owned.
The theme boot is an external blocking script before CSS. It reads the design system's `theme`
key and otherwise follows the system; `@yesid/ui/state` adopts it and owns toggling.
The upstream theme defaults to dark, so the small external boot is intentionally app-owned.
Login documents alone allow inline styles because design-system components emit style
attributes, and `img-src 'self' data:` for the design-system favicon. Scripts remain self-only, without inline scripts or unsafe-eval. No new origins.
API response CSP and editor CSP are unchanged.

Language priority: allowlisted `?lang=`, `login.language`, supported browser language, French.
The toggle preserves all query parameters, including `site`. Reloads preserve a signed-in token.
Code requests send `X-Login-Language`; the Worker allowlists it solely for email wording.
Messages are app-local translations, never raw server errors.

At Sveltia 0.261.0, `UE.get/set` JSON serializes localStorage, and the preference initialization
reads `sveltia-cms.prefs` through UE. Its IndexedDB wrapper VE is separate and does not store
these preferences. Login merges only `locale` and `theme`, mapping FR to `fr`, EN to `en-CA`,
and ES to `es-CO`. Other preferences remain intact. Recheck this undocumented contract when
upgrading Sveltia. Its theme stylesheet and editor boot are unchanged.

## People management (S13.2)

`/<slug>/people/members` requires the caller's signed session and Owner or IT membership on that site.
GET lists only that site's people. POST accepts an email and always grants Employee access; existing
memberships and user names remain unchanged. DELETE with the internal user ID removes only an Employee
membership on that site, keeps the user record and revokes sessions after the last membership is removed.
The page shell contains no private data; its bearer-authenticated API also gates the controls.

Apply `0004_people.sql` before releasing this Worker. It adds `people_log` and a membership insert trigger
that enforces 25 people per site and 20 additions in the preceding hour. D1 batches keep membership and
audit writes atomic. Re-adding a member writes no audit and sends no email. Welcome emails use the adding
person's allowlisted language. Send failure leaves access in place and warns the Owner.

The body-level People link is Owner/IT only. Below 960 px it is a 48 px icon circle above the mobile
bottom toolbar, hidden while an entry is open. Verify its placement when changing the pinned Sveltia version. It does not change Sveltia's DOM or layout.

## Login chrome and account email

The login, popup, People and `/account` share `login/Chrome.svelte`. The real SiteHeader receives empty links and menu items. Its navigation lifecycle has inert router registration callbacks because every navigation unloads the document. Only its empty menu button is hidden with a login-scoped selector; the package is unchanged. ConstructionProps is decorative and appears only on `/`, spread with a floodlight, in a 240px ground or 100px at 1023px and below.

The footer is the shared SiteFooter, as on yesid.dev and Transit, and the header carries the product wordmark `Login`. The footer's lamp and date come from the design system; no health probe sits behind them. The sign-in form is centered in the first screen, above the ground, on the sign-in page only.

Sign-in step two stores only its step, email and five-minute deadline in sessionStorage. Language links reload the full document and preserve the site hint. Codes and tokens never enter that entry. It is removed on success, return to step one or expiry. Unavailable storage is reported before switching languages.

`/account` is linked only from People. A signed-in person first requests a code to their current address,
then submits it with the new address to request a destination code, then confirms that code.
The current-address request reuses `/email-otp/send-verification-otp` with `type: email-verification`;
the Worker ignores any caller-supplied address and uses the session address. Only the exact two native
email-change paths are additionally allowed. Better Auth requires current-address proof.
The account budget counts both code-request stages, including rejected requests, at five requests
in any rolling hour. It is independent of the existing IP budget. No destination lookup affects the
limited reply. A database trigger deletes every session atomically with an email update.
The browser discards its bearer and asks the person to sign in again at the new address.
The old-address notice is best effort, with address-free failure logs and no retry guarantee.

Invitations require an explicit UI confirmation before POST. New Employees are pending for seven days;
first session creation atomically confirms every still-valid invitation for that person and queues each
site's Owner notice once. Expired memberships grant no code delivery, session creation, site listing or
site access. A separate valid site still permits signing in without confirming the expired membership.
Owner and IT access never expires. Existing memberships are confirmed by migration 0005.
Renewing an expired Employee invitation consumes the site's existing hourly addition budget and creates
an ID-only audit entry. Pending and confirmed additions remain no-ops. Expired people remain removable.
Last edit is the latest retained `edit_log` entry for each person on this site, not a permanent
history. Retention can remove this evidence; the UI says so rather than inventing a date.

Code email colours use the allowlisted `X-Login-Theme` header (`light`, `dark`, default dark).
Welcome, first-sign-in Owner notices and old-address notices default to inline light colours and offer
a dark media override. Tests render these emails in local Chromium only; they do not cover Gmail or Outlook. Owner notices use French because no stored Owner language exists.

`copy-editor` copies fr, es-CO and en-CA from the pinned Sveltia package to `/editor/locales/`. Boot rewrites only those exact pinned locale requests. Update discovery returns the installed version locally. CSP gains no origin. When browser and editor language differ, Sveltia can still offer the browser language; when they match, no offer is shown.

Releases follow `AGENTS.md`: merged PR first, additive migrations before the Worker that needs them,
then `bun run deploy`.

## End-to-end check

`bun run test:e2e` signs in for real in a browser: the real Worker with a local database, a typed code, the editor, the People page, a wrong code, and a language change on step two. `bun run deploy` runs it first, because unit tests can't catch a page that refuses a valid code. It needs Node 24 on PATH for the build and a Playwright Chromium install (`bunx playwright-core install chromium`). Screenshots land in `.wrangler/e2e/shots`.

## Legal pages, chrome and retention

`/legal/privacy` and `/legal/terms` are public FR/EN/ES documents, following the structure, voice and reading layout of yesid.dev's legal pages. `/privacy` and `/terms` redirect there. The source is
`login/legal/copy.ts`; keep its wording and version date deliberate. Legal documents
allow indexing; login, popup, account, People, editor and HTML errors carry `noindex`.
Every app footer links both documents. Sign-in carries no consent line, by Yesito's decision of 2026-11-07, so the terms' wording about accepting them by signing in is one for the lawyer to check (S14). API errors keep JSON.
People and account use Masthead. The construction props show on `login.yesid.dev/` only.
Page modules load separately; all routes share one generated CSS file.

The editor startup screen loads local token CSS and fonts, without the login app.
Its dot-and-ring favicon follows the selected theme at entry. Login documents allow
`img-src 'self' data:`: same-origin icons and the design system's Chrome, which builds its
theme-coloured favicon as a `data:` SVG. The editor's CSP is unchanged. No manifest is installed.
HTML responses send `no-transform`, because the yesid.dev zone's Web Analytics otherwise injects
its beacon at the edge, which local runs cannot show. CSP blocked it, but this notice says no analytics. Browser theme-color
follows the design tokens; no analytics were added.

The daily Cron Trigger runs at 08:17 UTC. `src/retention.ts` runs one D1 batch:

- Delete edit and People logs strictly older than twelve calendar months.
- Delete expired sessions and verifications, normalizing SQLite and ISO dates.
- Delete email-change budgets older than one day (Unix seconds).
- Delete rate-limit rows older than 23 hours (Better Auth's Unix milliseconds).

A second, hourly Cron Trigger (`47 * * * *`, `IP_CRON`) runs only that rate-limit deletion. Those rows hold
IP addresses, and the privacy notice says they are deleted after one day: with a run every hour and a
23-hour cut-off, no row outlives 24 hours while the runs succeed. A failed hourly run alerts like the daily one.
- Delete users without memberships, retained logs as editor, actor or target, or invitation notices.

Account, session and email-budget foreign keys cascade. Invitation notices reference
memberships and are also checked explicitly. No membership is deleted, including an
expired invitation. Only counts or an address-free failure message enter retention logs.
A failed scheduled batch is contained; it does not affect the request handler.
The notice says what this does: deletion at the next daily cleanup, and a failed run
waits for the next one. A failed run logs and queues a throttled admin email in background work.
Provider locations and incident-response commitments cannot be established from
repository code.

Deploying registers the Cron Trigger, which prunes for real. Only a D1 backup can restore deleted
records; rolling back the Worker cannot. Remove the Cron Trigger if pruning must stop.


## Security read boundaries and operational alerts (13.3)

GraphQL uses a closed parsed-AST read list for Sveltia 0.261.0: exactly one query,
no fragment definitions or directives, and one unaliased repository root bound through
owner/repo variables to the authenticated site. Only the captured branch history,
push permission, batched content Blob and Commit status selections, default branch name,
and content expression OID lookup are accepted. Batch aliases are unique numbered names,
at most 300 per document. Pagination arguments and nested fields must match the allowed
shapes. Commit returns allow only oid, committedDate and numbered content file OIDs;
all existing commit input restrictions still apply.

REST tree responses retain content blobs and their ancestor trees, preserving other
response fields. REST blobs and GraphQL Blob OID reads require membership in the site's
current branch content tree. The recursive tree cache is keyed by owner/repo/branch,
lasts 60 seconds and refreshes once on a miss. Truncated or unavailable trees fail closed
for blob reads. REST commit paths, GraphQL history paths and branch expressions must be
content paths. Previously saved blobs removed from the head tree are refused, including
historical or workflow reads. A just-removed blob can remain readable during the cache TTL.

The pinned bundle reads blobs for normal content, truncated-text fallback and asset downloads.
It also contains workflow blob reads and branch/revision file-list plumbing. Historical blobs
outside the head content tree receive 403 under this policy. Workflow/fork documents remain
closed. The supplied capture includes dotfiles in content/history batches before filtering;
the filtered tree prevents their normal discovery. Tests use local fixtures and a local Worker; they do not cover a real load and save with GitHub.

ALERT_EMAIL is a Worker variable set to admin@yesid.dev. Retention batch failures and
Resend refusal or unreachability for code, welcome, Owner and old-address mail queue an
English admin alert. Text contains only the failure kind and HTTP status when available.
The additive alert_throttle table atomically claims one alert attempt per kind per rolling
hour. It stores only kind and time. An alert Resend refuses gives its hour back, and when the
database itself is down the claim falls back to a per-isolate hour, so the alert is still tried.
Sends run in waitUntil work; alert failures log an address-free line, never recurse and never
affect sign-in replies. When Resend is fully down, the alert cannot arrive and only the log
remains. Publish-failure alerts are outside this slice.

## S15 review hardening

- Code requests and code checks take at least one second (`src/code-requests.ts`), so their
  duration cannot reveal whether an address has an account. Replies were already identical.
- Each address gets at most 5 code requests an hour and 10 a day, whoever asks. Migration 0007
  adds `code_budget`, which stores a keyed hash of the address, never the address, and the daily
  cleanup deletes rows after one day. Over budget, the reply is the usual success and nothing changes.
  Each request claims its slot in one atomic statement, so simultaneous requests cannot overshoot,
  and a request the auth library refuses (IP limit, validation) gives its slot back.
  Limit accepted: someone who knows an address can use up its hour and keep that person from getting
  a code until it resets. Without the budget, rotating IP addresses allowed the same, without end.
- Sessions travel only as bearer tokens. The Worker removes `Cookie` from every `/auth/api/` request and
  `Set-Cookie` from every auth reply, so a leftover cookie can never stand in for a cleared token.
- The auth library logs only error kinds: its logger and its unexpected errors are routed through
  fixed messages. It no longer inspects the database schema on every request.

New Better Auth sessions store empty IP and user-agent values via the session creation hook.
IP tracking remains enabled for code-route rate limits. A raw database session token cannot
be used as a bearer; its signed form is required. Existing session IP/browser values age out
with the eight-hour expiry and daily cleanup. Columns remain in place; no data migration is
needed. The browser token still needs same-origin script protection.

## Site-bound sessions

Apply additive migration `0008_session_site.sql` before this Worker. Existing sessions have no
binding; after ten minutes they require a fresh code. New sessions can only list sites, bind,
read their session or sign out until bound. A bound session counts only while its person is still an
eligible member of that site, and removing an Employee deletes their sessions for it. The conditional D1 update chooses one site once;
every config, REST, GraphQL and People data route also checks that binding and current membership.

After a code, one eligible site binds automatically. Multiple sites show the chooser; a valid
site hint binds directly. Tokens are saved separately as `login.session.<slug>`. Boot removes
the legacy `sveltia-cms.user` entry and remaps the pinned async UE wrapper's synchronous storage
calls and same-site storage events before loading Sveltia. Other sites' token events are ignored.
Same-origin storage remains readable by scripts: site binding prevents using A's token on B,
but this storage choice is not an origin isolation boundary against scripts reading B's saved token.

People links Account with `?site=<slug>`. Account is a public shell so it can load a bearer from
localStorage; its form and every email-change API require a bound session. Current-address and
new-address code proofs remain required. People also offers signing out of the current site to
switch, followed by a fresh code and site choice. Sign-out clears only that site's saved token.

The browser runner selects `e2e/worker.ts` explicitly. It stubs email HTTP requests and rejects
all other outbound fetches; production uses `src/index.ts` with no test bypass.
