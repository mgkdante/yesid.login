# Sign-in, code, Account and editor hand-off: state transitions

This is the target behaviour for the sign-in app's screens: what each stage asks for, what it consumes, what it keeps and where every outcome leads. Tests and pull requests cite its rule numbers, such as `S-7` or `A-4`. Where today's code differs, the difference is listed under "Today" and the slice that closes it is named.

It changes no server rule. The Worker, Better Auth and the tests in `tests/` stay the authority for codes, budgets, sessions and site binding. Nothing here weakens `src/guard.ts`, `src/relay.ts`, `src/graphql-read.ts`, permissions, the neutral sign-in wording or `sameCodeFailure`.

## Fixed server facts

These come from the code at the time of writing (Better Auth 1.7.18). A change to any of them changes this document first.

| Fact | Value | Source |
| --- | --- | --- |
| Code validity | 5 minutes from its creation on the server | `CODE_SECONDS`, `src/auth.ts` |
| Wrong guesses | 3 per code. The record is then locked until a new code replaces it | `allowedAttempts`, Better Auth `atomicVerifyOTP` |
| A new code | replaces the previous code for the same purpose and address. Only the latest code works | Better Auth `createVerificationValue` |
| A correct code | is consumed. It cannot be used twice | Better Auth `atomicVerifyOTP` |
| Every unusable code | wrong, expired, exhausted, replaced or consumed: the same reply, 400 `Invalid or expired code` | `sameCodeFailure`, `src/responses.ts` |
| Sign-in code requests | the same success reply whether the address has an account or not, and whether its budget is spent or not, after at least 1 second. Failures that do not depend on the address still pass through: a per-IP 429, a 400 for a malformed request, a 5xx | `claimCode`, `atLeast`, `src/index.ts` |
| Per-address budget | 5 codes an hour, 10 a day. Over budget the reply is still the neutral success, never 429 | `src/code-requests.ts` |
| Per-IP limits | one bucket per endpoint, per 10 minutes: `send-verification-otp` 5, `sign-in/email-otp` 10, `request-email-change` 5, `change-email` 10. Over a limit the reply is 429 with an `X-Retry-After` header in seconds | `rateLimit`, `src/auth.ts`; Better Auth `rateLimitResponse` |
| Account budget | 5 code requests an hour per person, across both Account requests. Over it the reply is 429, without `X-Retry-After` | `src/account.ts` |
| Session | 8 hours. It is bound to one site by the first `/auth/bind`, and `/auth/sites` then lists only that site | `src/auth.ts`, `src/index.ts` |
| Address change | deletes every session of that person, so every stored token stops working | trigger `email_change_sessions`, `migrations/0005_invite_safeguards.sql` |
| A refused Account code | can follow a correct code: `request-email-change` and `change-email` consume the code before their later checks, and a later failure still replies 400. A 400 never proves the code is still usable | Better Auth, `sameCodeFailure` |
| Account proofs | a code to the current address, then a code to the new address. Both are required | `verifyCurrentEmail`, `src/account.ts` |
| New address already in use | `request-email-change` replies success and sends nothing | Better Auth |

The app may never tell apart what the server keeps identical: unusable codes, known and unknown addresses, and in-budget and over-budget sign-in requests.

## What the browser keeps

| Key | Storage | Holds | Never holds |
| --- | --- | --- | --- |
| `login.pending` | sessionStorage, this tab | `{ step: 'enter', email, sentAt, expiresAt }` | the code |
| (in memory) | the page | the token after sign-in, and which records are void | |
| `login.account.<slug>` | sessionStorage, this tab | `{ userId, stage, newEmail, sentAt, expiresAt }`, where `userId` is the signed-in person's id from the session | either code |
| `login.session.<slug>` | localStorage | `{ backendName: 'github', token }`, written only when the editor opens | an address |
| `login.language` | localStorage | the chosen language | |

Retained context is nonsecret: an address the person typed and timestamps. A code is never stored, logged, put in a URL or sent anywhere except the code check it was typed for. A token is held in memory until an editor opens, and then only under its site's key.

**Blocked storage.** Each rule says what happens when a read, write or removal throws.
- **Restorable context** (`login.pending`, `login.account.<slug>`, `login.language`): a failed write never stops the current screen. It only loses what a reload or a language change would have restored, and the person is told once, near the task, with the storage warning in the copy.
- **The editor session** (`login.session.<slug>`): writing it is a prerequisite for opening the editor directly (H-2). If the write fails, the editor does not open.
- **Removals:** a failed removal never turns a server success into a reported failure. The page keeps going from the server's outcome and remembers in memory that the record is void. If a void record comes back after a reload, it restores a screen for the same tab and person. Its code may still work until it expires on the server or is consumed, and every server request gets its normal reply. Nothing is revealed that the person did not already see. A stale `login.session.<slug>` is either still the person's own valid session or already rejected by the server (401), and every 401 sends the person to sign in.

**Reading a record.** A `login.pending` or `login.account.<slug>` record is used only if it parses, has every field with the right type, its `step` or `stage` is one this document defines, `sentAt <= now`, and `expiresAt` equals `sentAt + 300000` and is not more than 5 minutes ahead of now. Any other record is removed and treated as absent. A new record always replaces the old one whole. Records are never merged.

**Reload and language change are the same event.** The language toggle reloads the page with `?lang=`, so every reload rule below also applies to a language change.

**Clock.** `sentAt` is taken just before a code request leaves the browser, and `expiresAt = sentAt + 300000`. The server creates the code after that moment, so the local deadline is never later than the code's real expiry. No live per-second countdown is shown.

## Sign-in

### Stages

| Stage | Shown | Retained | Leaves by |
| --- | --- | --- | --- |
| **Email** | Step 1 of 2, the email field, the send action | the typed address, in the field | S-1 to S-3 |
| **Code** | Step 2 of 2, the neutral sent statement naming the address, the code field, Sign in, Request another code, Change email address | `login.pending` | S-4 to S-12 |
| **Code, expired** | the same screen with the deadline message, Sign in disabled and Request another code as the main action | `login.pending` | S-8, S-9 |
| **Sites** | the site list, the single-site jump, the switch question or the empty message | the token, in memory only | S-13 to S-17 |
| **Opening** | the editor loading screen, or in a popup the hand-off status | `login.session.<slug>` (direct only) | H-1 to H-7 |

### Rules

**S-1. Send from Email.** The request is `send-verification-otp` with `type: 'sign-in'`, the address trimmed, and the language and theme headers. The button reads "Requesting a code…" while busy. On any 2xx: go to Code, record `sentAt` and `expiresAt`, save `login.pending`, and move focus to the code field. If the save throws, stay on Code and show the storage warning.

**S-2. Send fails.** On a 429, stay on Email with the S-12 message. On a lost response, a network error or another status, stay on Email with the request failure message. The address stays in the field. The request may have reached the server, so a later code may still arrive; the next successful request replaces it (fixed facts).

**S-3. Email validation.** The browser's native email check runs first. No request is sent for an invalid address.

**S-4. Code format.** Before the check, the app removes separators and tests the result:
- Separators are spaces, tabs, no-break spaces, zero-width spaces, hyphen-minus and en dashes, anywhere in the value.
- What remains must be exactly six ASCII digits. Leading zeros are kept.
- Anything else is a format error, and no request is sent: letters, other punctuation (a full stop included), other digit scripts, or more or fewer than six digits. Digits are never pulled out of surrounding text.
- The field must accept a pasted value longer than six characters, so `maxlength` is not 6. Normalizing happens on submit and may also tidy the field on paste.

The format error is "Enter the 6-digit code from the email. You can paste it." in the page language, tied to the field with `aria-describedby` and `aria-invalid`, with focus on the field.

Required pastes: `123456`, ` 123456`, `123456 `, `123 456`, `123-456`, `000123`. Required refusals: `12345`, `1234567`, `12a456`, `Code: 123456`, `123456.`.

**S-5. Sign in from Code.** The request is `sign-in/email-otp` with the address and the normalized code. The button reads "Checking code…" while busy.
- On 2xx with a token: clear `login.pending`, keep the token in memory, and load the sites (S-13).
- On 2xx without a token: treat it as a lost response (S-7).

**S-6. Code refused.** On a 400 (every unusable code), stay on Code with "That code did not work. Check the latest email, or request another code." The digits stay and are selected, the error is tied to the field, and focus is on the field. On a 429, stay with the S-12 message. Nothing in the app says whether the code was wrong, expired, exhausted or replaced.

**S-7. Lost check.** On a network error or lost response, stay on Code with the request failure message and keep the digits. If the lost reply was a success, the code is now consumed, a retry gets S-6, and the person requests another code. That is accepted.

**S-8. Request another code**, from Code or Code, expired. This is the same request as S-1 for the retained address, with "Requesting a code…" on the action.
- On 2xx: clear the digits, record the new deadline, save `login.pending`, leave the expired state, show "Request received. Check your inbox and junk mail. Use the latest code.", and focus the code field.
- On 429, a failure or a lost response: keep the digits and the current deadline, and show the matching S-2 message. Digits are cleared only after an accepted request.

**S-9. Change email address**, from Code or Code, expired. Go to Email with the address still in the field, clear the digits, clear `login.pending`, and focus the email field. The code already sent stays valid on the server until it expires or is replaced. That is harmless.

**S-10. Local deadline.** When `expiresAt` passes on Code, the screen stays on Code and enters Code, expired:
- "This code request has expired. Request another code to continue." is tied to the field.
- Sign in is disabled. The digits stay.
- If focus was on Sign in, it moves to Request another code. Otherwise focus does not move.
- Nothing goes back to Email, and no error appears on another stage.

**S-11. Reload or language change on Code.** `readStep` restores the stage from `login.pending`:
- **Before `expiresAt`:** Code, with the address and the neutral statement. The digits are empty, because the code is never stored.
- **Within 30 minutes after `expiresAt`:** Code, expired (S-10), with the address.
- **Later, unreadable, or failing the sanity bound** (`expiresAt` more than 5 minutes ahead of now): clear the record and show Email, empty.
- **Storage that cannot be read:** Email, empty. If the write failed earlier, the person was already warned (S-1).

**S-12. Throttle wording.** A throttle message appears only for a 429 from the server. When the reply carries `X-Retry-After`, the message gives that wait rounded up to whole minutes ("Too many requests. Try again in {n} minutes.", with the singular for 1). Without it, the message is "Too many requests. Try again later." A per-IP limit does not depend on the address, so showing its wait reveals nothing about accounts.

**S-13. Sites load.** `GET /auth/sites` with the token. While the request is pending, show "Loading your websites…" in the page language, without a chooser heading or list. A failure shows the failure message and Try again without a chooser heading. Automatic opening never flashes the chooser first.
- On 401: clear the requested site's stored session, then go to Email with "Your sign-in has ended. Sign in again." in the page language.
- On another failure, or a list that fails `validTarget`: stay with the site-list failure message and a Try again that repeats S-13 with the token in memory.

**S-14. One site, or the requested site.** S-17 is checked first: with `?switch` and a listed requested site, the switch question wins, even when it is the only site. Otherwise, if `?site=` names a listed site, or the list has exactly one site, open it (H-1).

**S-15. Several sites.** Show the list with one heading, and one Open editor action per site. Opening one marks only that row as busy.

**S-16. No site.** The empty message replaces the list and its heading, with Sign out. No empty card is drawn.

**S-17. Switch.** With `?switch` and a listed requested site, show the switch question with Sign out and continue and Keep editing.
- Sign out and continue posts `sign-out` with the token. On success it removes `login.session.<requested>` and returns to Email with the normal sign-in heading, explanation, email field and send action. No switch explanation or additional notice is shown. On failure, including the Worker's 502 `Session still active`, it stays with the request failure message.
- Keep editing opens the requested site (H-1). Binding the same site again is accepted by the Worker.
- If removing the stored session fails after a successful sign-out, the sign-out still counts (the server has ended the session) and the stale token gets a 401 wherever it is used.
- Clearing storage alone is never a sign-out.

**Reload on Sites.** The token is in memory only, so a reload returns to Email, and a new code is needed. This is accepted: a token is never written before an editor opens.

## Editor hand-off

**H-1. Bind.** `POST /auth/bind` with the slug.
- On 401: go to Email (as S-13).
- On 403 or another failure: show the open failure on that row with Try again.
- A session is bound once. A second bind to another site is refused by the Worker.

**H-2. Direct opening.** Write `login.session.<slug>`.
- If the write throws, stay with "This browser is blocking the storage the editor needs. Allow site data for login.yesid.dev, then try again." in the page language.
- Otherwise clear `login.pending` and go to `/<slug>/`.

**H-3. Editor loading screen.** It names the site when its label is known, and says "Opening your editor…" otherwise. The live region holds a sentence, never only punctuation. The screen uses the family `'Inter Variable'`, which `fonts.css` declares.
- If the stored token is missing or the session check returns 401, the editor clears the key and goes to `/?site=<slug>`.
- Any other failure shows the failure message with Try again (reload) and help.

**H-4. Popup requested.** In `/auth/popup`, after H-1, the popup captures `window.opener` once and runs one handshake at a time.
- If the captured opener is null or `closed`, show "Open sign-in from your editor, then try again." The token is not handed over, and the code challenge is replaced.
- Otherwise install one message listener, post `authorizing:github` to the captured opener with this origin as the target, and start a 10-second timer. The hand-off is **requested**. The screen replaces the code challenge with "Opening the editor…" and shows no form.

**H-5. Popup acknowledged.** The hand-off is **acknowledged** only by a message whose `origin` is this origin, whose `source` is the captured opener and whose data is exactly `authorizing:github`. On the first acknowledgement:
- post exactly `'authorization:github:success:' + JSON.stringify({ token })` to the captured opener, with this origin as the target;
- remove the listener and the timer;
- show "Sign-in confirmed. Return to your editor window to continue."

The token is posted once per popup. A non-null opener alone is never success.

**H-6. No acknowledgement.** If the timer ends first, show "We could not reach your editor window." with Try again.
- The listener stays installed. A late acknowledgement is accepted and follows H-5.
- Try again posts `authorizing:github` again and restarts the timer. It never installs a second listener.
- If the opener is `closed` when the timer ends or Try again is pressed, show the H-4 missing-opener message, then remove the listener and the timer.
- The token is never posted before an acknowledgement.

**H-7. Closing.** The editor may close the popup after success. The popup never claims that unsaved work in the editor is safe or lost. Leaving or closing the popup removes the listener and the timer. A `pagehide` with `persisted: true` keeps the handshake active so restoring the popup from the back-forward cache can still accept acknowledgement or offer retry.

## Account

Account lives at `/account?site=<slug>` and needs the stored token for that site, a valid session, a bound session and the site in `/auth/sites`. It is open to every signed-in role. The Worker checks the bound site, not the role (`src/index.ts`).

### Stages

| Stage | Shown | Request on submit | Consumes | Retained |
| --- | --- | --- | --- | --- |
| **A0 Restoring** | the page, with the form disabled | session, `/account`, sites | | |
| **A1 New address** | the current address, named; the new-address field | `send-verification-otp` with `type: 'email-verification'`: a code to the **current** address | an Account budget slot | `login.account.<slug>` with `newEmail` |
| **A2 Current code** | both addresses, named; the code field | `request-email-change` with `newEmail` and the current code: the server checks it and sends a code to the **new** address | the current-address code; a budget slot | `newEmail`, deadline |
| **A3 New code** | both addresses, named; the code field | `change-email` with `newEmail` and the new code | the new-address code | `newEmail`, deadline |
| **A4 Done** | "Sign in with your new email", without a form | | the session (the token is removed) | nothing |

### Rules

**A-1. Restore.**
- If the slug is not a valid target, the token is missing, the session is gone (401 or no session), Account is not allowed for this session (403 from the session, `/account` or `/auth/sites`), or the site is not listed: go to `/?site=<slug>`, or `/` without a valid slug.
- On any other failure (a network failure, a 429, a 5xx, another status or a malformed reply): keep the form disabled, say which step failed ("We could not load your account. Try again."), and offer Retry, which repeats A-1.
- The form is never enabled until A-1 succeeds.

**A-2. Messages before any code.** No code message ("That code did not work…") appears before the person has submitted a code. No sign-in failure message ("Could not sign in") appears to a signed-in person. Each failure names its operation: sending a code to the current address, sending a code to the new address, or changing the address.

**Every Account request.** A 401 follows A-9. A 429 shows the S-12 message, with the wait when `X-Retry-After` is present (the Account budget sends none). A 400 on a code shows the S-6 message, worded identically, and the app never says why. Any other status, a malformed reply or a lost response shows the failure for that operation:
- A1: "We could not send a code to your current address. Try again."
- A2: "We could not check this code or send a code to your new address. Try again or start again."
- A3: "We could not change your email. Try again or start again."

**A-3. A1 to A2.** On 2xx: replace the record with `{ userId, stage: 'current', newEmail, sentAt, expiresAt }`, go to A2, clear the code field and focus it. On anything else: stay on A1 with the address kept.

**A-4. A2 to A3.** Code format as S-4, with the same paste table.
- On 2xx: replace the record with stage `new` and a new deadline, go to A3, clear the digits, and say a code was sent to the new address if it can be used. The server replies the same when the address is taken.
- On any failure: stay on A2 with the digits kept. A 400 can follow a consumed correct code (fixed facts), so A2 always offers both a retry with the same field and Start again (A-6). Nothing claims the code is still usable.

**A-5. A3 to A4.** Code format as S-4.
- On 2xx: remove `login.session.<slug>` and `login.account.<slug>` and show A4. If a removal fails, A4 is still shown: the trigger has deleted every session, so a stale token gets a 401. The Worker notifies the old address.
- On a 400 or another failure: stay on A3 with the digits kept, and offer Start again (A-6).
- On a lost response: say the change may have happened, and offer "Sign in with your new email" and "Sign in with your current email".

**A-6. Back, Request another code, and Start again.** A record is always replaced whole, never edited.
- **In A2:** Request another code repeats A1's request for the same new address. On 2xx it stays on A2, clears the digits, replaces the record with stage `current` and a new deadline, and focuses the field. On any failure it stays on A2 with the digits and the record unchanged, and shows the S-12 message or the A1 failure message. Back and Start again both return to A1 with the address kept, the digits cleared and the record replaced by stage `address`.
- **In A3:** a code cannot be sent alone, because the current-address code is consumed. Request another code, Back and Start again all return to A1 with the new address kept, the digits cleared and the record replaced by stage `address`. A new current-address code is needed, and a short note says so, so a second code to the current address is no surprise.
- Another tab can request a code for the same person and replace this tab's challenge. The next check then fails with the neutral S-6 reply, and Start again recovers.

**A-7. Deadlines.** At the local deadline in A2 or A3, the stage stays with the deadline message and Request another code (A-6). The digits stay, and the submit action is disabled.

**A-8. Reload or language change.** After A-1 succeeds, read `login.account.<slug>` under "Reading a record". A record whose `userId` is not the signed-in person's is removed and treated as absent.
- Stage `address` (written by Back or Start again; `sentAt` is the moment it was written), within 35 minutes of `sentAt`: A1 with `newEmail`.
- Stage `current` or `new`, before its deadline: restore A2 or A3 with an empty code.
- Stage `current` or `new`, within 30 minutes after its deadline: A1 with `newEmail` and the deadline message.
- Anything else, no record, or unreadable storage: A1, empty.
- A4 is never restored. The token is already gone, so A-1 sends the person to sign in.

**A-9. 401 at any stage.** The session ended. Remove `login.account.<slug>` (a failure is ignored, and the `userId` check covers a stale record) and go to `/?site=<slug>`.

## Today, and the slice that closes each gap

| Gap | Rule | Slice |
| --- | --- | --- |
| `maxlength="6"` cuts a pasted code with a space, and no separators are removed | S-4 | LOG-2 |
| At the deadline the Code stage returns to Email with "Invalid or expired code" | S-10 | LOG-2 |
| `readStep` clears an expired step, so a reload after the deadline loses the address | S-11 | LOG-2 |
| Resend keeps the old digits after success | S-8 | LOG-2 |
| The deadline is taken after the reply, not before the request | Clock | LOG-2 |
| "Too many requests. Try again in a few minutes." ignores the `X-Retry-After` wait the server gives | S-12 | LOG-2 (sign-in), LOG-5 (Account) |
| The switch action label is clipped in French and Spanish | S-17 | LOG-3 |
| Closed: a site-list 401 returns to Email with the sign-in-ended explanation | S-13 | LOG-6 |
| Closed: the chooser has one heading; the empty message replaces its heading and card | S-15, S-16 | LOG-6 |
| Closed: popup success waits for the exact captured-opener acknowledgement, posts once, and cleans up its listener and timer | H-4 to H-7 | LOG-6 |
| Closed: editor loading names the Site when known, updates a persistent sentence live region, and uses Inter Variable | H-3 | LOG-6 |
| A failed Account restore enables the form; "Invalid or expired code" and "Could not sign in" appear out of place | A-1, A-2 | LOG-5 |
| The Account code field cuts a formatted paste | A-4, A-5 | LOG-5 |
| A language change loses the Account stage and the new address | A-8 | LOG-5 (keep the address); LOG-15 (full stages) |
| Back and Request another code in Account | A-6 | LOG-15 |
| Account is linked only from People | Account | LOG-16 |
