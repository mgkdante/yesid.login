import { log10Motion, watchLog10Motion } from './log10-motion.ts';
import { log10Chrome, log10Focus, log10Preferences } from './log10.ts';
import { accountNavigation } from './account-navigation.ts';
import { privacy, terms, LEGAL_UPDATED } from '../login/legal/copy.ts';
import { legalDate } from '../login/legal/render.ts';
import { exampleSiteSql } from '../scripts/example-fixture.ts';
// A real sign-in in a real browser, against the real Worker and a local database: type a code, press the button, land in the editor.
// Unit tests can't catch a page that refuses a valid code, so run this before deploying any login change: `bun run test:e2e`.
// Email isn't sent locally, so the script gives the pending code a known value in the local database, the way the Worker stores it.
import { passcodeEmail, welcomeEmail, ownerNoticeEmail, emailChangedEmail } from '../src/email.ts';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { startLocalWorker } from './local-worker.ts';
import { cleanup, cleanupStarted } from './lifecycle.ts';

process.env.WRANGLER_SEND_METRICS = 'false';
const PORT = Number(process.env.LOGIN_E2E_PORT || 8799);
const ORIGIN = `http://localhost:${PORT}`;
const STATE = '.wrangler/e2e';
const SHOTS = process.env.LOGIN_E2E_SHOTS || resolve(STATE, 'shots');
const OWNER = 'e2e-owner@example.test';
const CODE = '482915';
const TAP_MIN = 44;

/** Each fixture command gets a minute, and the whole run ten. */
const COMMAND_LIMIT_MS = 60_000;
const RUN_LIMIT_MS = 10 * 60_000;
let lastPassed = 'nothing yet';
const started = performance.now();
let commandMs = 0, commandCount = 0;
async function timed<T>(name: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try { return await work(); } finally { console.info(`timing - ${name}: ${Math.round(performance.now() - start)} ms`); }
}
let worker: Awaited<ReturnType<typeof startLocalWorker>> | undefined;
let workerStart: ReturnType<typeof startLocalWorker> | undefined;
async function fixtureCommand<T>(work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  commandCount += 1;
  let limit: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => { limit = setTimeout(() => reject(new Error('Fixture command exceeded COMMAND_LIMIT_MS')), COMMAND_LIMIT_MS); })
    ]);
  } finally { clearTimeout(limit); commandMs += performance.now() - start; }
}
async function sql(command: string): Promise<string> {
  if (!worker) throw new Error('Local Worker is not running');
  const local = worker;
  return fixtureCommand(() => local.sql(command));
}

/** Replaces the code the Worker just generated with a known one, stored exactly as Better Auth stores it. */
async function setPendingCode(email: string, code = CODE, type = 'sign-in') {
  const hash = createHash('sha256').update(code).digest('base64url');
  await sql(`UPDATE verification SET value = '${hash}:0' WHERE identifier = '${type}-otp-${email}'`);
}

async function prepare() {
  rmSync(STATE, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  worker = await (workerStart = startLocalWorker(PORT, COMMAND_LIMIT_MS));
  const local = worker;
  await fixtureCommand(() => local.migrate());
  const now = new Date().toISOString();
  await sql(`${exampleSiteSql}
INSERT INTO site(slug,owner,repo,branch,label,installation_id) VALUES ('choice','fixture','fixture','main','Choice','fake');
INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('e2e-owner','E2E','${OWNER}',1,'${now}','${now}');
    INSERT INTO membership (site_slug,user_id,role) VALUES ('example','e2e-owner','owner');`);
}

function check(name: string, passed: boolean, detail = '') {
  if (!passed) throw new Error(`FAILED: ${name}${detail ? ` (${detail})` : ''}`);
  console.info(`ok - ${name}`);
  lastPassed = name;
}

const codeField = (page: Page) => page.locator('#code');

async function requestCode(page: Page, query: string, email = OWNER) {
  await sql('DELETE FROM rateLimit');
  await page.goto(`${ORIGIN}/${query}`);
  await page.locator('#email').fill(email);
  await page.locator('form button[type="submit"]').click();
  await codeField(page).waitFor();
  await setPendingCode(email);
}

async function signsInWithARealCode(page: Page) {
  await requestCode(page, '?lang=fr');
  await codeField(page).fill(CODE);
  const valid = await codeField(page).evaluate((input: HTMLInputElement) => input.checkValidity());
  check('the code field accepts six digits', valid, await codeField(page).getAttribute('pattern') ?? 'no pattern');
  await page.screenshot({ path: resolve(SHOTS, 'step2.png') });
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`${ORIGIN}/example/`, { timeout: 15000 });
  check('a real code signs in and opens the editor', true);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('login.session.example') ?? '{}'));
  check('the session is stored for the editor', stored.backendName === 'github' && typeof stored.token === 'string');
  await sql("INSERT INTO membership(site_slug,user_id,role) VALUES ('choice','e2e-owner','owner')");
  const refused = await fetch(ORIGIN+'/choice/people/members',{headers:{Authorization:'Bearer '+stored.token}});
  check('a bound session cannot manage the other site',refused.status===403);
  const second = await page.context().newPage();
  await requestCode(second,'?lang=en');
  await codeField(second).fill(CODE); await second.locator('form button[type="submit"]').click();
  await second.locator('.sites').waitFor();
  await second.getByRole('button',{name:'Choice',exact:true}).click();
  await second.waitForURL(ORIGIN+'/choice/');
  const tokens = await second.evaluate(()=>[localStorage.getItem('login.session.example'),localStorage.getItem('login.session.choice')]);
  check('two sites keep distinct sessions in two tabs',!!tokens[0] && !!tokens[1] && JSON.parse(tokens[0]).token !== JSON.parse(tokens[1]).token);
  await page.evaluate(()=>localStorage.setItem('login.language','fr'));
  await page.reload(); await page.locator('a.login-people').waitFor();
  const retained = await page.evaluate(()=>JSON.parse(localStorage.getItem('sveltia-cms.user')!).token);
  check('the first tab restores only its site token',retained===stored.token);
  await second.goto(ORIGIN+'/?site=choice&switch=1&lang=en');
  await second.getByRole('button',{name:'Sign out of this site to switch sites',exact:true}).click();
  await second.locator('#email').waitFor();
  const remaining=await second.evaluate(()=>[localStorage.getItem('login.session.example'),localStorage.getItem('login.session.choice')]);
  check('switching clears only the current site',!!remaining[0] && remaining[1]===null);
  const ended=await fetch(ORIGIN+'/auth/sites',{headers:{Authorization:'Bearer '+JSON.parse(tokens[1]!).token}});
  check('switching revokes the server session',ended.status===401);
  await second.close();
  await sql("DELETE FROM membership WHERE site_slug='choice'");
  await page.locator('a.login-people').waitFor({ timeout: 15000 });
  check('an Owner sees the People button', true);
  await page.setViewportSize({ width: 390, height: 844 });
  // The phone layout can land a moment after the resize, so measure until it does, and report what was seen if it never does.
  const measureFab = () => page.locator('a.login-people').evaluate(link => {
    const box = link.getBoundingClientRect(), icon = getComputedStyle(link, '::before'), style = getComputedStyle(link);
    return { width: box.width, height: box.height, radius: style.borderRadius, text: style.fontSize, icon: icon.width, name: (link as HTMLAnchorElement).title };
  });
  const isFab = (fab: Awaited<ReturnType<typeof measureFab>>) => fab.width === 48 && fab.height === 48 && fab.radius === '50%' && fab.text === '0px' && fab.icon === '24px' && fab.name === 'Personnes';
  let fab = await measureFab();
  for (const settle = Date.now() + 5000; !isFab(fab) && Date.now() < settle; fab = await measureFab()) await page.waitForTimeout(100);
  check('on a phone the People button is a named circle with an icon', isFab(fab), JSON.stringify(fab));
  await page.screenshot({ path: resolve(SHOTS, 'people-fab.png') });
  const shown = (hash: string) => page.evaluate(async value => { location.hash = value; await new Promise(done => setTimeout(done, 50)); return getComputedStyle(document.querySelector('a.login-people')!).display !== 'none'; }, hash);
  check('the People button stays off an open entry', !await shown('#/collections/pages/entries/area') && await shown('#/collections/pages'));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${ORIGIN}/example/people`);
  await page.getByText(OWNER).first().waitFor({ timeout: 15000 });
  check('the People page lists this site', true);
  await page.screenshot({ path: resolve(SHOTS, 'people.png') });
  await page.evaluate(() => localStorage.clear());
}

async function refusesAWrongCode(page: Page) {
  await requestCode(page, '?site=example&lang=en');
  await codeField(page).fill('000000');
  await page.locator('form button[type="submit"]').click();
  await page.locator('#code-error').filter({ hasText: /That code did not work/i }).waitFor({ timeout: 10000 });
  check('a wrong code is refused with a message', page.url().includes('/?'));
  const message = await page.locator('#code-error').innerText();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('#sign-in').click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  }
  await codeField(page).fill(CODE); await page.locator('#sign-in').click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  check('S-6 real exhausted code has the same message as a wrong code', await page.locator('#code-error').innerText() === message);
  await page.getByRole('button', { name: 'Change email address', exact: true }).click();
  await requestCode(page, '?site=example&lang=en');
  await sql("UPDATE verification SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE identifier = 'sign-in-otp-" + OWNER + "'");
  await codeField(page).fill(CODE); await page.locator('#sign-in').click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  check('S-6 real expired code has the same message as a wrong code', await page.locator('#code-error').innerText() === message);

}

async function keepsItsPlaceWhenLanguageChanges(page: Page) {
  await page.evaluate(() => { for (const key of Object.keys(sessionStorage)) sessionStorage.removeItem(key); });
  await requestCode(page, '?site=example&lang=fr');
  await page.goto(`${ORIGIN}/?site=example&lang=es`);
  await codeField(page).waitFor({ timeout: 10000 });
  const lang = await page.evaluate(() => document.documentElement.lang);
  check('changing language keeps step two', lang === 'es');
}

/** LOG-2, S-1 to S-12: browser-only clock and intercepted replies cannot ship in the app. */
async function forgivingCodeEntry(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.clock.install();
  let sendStatus = 200;
  let checkStatus = 400;
  let lastOtp = '';
  await page.route('**/auth/api/email-otp/send-verification-otp', route => route.fulfill({ status: sendStatus, json: {}, headers: sendStatus === 429 ? { 'X-Retry-After': '61' } : {} }));
  await page.route('**/auth/api/sign-in/email-otp', route => {
    lastOtp = route.request().postDataJSON().otp;
    return route.fulfill({ status: checkStatus, json: {} });
  });
  await page.goto(ORIGIN + '/?lang=en');
  await page.locator('#email').fill(OWNER);
  sendStatus = 500;
  await page.locator('form button[type="submit"]').click();
  await page.getByRole('status').filter({ hasText: 'We could not process' }).waitFor();
  check('S-2 failed send returns focus to Email', await page.locator('#email').evaluate(el => document.activeElement === el));
  sendStatus = 200;
  await page.locator('form button[type="submit"]').click();
  await codeField(page).waitFor();
  check('S-4 no alert is present before a code error', await page.getByRole('alert').count() === 0 && await page.locator('#code-error').count() === 0);
  await codeField(page).fill('not a code');
  await page.keyboard.press('Enter');
  await page.getByRole('alert').filter({ hasText: 'Enter the 6-digit code' }).waitFor();
  const firstFormat = await page.locator('#code-error').elementHandle();
  await page.keyboard.press('Enter');
  await page.waitForFunction(el => !el!.isConnected, firstFormat);
  check('S-4 repeated format failure replaces its single alert without duplicate status text', await page.getByRole('alert').count() === 1 && !(await page.locator('.message').innerText()).includes(await page.locator('#code-error').innerText()));
  for (const pasted of ['123456', ' 123456', '123 456', '000123']) {
    await codeField(page).fill(pasted);
    await page.locator('#sign-in').click();
    await page.locator('#code-error').filter({ hasText: 'That code did not work' }).waitFor();
    check('S-4 phone paste reaches the check intact', lastOtp === pasted.replaceAll(' ', ''));
  }
  const neutralFailure = await page.locator('#code-error').innerText();
  for (const cause of ['wrong', 'expired', 'exhausted']) {
    const previousError = await page.locator('#code-error').elementHandle();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    await page.waitForFunction(el => !el!.isConnected, previousError);
    check('S-6 identical UI for ' + cause + ' 400', await page.locator('#code-error').innerText() === neutralFailure);
    check('S-6 repeated refusal has one fresh alert and no duplicate status', await page.locator('#code-error').getAttribute('role') === 'alert' && await page.getByRole('alert').count() === 1 && !(await page.locator('.message').innerText()).includes(neutralFailure));
  }
  check('S-6 refusal associates the error and selects the digits', await codeField(page).getAttribute('aria-describedby') === 'code-error' && await codeField(page).getAttribute('aria-invalid') === 'true' && await codeField(page).evaluate((el: HTMLInputElement) => document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === el.value.length));
  checkStatus = 500;
  await page.locator('#sign-in').click();
  await page.getByRole('status').filter({ hasText: 'We could not process' }).waitFor();
  check('S-7 lost check keeps digits with a request failure', await codeField(page).inputValue() === '000123');
  sendStatus = 500;
  await page.getByRole('button', { name: 'Request another code', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'We could not process' }).waitFor();
  check('S-8 failed resend keeps digits and restores recovery focus', await codeField(page).inputValue() === '000123' && await page.getByRole('button', { name: 'Request another code', exact: true }).evaluate(el => document.activeElement === el));
  sendStatus = 429;
  await page.getByRole('button', { name: 'Request another code', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '2 minutes' }).waitFor();
  check('S-12 authoritative wait is rounded up', await codeField(page).inputValue() === '000123');
  sendStatus = 200;
  await page.getByRole('button', { name: 'Request another code', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Request received' }).waitFor();
  check('S-8 accepted resend clears digits and focuses field', await codeField(page).inputValue() === '' && await codeField(page).evaluate(el => el === document.activeElement));
  await codeField(page).fill('123456');
  await page.locator('#sign-in').focus();
  await page.clock.fastForward(300250);
  check('S-10 deadline keeps Code, digits, disabled submit and recovery focus', await codeField(page).inputValue() === '123456' && await page.locator('#sign-in').isDisabled() && await page.getByRole('button', { name: 'Request another code', exact: true }).evaluate(el => el === document.activeElement));
  check('S-10 expiry has one alert and no duplicate status', await page.locator('#code-error').getAttribute('role') === 'alert' && await page.getByRole('alert').count() === 1 && !(await page.locator('.message').innerText()).includes(await page.locator('#code-error').innerText()));
  await page.screenshot({ path: resolve(SHOTS, 'log-2-expired-390.png') });
  const clearance = await page.evaluate(() => ({ heading: document.querySelector('h1')!.getBoundingClientRect().top, header: document.querySelector('header')!.getBoundingClientRect().bottom, scroll: scrollY }));
  check('S-10 expired heading clears the fixed header at 390 px', clearance.heading >= clearance.header, JSON.stringify(clearance));
  await page.reload(); await codeField(page).waitFor();
  check('S-11 reload restores expired context without digits', await codeField(page).inputValue() === '' && await page.locator('#sign-in').isDisabled());
  await page.getByRole('button', { name: 'Request another code', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Request received' }).waitFor();
  await page.clock.fastForward(300250);
  check('S-10 expiry alerts while the code field keeps focus', await codeField(page).evaluate(el => document.activeElement === el) && await page.locator('#code-error').getAttribute('role') === 'alert' && await page.getByRole('alert').count() === 1);

  await page.goto(ORIGIN + '/?lang=fr'); await codeField(page).waitFor();
  check('S-11 locale change restores expired address', (await page.locator('.lead').innerText()).includes(OWNER) && await page.locator('#sign-in').isDisabled());
  await page.clock.fastForward(1800250); await page.reload();
  await page.locator('#email').waitFor();
  check('S-11 long after deadline restores empty Email', await page.locator('#email').inputValue() === '');
  await page.locator('#email').fill(OWNER); await page.locator('form button[type="submit"]').click();
  await codeField(page).waitFor(); await codeField(page).fill('123456');
  await page.locator('.step-actions button').last().click(); await page.locator('#email').waitFor();
  check('S-9 changing email keeps the address, clears pending and focuses Email', await page.locator('#email').inputValue() === OWNER && await page.locator('#email').evaluate(el => document.activeElement === el) && await page.evaluate(() => sessionStorage.getItem('login.pending')) === null);
  await context.close();
  const blocked = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blocked.addInitScript(() => {
    for (const name of ['sessionStorage', 'localStorage']) Object.defineProperty(window, name, { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  const b = await blocked.newPage();
  await b.route('**/auth/api/email-otp/send-verification-otp', route => route.fulfill({ json: {} }));
  await b.goto(ORIGIN + '/?lang=en'); await b.locator('#email').fill(OWNER);
  await b.locator('form button[type="submit"]').click(); await codeField(b).waitFor();
  await b.getByRole('status').filter({ hasText: 'This browser cannot keep' }).waitFor();
  await b.getByRole('button', { name: 'Request another code', exact: true }).click();
  await b.getByRole('status').filter({ hasText: 'Request received' }).waitFor();
  check('S-1 blocked storage permits resend with one warning', (await b.locator('main').innerText()).split('This browser cannot keep').length === 2);
  await blocked.close();
}

/** Review regressions: retain the sent address and clear warnings after recovery or Sites. */
async function pendingStorageRecovery(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  for (const destination of ['save', 'sites']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => {
      Reflect.set(window, 'blockPending', true);
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (this === sessionStorage && key === 'login.pending' && Reflect.get(window, 'blockPending')) throw new DOMException('Blocked', 'SecurityError');
        return set.call(this, key, value);
      };
    });
    const page = await context.newPage();
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/auth/api/email-otp/send-verification-otp', async route => { await gate; await route.fulfill({ json: {} }); });
    await page.route('**/auth/api/sign-in/email-otp', route => route.fulfill({ json: {}, headers: { 'set-auth-token': 'test-only-token' } }));
    await page.route('**/auth/sites', route => route.fulfill({ json: [] }));
    await page.goto(ORIGIN + '/?lang=en');
    await page.locator('#email').fill(OWNER); await page.locator('form button[type="submit"]').click();
    await page.locator('#email').fill('edited@example.test'); release();
    await codeField(page).waitFor();
    await page.getByRole('status').filter({ hasText: 'This browser cannot keep' }).waitFor();
    check('S-1 in-flight email edits cannot change the accepted recipient', (await page.locator('.lead').innerText()).includes(OWNER));
    if (destination === 'save') {
      await page.evaluate(() => Reflect.set(window, 'blockPending', false));
      await page.getByRole('button', { name: 'Request another code', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Request received' }).waitFor();
      check('S-1 successful save clears the storage warning and stores the sent address', !(await page.locator('main').innerText()).includes('This browser cannot keep') && await page.evaluate(() => JSON.parse(sessionStorage.getItem('login.pending')!).email) === OWNER);
    } else {
      await codeField(page).fill('123456'); await page.locator('#sign-in').click(); await page.getByRole('status').filter({ hasText: 'No site is linked' }).waitFor();
      check('S-5 Sites clears the pending storage warning', !(await page.locator('main').innerText()).includes('This browser cannot keep'));
    }
    await context.close();
  }
}

// LOG-9 is startup only: no S-*, H-* or A-* proof transition is changed.
async function checkStartupState(page: Page, mode: string, path: string, lang: 'fr' | 'en' | 'es', text: readonly string[]) {
  const missing = path === '/missing/';
  if (mode === 'boot-blocked') {
    check(`LOG-9 boot and app blocked ${path} ${lang}: loading sentence stays visible (no failure report without boot.js)`, await page.getByRole('status').isVisible() && (await page.getByRole('status').innerText()).length > 10);
  } else if (mode === 'nojs') {
    check(`LOG-9 nojs ${path} ${lang}: instruction`, missing ? (await page.locator('noscript').innerText()).length > 10 : await page.locator('noscript').innerText() === text[1]);
    check(`LOG-9 nojs ${path} ${lang}: no loading loop`, !await page.getByRole('status').isVisible());
  } else {
    const failure = missing ? { fr: 'Impossible de charger cette page. Rechargez la page ou contactez Yesid.', en: 'We could not load this page. Reload the page or contact Yesid.', es: 'No pudimos cargar esta página. Recarga la página o contacta a Yesid.' }[lang] : text[0];
    await page.waitForFunction(text => document.querySelector('[data-startup-failure]')?.textContent === text, failure);
    check(`LOG-9 ${mode} ${path} ${lang}: failure and reload`, await page.getByRole('status').innerText() === failure
      && await page.getByRole('link', { name: text[2], exact: true }).isVisible());
  }
}

async function startupRecovery(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const copy = {
    fr: ['Impossible de charger la connexion. Rechargez la page ou contactez Yesid.', 'Activez JavaScript pour vous connecter. Rechargez ensuite cette page.', 'Recharger'],
    en: ['We could not load sign-in. Reload the page or contact Yesid.', 'Enable JavaScript to sign in. Then reload this page.', 'Reload'],
    es: ['No pudimos cargar el inicio de sesión. Recarga la página o contacta a Yesid.', 'Activa JavaScript para iniciar sesión. Luego recarga esta página.', 'Recargar']
  };
  for (const lang of ['fr', 'en', 'es'] as const) {
    for (const mode of ['blocked', 'throwing', 'mount', 'boot-blocked', 'nojs']) {
      const context = await browser.newContext({ javaScriptEnabled: mode !== 'nojs', viewport: { width: 390, height: 844 } });
      try {
        const page = await context.newPage();
        if (mode === 'boot-blocked') await page.route('**/login/boot.js', route => route.abort());
        if (mode === 'blocked' || mode === 'boot-blocked') await page.route('**/login/build/app.js', route => route.abort());
        if (mode === 'throwing') await page.route('**/login/build/app.js', route => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("Forced startup failure");' }));
        if (mode === 'mount') await page.addInitScript(() => {
          const append = Node.prototype.appendChild;
          Node.prototype.appendChild = function<T extends Node>(node: T): T {
            const result = append.call(this, node) as T;
            if (this instanceof Element && this.id === 'app') throw new Error('Forced mount failure');
            return result;
          };
        });
        for (const path of ['/', '/auth/popup', '/account', '/example/people', '/missing/']) {
          await page.goto(`${ORIGIN}${path}?lang=${lang}`);
          check(`LOG-9 ${mode} ${path} ${lang}: language`, await page.locator('html').getAttribute('lang') === lang);
          await checkStartupState(page, mode, path, lang, copy[lang]);
          await page.screenshot({ path: resolve(SHOTS, `startup-${mode}-${lang}-${path.replaceAll('/', '') || 'home'}.png`), fullPage: true });
        }
        if (mode === 'blocked') {
          await page.unroute('**/login/build/app.js');
          await page.goto(`${ORIGIN}/?lang=${lang}`);
          await page.locator('#email').waitFor();
          check(`LOG-9 ${lang}: fallback removed after mount`, await page.locator('[data-startup-failure]').count() === 0);
        }
      } finally { await context.close(); }
    }
  }
}

async function startupEffectAndIsolation(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ locale: 'en-US' });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'lang')!;
      let failed = false;
      Object.defineProperty(HTMLElement.prototype, 'lang', {
        get() { return descriptor.get!.call(this); },
        set(value: string) {
          descriptor.set!.call(this, value);
          if (!failed && document.querySelector('#app .login-chrome')) {
            failed = true;
            throw new Error('Forced initial effect failure');
          }
        }
      });
    });
    await page.goto(ORIGIN + '/');
    await page.waitForFunction(() => document.documentElement.dataset.startup === 'failed');
    check('LOG-9 initial effect failure restores French fallback and lang', await page.locator('html').getAttribute('lang') === 'fr'
      && (await page.getByRole('status').innerText()).startsWith('Impossible de charger') && await page.locator('#email').count() === 0);
  } finally { await context.close(); }
  const clean = await browser.newContext();
  try {
    const page = await clean.newPage();
    await page.route('**/login/build/app.js', async route => {
      await page.evaluate(() => {
        document.querySelector('link[href="/login/fonts.css"]')!.dispatchEvent(new Event('error'));
        window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: 'unrelated' }));
      });
      check('LOG-9 unrelated resource/rejection leaves loading intact', await page.locator('html').getAttribute('data-startup') === 'loading');
      await route.continue();
    });
    await page.goto(ORIGIN + '/?lang=en'); await page.locator('#email').waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('login-startup-failed')));
    check('LOG-9 successful mount stops startup listeners', await page.locator('html').getAttribute('data-startup') === 'mounted'
      && await page.locator('[data-startup-failure]').count() === 0);
    await page.route('**/editor/boot.js', route => route.abort());
    await page.goto(ORIGIN + '/example/');
    check('LOG-9 editor receives no startup marker', await page.locator('html').getAttribute('data-startup') === null);
  } finally { await clean.close(); }
}

async function legalInitialFragment(page: Page) {
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(options) {
      if (this.id) document.documentElement.dataset.legalScrollCopies = String(document.querySelectorAll(`[id="${this.id}"]`).length);
      original.call(this, options);
    };
  });
  for (const kind of ['privacy', 'terms'] as const) {
    const id = ({ privacy, terms })[kind].en.sections[1].id;
    for (const lang of ['fr', 'en', 'es']) {
      await page.goto(`${ORIGIN}/legal/${kind}?lang=${lang}#${id}`);
      await page.locator('[data-testid="footer"]').waitFor();
      await page.waitForFunction(id => {
        const top = document.getElementById(id)!.getBoundingClientRect().top;
        return top >= 0 && top < 200;
      }, id);
      check(`LOG-9 ${kind} ${lang}: initial hash scrolls after mount without duplicate ids`,
        await page.locator(`#${id}`).count() === 1 && await page.locator('html').getAttribute('data-legal-scroll-copies') === '1');
    }
  }
}

async function legalWithoutJavaScript(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const [kind, pages] of Object.entries({ privacy, terms })) {
      for (const lang of ['fr', 'en', 'es'] as const) {
        await page.goto(`${ORIGIN}/legal/${kind}?lang=${lang}`);
        const text = pages[lang];
        check(`LOG-8: ${kind} ${lang} has its language without JS`, await page.locator('html').getAttribute('lang') === lang);
        check(`LOG-8: ${kind} ${lang} has full text without JS`, (await page.locator('h1').innerText()) === text.title
          && (await page.locator('.article-body').innerText()).includes(text.sections.at(-1)!.paragraphs![0]));
        check(`LOG-8: ${kind} ${lang} date and back link`, await page.locator('time').getAttribute('datetime') === LEGAL_UPDATED
          && await page.locator(`a[href="/?lang=${lang}"]`).count() === 1);
        await page.screenshot({ path: resolve(SHOTS, `legal-nojs-${kind}-${lang}.png`), fullPage: true });
        for (const section of text.sections) {
          check(`LOG-8: ${kind} ${lang} section ${section.id}`, await page.locator(`#${section.id}`).count() === 1);
        }
        await page.locator('.legal-toc a').last().click();
        check(`LOG-8: ${kind} ${lang} contents jump`, new URL(page.url()).hash === '#' + text.sections.at(-1)!.id);
        await page.locator(`a[href="/?lang=${lang}"]`).click();
        check(`LOG-8: ${kind} ${lang} back to sign-in`, new URL(page.url()).pathname === '/');
      }
    }
  } finally { await context.close(); }
}

async function legalLanguageHash(page: Page) {
  for (const kind of ['privacy', 'terms'] as const) {
    const id = ({ privacy, terms })[kind].en.sections.at(-1)!.id;
    for (const lang of ['fr', 'en', 'es']) {
      await page.goto(`${ORIGIN}/legal/${kind}?lang=${lang}`);
      await page.locator('[data-testid="footer"]').waitFor();
      await page.locator(`.legal-toc a[href="#${id}"]`).click();
      await page.locator(`[data-testid="language-toggle"][href$="#${id}"]`).waitFor();
      const href = await page.locator('[data-testid="language-toggle"]').getAttribute('href');
      check(`LOG-8: ${kind} ${lang} language link keeps fragment`, !!href && new URL(href, ORIGIN).hash === '#' + id);
      await page.locator('[data-testid="language-toggle"]').click();
      await page.locator('[data-testid="footer"]').waitFor();
      check(`LOG-8: ${kind} language reload keeps section`, new URL(page.url()).hash === '#' + id
        && await page.locator(`#${id}`).count() === 1);
    }
  }
}

async function navbarIsWhole(page: Page) {
  await page.evaluate(() => { for (const key of Object.keys(sessionStorage)) sessionStorage.removeItem(key); });
  await page.goto(`${ORIGIN}/?lang=fr`);
  await page.locator('#email').waitFor();
  await page.waitForTimeout(2500);
  await page.mouse.move(640, 500);
  await page.waitForTimeout(800);
  const header = page.locator('[data-slot="site-header"], header').first();
  await header.screenshot({ path: resolve(SHOTS, 'navbar.png') });
  check('the header names the product', (await page.locator('[data-slot="wordmark"]').first().innerText()).replace(/\s/g, '') === 'Login.');
  check('the footer is the shared one', await page.locator('[data-testid="footer"]').count() === 1);
  check('the sign-in page keeps the construction props', await page.locator('.construction-ground').count() === 1);
  for (const path of ['legal/privacy', 'nope/']) {
    await page.goto(`${ORIGIN}/${path}?lang=fr`); await page.locator('[data-testid="footer"]').waitFor();
    check(`no construction props on /${path}`, await page.locator('.construction-ground').count() === 0);
  }
  await page.goto(`${ORIGIN}/legal/privacy?lang=en`); await page.locator('[data-testid="page-legal"]').waitFor();
  check('legal pages follow the yesid.dev reading layout', await page.locator('h1').innerText() === 'Privacy Policy' && (await page.locator('[data-testid="legal-body"] h2').first().getAttribute('id')) === 'who-i-am' && await page.locator('.legal-toc').count() === 1 && (await page.locator('[data-testid="legal-body"]').innerText()).includes('Last updated: ' + legalDate('en')));
  const moved = await fetch(`${ORIGIN}/privacy?lang=fr`, { redirect: 'manual' });
  check('the first legal addresses redirect', moved.status === 301 && moved.headers.get('location') === `${ORIGIN}/legal/privacy?lang=fr`);
  await page.goto(`${ORIGIN}/?lang=fr`); await page.locator('#email').waitFor();
  const middle = await page.evaluate(() => {
    const main = document.querySelector('main')!.getBoundingClientRect(), shell = document.querySelector('.shell')!.getBoundingClientRect();
    const clearance = parseFloat(getComputedStyle(document.querySelector('.shell')!).paddingTop);
    return { gap: Math.abs((main.top + main.bottom) / 2 - (shell.top + clearance + shell.bottom) / 2), fits: main.bottom <= innerHeight };
  });
  check('the sign-in form sits in the middle of the first screen', middle.gap < 2 && middle.fits, JSON.stringify(middle));
  await page.screenshot({ path: resolve(SHOTS, 'home.png') });
  const box = await page.locator('[data-slot="theme-toggle"]').boundingBox();
  check('the theme toggle is a usable size', !!box && box.height >= TAP_MIN && box.width >= TAP_MIN);
}


async function invitationFlow(page: Page) {
  await requestCode(page, '?site=example&lang=en');
  await codeField(page).fill(CODE); await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`${ORIGIN}/example/`);
  await page.goto(`${ORIGIN}/example/people?lang=en`);
  await page.locator('#email').fill('employee@example.test');
  await page.locator('form button[type="submit"]').click();
  check('adding requires a double-check', await page.locator('.confirm-address').innerText() === 'employee@example.test?');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  check('Back sends and stores nothing', (await sql("SELECT count(*) AS remaining FROM user WHERE email='employee@example.test'")).includes('"remaining": 0'));
  await page.locator('form button[type="submit"]').click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('Pending', { exact: true }).waitFor();
  const employee = await (await page.context().browser()!.newContext()).newPage();
  await requestCode(employee, '?site=example&lang=en', 'employee@example.test');
  await codeField(employee).fill(CODE); await employee.locator('form button[type="submit"]').click();
  await employee.waitForURL(`${ORIGIN}/example/`);
  await page.reload(); await page.locator('li').filter({ hasText: 'employee@example.test' }).getByText('Confirmed', { exact: true }).waitFor();
  await page.locator('li').filter({ hasText: 'employee@example.test' }).getByRole('button').click();
  await page.getByRole('group').getByRole('button', { name: 'Remove', exact: true }).click();
  await page.locator('li').filter({ hasText: 'employee@example.test' }).waitFor({ state: 'detached' });
  await employee.context().close();
}
// LOG-4 changes People only; existing journeys retain S-1/S-5 and H-1/H-2 coverage.
async function peopleCorrectness(page: Page) {
  const members = Array.from({ length: 25 }, (_, i) => ({ id: `synthetic-${i}`, email: `person${i}@example.test`, role: 'employee', status: 'active', lastEdit: null }));
  for (const lang of ['fr', 'en', 'es'] as const) {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      let mode = 'unchanged';
      await page.route('**/example/people/members', route => route.request().method() === 'GET'
        ? route.fulfill(['load', 'mail-load'].includes(mode) ? { status: 502, json: {} } : { json: mode === 'single' ? members.slice(0, 1) : members })
        : route.fulfill(mode === 'update' ? { status: 502, json: {} } : { json: { success: true, outcome: mode.startsWith('mail') ? 'added' : 'unchanged', status: mode === 'pending' ? 'pending' : 'active', emailSent: false } }));
      await page.goto(`${ORIGIN}/example/people?lang=${lang}`);
      const first = page.locator('.people-list li').first();
      const remove = first.getByRole('button').last();
      await remove.click();
      const question = first.getByRole('group');
      await question.waitFor();
      check(`LOG-4 row 1 question visible ${lang}/${width}`, await question.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
      check(`LOG-4 focus enters question ${lang}/${width}`, await question.evaluate(el => el === document.activeElement));
      await page.screenshot({ path: resolve(SHOTS, `log-4-${lang}-${width}.png`) });
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      check(`LOG-4 cancel restores focus ${lang}/${width}`, await remove.evaluate(el => el === document.activeElement));
      await remove.click();
      await page.locator('.people-list li').nth(1).getByRole('button').last().click();
      check(`LOG-4 only one question ${lang}/${width}`, await page.locator('.people-list [role="group"]').count() === 1 && await first.getByRole('group').count() === 0);
      await page.locator('.people-list [role="group"]').getByRole('button').last().click();
      if (width === 390) await lastPeopleQuestion(page, lang);
      const submit = async () => {
        await page.locator('#email').fill('person0@example.test');
        await page.locator('form button[type="submit"]').click();
        await page.locator('.people-add [role="group"]').getByRole('button').first().click();
        if (mode === 'update') await page.getByRole('status').filter({ hasText: { en: 'We could not complete', fr: 'Impossible d’effectuer', es: 'No pudimos completar' }[lang] }).waitFor();
        else await page.locator('#email').waitFor();
      };
      await submit();
      const expected = { en: 'This person already has access.', fr: 'Cette personne a déjà accès au site.', es: 'Esta persona ya tiene acceso al sitio.' }[lang];
      await page.getByRole('status').filter({ hasText: expected }).waitFor();
      check(`LOG-4 unchanged result ${lang}/${width}`, await page.getByRole('status').innerText() === expected);
      await remove.click();
      check(`LOG-4 clears old result ${lang}/${width}`, await page.getByRole('status', { includeHidden: true }).textContent() === '');
      await first.getByRole('group').getByRole('button').last().click();
      mode = 'mail'; await submit();
      const link = page.getByRole('status').getByRole('link'); await link.waitFor();
      check(`LOG-4 shareable link ${lang}/${width}`, await link.getAttribute('href') === ORIGIN + '/example/');
      await peopleOutcomeChecks(page, lang, width, value => { mode = value; }, submit);
      mode = 'update'; await submit();
      const updateFailure = await page.getByRole('status').innerText();
      mode = 'single'; await page.reload(); await page.locator('#email').waitFor();
      check(`LOG-4 singular count ${lang}/${width}`, (await page.locator('#people-count').textContent())?.trim() === '1 ' + { en: 'person', fr: 'personne', es: 'persona' }[lang]);
      check(`LOG-4 no edit on record ${lang}/${width}`, await page.locator('.person-meta').innerText() === { en: 'No edit on record', fr: 'Aucune modification enregistrée', es: 'Sin ediciones registradas' }[lang]);
      mode = 'load'; await page.reload(); await page.locator('[data-slot="error-page"]').waitFor();
      check(`LOG-4 separate load/update failures ${lang}/${width}`, !(await page.locator('[data-slot="error-page"]').innerText()).includes(updateFailure));
      await page.unroute('**/example/people/members');
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
async function lastPeopleQuestion(page: Page, lang: 'fr' | 'en' | 'es') {
  const row = page.locator('.people-list li').nth(24);
  const remove = row.getByRole('button').last();
  await remove.click();
  const question = row.getByRole('group'); await question.waitFor();
  check(`LOG-4 row 25 question visible ${lang}/390`, await question.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
  check(`LOG-4 focus enters row 25 question ${lang}/390`, await question.evaluate(el => el === document.activeElement));
  await page.screenshot({ path: resolve(SHOTS, `log-4-row25-${lang}-390.png`) });
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  check(`LOG-4 row 25 cancel restores focus ${lang}/390`, await remove.evaluate(el => el === document.activeElement));
}
async function peopleOutcomeChecks(page: Page, lang: 'fr' | 'en' | 'es', width: number, setMode: (mode: string) => void, submit: () => Promise<void>) {
  setMode('pending'); await submit();
  const pending = { en: 'An invitation is already pending for this address.', fr: 'Une invitation est déjà en attente pour cette adresse.', es: 'Ya hay una invitación pendiente para esta dirección.' }[lang];
  await page.getByRole('status').filter({ hasText: pending }).waitFor();
  check(`LOG-4 unchanged pending invitation ${lang}/${width}`, await page.getByRole('status').innerText() === pending);
  setMode('mail-load'); await submit();
  const status = page.getByRole('status'), link = status.getByRole('link'); await link.waitFor();
  const failure = { en: 'We could not load people with access. Try again.', fr: 'Impossible de charger les personnes ayant accès. Réessayez.', es: 'No pudimos cargar las personas con acceso. Inténtalo de nuevo.' }[lang];
  await status.getByText(failure, { exact: true }).waitFor();
  check(`LOG-4 refresh failure follows editor link ${lang}/${width}`, await link.evaluate((el, message) => el.parentElement?.nextElementSibling?.textContent === message, failure));
  setMode('unchanged'); await submit();
  check(`LOG-4 next action clears refresh failure ${lang}/${width}`, !(await status.innerText()).includes(failure) && await status.getByRole('link').count() === 0);
}
async function accountFlow(page: Page) {
  await page.goto(`${ORIGIN}/account?lang=en`);
  await page.waitForURL(`${ORIGIN}/`);
  check('Account without a site returns to sign-in',true);
  await page.goto(`${ORIGIN}/account?site=example&lang=en`); await page.locator('#email').fill('changed@example.test');
  await page.locator('form button[type="submit"]').click(); await codeField(page).waitFor();
  await setPendingCode(OWNER, CODE, 'email-verification');
  await codeField(page).fill(CODE); await page.locator('form button[type="submit"]').click();
  await page.getByText('If this address can be used', { exact: false }).waitFor();
  await setPendingCode('e2e-owner:changed@example.test', CODE, 'change-email');
  await codeField(page).fill(CODE); await page.locator('form button[type="submit"]').click();
  await page.getByText('All sessions are closed', { exact: false }).waitFor();
  check('email change deletes every session', (await sql('SELECT count(*) AS remaining FROM session WHERE userId=\'e2e-owner\'')).includes('"remaining": 0'));
  await requestCode(page, '?site=example&lang=en', 'changed@example.test');
  await codeField(page).fill(CODE); await page.locator('form button[type="submit"]').click();
  await page.waitForURL(`${ORIGIN}/example/`);
}
async function expiresInBrowser(page: Page) {
  await page.goto(`${ORIGIN}/example/people?lang=en`); await page.locator('#email').fill('expired@example.test');
  await page.locator('form button[type="submit"]').click(); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByText('Pending', { exact: true }).waitFor();
  await sql("UPDATE membership SET invited_at=datetime('now','-8 days') WHERE user_id IN (SELECT id FROM user WHERE email='expired@example.test')");
  const stranger = await (await page.context().browser()!.newContext()).newPage();
  await requestCode(stranger, '?site=example&lang=en', 'expired@example.test');
  await codeField(stranger).fill(CODE); await stranger.locator('form button[type="submit"]').click();
  await stranger.locator('#code-error').filter({ hasText: /That code did not work/i }).waitFor();
  await stranger.context().close();
}

async function themeAtSendTime(page: Page) {
  for (const system of ['light','dark'] as const) {
    await page.emulateMedia({ colorScheme: system, reducedMotion: 'no-preference' });
    await page.goto(ORIGIN); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload(); await page.locator('#email').waitFor();
    await page.route('**/auth/api/email-otp/send-verification-otp', async route => {
      const current = await page.evaluate(() => document.documentElement.dataset.theme);
      check('send header agrees with page theme',route.request().headers()['x-login-theme'] === current);
      await route.fulfill({json:{success:true}});
    });
    check('system theme adopted',await page.locator('html').getAttribute('data-theme') === system);
    await page.locator('#email').fill(OWNER); await page.locator('form button[type="submit"]').click(); await codeField(page).waitFor();
    await page.locator('[data-slot="theme-toggle"]').click();
    await page.locator('.step-actions button').first().click();
    await page.waitForFunction(() => !(document.querySelector('.step-actions button') as HTMLButtonElement)?.disabled);
    check('theme toggle changes actual theme',await page.locator('html').getAttribute('data-theme') !== system);
    await page.unroute('**/auth/api/email-otp/send-verification-otp');
  }
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
}
async function legalNavigation(page: Page) {
  for (const lang of ['fr', 'en', 'es']) {
    await page.goto(`${ORIGIN}/?lang=${lang}`); await page.locator('#email').waitFor();
    check('the sign-in form carries no consent line', await page.locator('.legal-consent').count() === 0);
    for (const path of ['privacy', 'terms']) {
      await page.locator(`[data-testid="footer"] a[href="/legal/${path}?lang=${lang}"]`).click();
      await page.locator('.article-body').waitFor();
      check('signed-out legal page '+path+' '+lang, new URL(page.url()).pathname === '/legal/'+path && await page.locator('html').getAttribute('lang') === lang);
      check('legal pages allow indexing', await page.locator('meta[name="robots"]').count() === 0);
      await page.goto(`${ORIGIN}/?lang=${lang}`); await page.locator('#email').waitFor();
    }
  }
  const response = await page.goto(`${ORIGIN}/nope/`);
  await page.locator('[data-slot="error-page"]').waitFor(); check('branded 404 status',response?.status() === 404);
  const json = await fetch(`${ORIGIN}/nope/`, { headers: { Accept: 'application/json' } });
  check('non-HTML 404 remains JSON',json.status === 404 && (await json.json() as {message:string}).message === 'Not found');
}
const captures: string[] = [];
async function checkContrast(page: Page, name: string) {
  const failures = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgb = (value: string) => { context.clearRect(0,0,1,1); context.fillStyle=value; context.fillRect(0,0,1,1); const c=[...context.getImageData(0,0,1,1).data]; return [c[0],c[1],c[2],c[3]/255]; };
    const luminance = (c: number[]) => c.slice(0,3).map(v => { v/=255; return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4; }).reduce((a,v,i)=>a+v*[0.2126,0.7152,0.0722][i],0);
    return [...document.querySelectorAll('main p,main label,main a,main strong,main span,main button,main input,body>p,body>h1,body>a,td:not(:has(table))')].flatMap(node => {
      const rect=node.getBoundingClientRect(); if(rect.width<2 || rect.height<2 || (!node.textContent?.trim() && node.tagName!=='INPUT')) return [];
      let parent: Element|null=node, background: number[]=[];
      while(parent) { background=rgb(getComputedStyle(parent).backgroundColor); if(background.length===3 || background[3]===1) break; parent=parent.parentElement; }
      if(!parent) return [];
      const fg=luminance(rgb(getComputedStyle(node).color)), bg=luminance(background);
      const ratio=(Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
      return ratio>=4.5?[]:[`${node.tagName}: ${ratio.toFixed(2)}`];
    });
  });
  check('text contrast at least 4.5:1: '+name,failures.length===0,failures.join(', '));
}
async function capture(page: Page, name: string) {
  await log10Motion(page, name, check);
  check('no horizontal scroll: ' + name, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // LOG-1: presentation of S-3/S-4 and A-3/A-4/A-5 fields; their validation and proofs stay unchanged.
  const inputs = await page.locator('main input:visible').evaluateAll(nodes => nodes.map(node => {
    const input = node as HTMLInputElement;
    return { id: input.id, size: parseFloat(getComputedStyle(input).fontSize), name: input.name, autocomplete: input.autocomplete,
      capitalization: input.getAttribute('autocapitalize'), correction: input.getAttribute('autocorrect'), spelling: input.spellcheck };
  }));
  for (const input of inputs) {
    check('input text 16 to 17 px: ' + name + ' ' + input.id, input.size >= 16 && input.size <= 17, String(input.size));
    const purpose = input.id === 'code' ? 'one-time-code' : new URL(page.url()).pathname.endsWith('/people') ? 'off' : 'email';
    check('native field purpose: ' + name + ' ' + input.id, input.name === input.id && input.autocomplete === purpose);
    if (input.id === 'email') check('email editing stays literal: ' + name,
      input.capitalization === 'none' && input.correction === 'off' && !input.spelling);
  }
  await checkContrast(page,name);
  const file = name + '.png'; await page.screenshot({ path: resolve(SHOTS, file), fullPage: true }); captures.push(file);
}
async function visualMatrix(page: Page) {

  await sql("INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('pending','Pending','pending@example.test',1,datetime('now'),datetime('now')); INSERT INTO membership (site_slug,user_id,role,invited_at) VALUES ('example','pending','employee',datetime('now'))");
  for (const lang of ['fr', 'en', 'es']) for (const theme of ['light','dark'] as const) for (const width of [390,1280]) {
    const context = await page.context().browser()!.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, colorScheme: theme });
    const view = await context.newPage(); const prefix = `${lang}-${theme}-${width}`;
    view.on('console', message => { if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) throw Error(message.text()); });
    view.on('request', request => {
      if (request.method() === 'POST' && /send-verification-otp|request-email-change/.test(request.url())) {
        void view.evaluate(() => document.documentElement.dataset.theme).then(current => check('code request theme '+prefix, request.headers()['x-login-theme'] === current));
      }
    });
    await view.goto(`${ORIGIN}/?lang=${lang}`); await view.locator('#email').waitFor();
    const form = await view.locator('form').boundingBox(); check('form reachable without scrolling: '+prefix, !!form && form.y+form.height <= (width === 390 ? 844 : 800));
    await view.keyboard.press('Tab');
    await log10Chrome(view, lang as 'fr' | 'en' | 'es', check);
    await log10Focus(view, view.locator('form button[type=submit]'), prefix+'-email', check);
    await capture(view, prefix+'-signin');
    for (const path of ['legal/privacy', 'legal/terms', 'nope/']) { await view.goto(`${ORIGIN}/${path}?lang=${lang}`); await view.locator('.login-chrome h1').waitFor(); await capture(view,prefix+'-'+path.replace('/','')); }
    await view.goto(`${ORIGIN}/?lang=${lang}`); await view.locator('#email').waitFor();
    await view.locator('#email').fill('pending@example.test'); await view.locator('form button[type="submit"]').click(); await codeField(view).waitFor();
    await log10Focus(view, view.locator('form button[type=submit]'), prefix+'-code', check);
    await capture(view, prefix+'-code');
    const stored = await page.evaluate(() => localStorage.getItem('login.session.example'));
    await view.evaluate(value => { if(value) localStorage.setItem('login.session.example',value); },stored);
    await view.goto(`${ORIGIN}/?site=example&switch=1&lang=${lang}`); await view.locator('.sites').waitFor(); await capture(view,prefix+'-chooser');
    await view.goto(`${ORIGIN}/example/people?lang=${lang}`); await view.locator('#email').waitFor();
    await log10Focus(view, view.locator('form button[type=submit]'), prefix+'-people', check);
    await capture(view,prefix+'-people');
    check('no construction props on People: '+prefix, await view.locator('.construction-ground').count() === 0);
    await view.locator('#email').fill('doublecheck@example.test'); await view.locator('form button[type="submit"]').click();
    await capture(view,prefix+'-doublecheck');
    await peopleStates(view, prefix, lang);
    await view.goto(`${ORIGIN}/account?site=example&lang=${lang}`); await view.locator('#email').waitFor(); await capture(view,prefix+'-account1');
    await view.locator('#email').fill('visual@example.test'); await view.locator('form button[type="submit"]').click(); await codeField(view).waitFor(); await capture(view,prefix+'-account2');
    await setPendingCode('changed@example.test',CODE,'email-verification');
    await view.locator('#code').fill(CODE); await view.locator('form button[type="submit"]').click();
    await view.waitForFunction(() => [...document.querySelectorAll('.label-station')].some(node => node.textContent?.includes('3 / 3')));
    await capture(view,prefix+'-account3');
    await editorStates(view, prefix, lang);
    await context.close();
    await sql('DELETE FROM email_change_budget; DELETE FROM rateLimit');
  }
  writeFileSync(resolve(SHOTS,'index.md'), '# Local polish and legal checks\n\n'+captures.map(file=>`- [${file}](${file})`).join('\n'));
}
async function peopleStates(view: Page, prefix: string, lang: string) {
  const url = `${ORIGIN}/example/people?lang=${lang}`;
  await view.route('**/example/people/members', route => route.fulfill({ json: [] }));
  await view.goto(url); await view.locator('#email').waitFor(); await capture(view,prefix+'-people-empty');
  await view.unroute('**/example/people/members');
  await view.route('**/example/people/members', route => route.fulfill({ status: 403, json: { message: 'Not allowed' } }));
  await view.goto(url); await view.locator('[data-slot="error-page"]').waitFor(); await capture(view,prefix+'-people-refused');
  await view.unroute('**/example/people/members');
  await view.route('**/example/people/members', route => route.fulfill({ status: 502, json: {} }));
  await view.goto(url); await view.locator('[data-slot="error-page"]').waitFor(); await capture(view,prefix+'-people-unavailable');
  await view.unroute('**/example/people/members');
}
async function editorStates(view: Page, prefix: string, lang: string) {
  await view.evaluate(language => localStorage.setItem('login.language',language),lang);
  await view.route('**/editor/sveltia-cms.js', async route => { await new Promise(resolve => setTimeout(resolve,1500)); await route.abort(); });
  await view.goto(`${ORIGIN}/example/`,{waitUntil:'domcontentloaded'});
  await view.locator('#editor-start').waitFor(); await capture(view,prefix+'-editor-loading');
  await view.locator('#editor-start button').waitFor(); await capture(view,prefix+'-editor-error');
  await view.unroute('**/editor/sveltia-cms.js');
}
async function emailSamples(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  for (const lang of ['fr','en','es'] as const) for (const theme of ['light','dark'] as const) for (const width of [390,1280]) {
    const emails = { code: passcodeEmail('482915',lang,theme), welcome: welcomeEmail('Example','example',lang), owner: ownerNoticeEmail('person@example.test','Example','example'), changed: emailChangedEmail(lang) };
    for (const [name, email] of Object.entries(emails)) {
      const file = resolve(SHOTS,`${name}-${lang}-${theme}-${width}.html`); writeFileSync(file,email.html);
      const view = await (await browser.newContext({colorScheme:theme,viewport:{width,height:width===390?844:800}})).newPage();
      await view.goto('file:///'+file.replaceAll('\\','/')); await capture(view,`email-${name}-${lang}-${theme}-${width}`); await view.context().close();
    }
  }
}

/** Served as login.yesid.dev, each page load sends exactly one reduced pageview to the relay and nothing to plausible.io. */
async function analyticsCounting(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  // Chrome treats the rerouted host as another origin, so 'self' would refuse the page's own files; the CSP has its own unit test.
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  const host = `http://login.yesid.dev:${PORT}`;
  const events: { n: string; u: string; d: string }[] = [], direct: string[] = [];
  await page.route('https://plausible.io/**', route => { direct.push(route.request().url()); return route.abort(); });
  await page.route(`${host}/**`, route => route.continue({ url: route.request().url().replace(host, ORIGIN) }));
  await page.route(`${host}/relay/e`, route => { events.push(route.request().postDataJSON()); return route.fulfill({ status: 202, body: '' }); });
  // The tracker stays silent in automated browsers unless told otherwise.
  await page.addInitScript(() => { Reflect.set(window, '__plausible', true); });
  const pageviews = () => events.filter(event => event.n === 'pageview');
  const visits: [string, string][] = [['/?lang=fr', '/'], ['/legal/privacy?lang=en&utm_source=e2e#top', '/legal/privacy?utm_source=e2e'], ['/someone@example.test', '/404']];
  for (const [index, [path, expected]] of visits.entries()) {
    await page.goto(host + path); await page.locator('#app footer, [data-testid="footer"]').first().waitFor();
    for (let wait = 0; wait < 20 && pageviews().length <= index; wait += 1) await page.waitForTimeout(250);
    await page.waitForTimeout(1000);
    check(`one pageview for ${path}`, pageviews().length === index + 1, JSON.stringify(pageviews()));
    check(`the pageview for ${path} is reduced`, pageviews()[index].u === host + expected && pageviews()[index].d === 'login.yesid.dev', pageviews()[index].u);
  }
  check('nothing goes straight to plausible.io', direct.length === 0, direct.join(' '));
  await context.close();
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let browserLaunch: ReturnType<typeof chromium.launch> | undefined;
let closing: Promise<void> | undefined;
const closeResources = () => closing ??= cleanup([
  () => browser ? browser.close() : cleanupStarted(browserLaunch, launched => launched.close()),
  () => worker ? worker.dispose() : cleanupStarted(workerStart, started => started.dispose())
]);
async function stopRun(reason: string, exitCode: number) {
  clearTimeout(watchdog);
  console.error(reason);
  try { await closeResources(); }
  catch (error) { console.error(error); }
  finally { process.exit(exitCode); }
}
const watchdog = setTimeout(() => {
  void stopRun(`E2E stopped after ${RUN_LIMIT_MS / 60_000} minutes. Last check passed: ${lastPassed}`, 1);
}, RUN_LIMIT_MS);
const interrupt = () => { void stopRun('E2E interrupted by SIGINT', 130); };
const terminate = () => { void stopRun('E2E interrupted by SIGTERM', 143); };
process.once('SIGINT', interrupt);
process.once('SIGTERM', terminate);
const forwardedSignal = (message: unknown) => {
  if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'e2e-signal' || !('signal' in message)) return;
  if (message.signal === 'SIGINT') interrupt();
  if (message.signal === 'SIGTERM') terminate();
};
process.on('message', forwardedSignal);
try {
  await timed('prepare', prepare);
  const launched = await (browserLaunch = chromium.launch());
  browser = launched;
  const finishMotionChecks = watchLog10Motion(launched, check);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' })).newPage();
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) problems.push(message.text()); });
  // The design system's view transitions report this harmlessly when a page navigates during one.
  page.on('pageerror', (error) => { if (error.message !== 'Transition was skipped') problems.push(error.message); });
  await timed('log10Preferences', () => log10Preferences(launched, ORIGIN, check));
  await timed('forgivingCodeEntry', () => forgivingCodeEntry(launched));
  await timed('pendingStorageRecovery', () => pendingStorageRecovery(launched));
  await timed('startupRecovery', () => startupRecovery(launched));
  await timed('startupEffectAndIsolation', () => startupEffectAndIsolation(launched));
  await timed('legalInitialFragment', () => legalInitialFragment(page));
  await timed('legalWithoutJavaScript', () => legalWithoutJavaScript(launched));
  await timed('legalLanguageHash', () => legalLanguageHash(page));
  await timed('analyticsCounting', () => analyticsCounting(launched));
  await timed('themeAtSendTime', () => themeAtSendTime(page));
  await timed('legalNavigation', () => legalNavigation(page));
  await timed('accountNavigation', () => accountNavigation(launched, sql, requestCode, CODE, ORIGIN, SHOTS, check));
  await timed('signsInWithARealCode', () => signsInWithARealCode(page));
  await timed('refusesAWrongCode', () => refusesAWrongCode(page));
  await timed('keepsItsPlaceWhenLanguageChanges', () => keepsItsPlaceWhenLanguageChanges(page));
  await timed('navbarIsWhole', () => navbarIsWhole(page));
  await timed('invitationFlow', () => invitationFlow(page));
  await timed('peopleCorrectness', () => peopleCorrectness(page));
  await timed('expiresInBrowser', () => expiresInBrowser(page));
  await timed('accountFlow', () => accountFlow(page));
  await timed('visualMatrix', () => visualMatrix(page));
  await timed('emailSamples', () => emailSamples(launched));

  writeFileSync(resolve(SHOTS,'index.md'), '# Local polish and legal checks\n\n'+captures.map(file=>`- [${file}](${file})`).join('\n'));
  check('no script errors or security policy violations on the sign-in pages', problems.length === 0, problems.slice(0, 3).join(' | ').slice(0, 400));
  finishMotionChecks();
  console.info(`All passed. Screenshots: ${SHOTS}`);
} finally {
  console.info(`timing - total: ${Math.round(performance.now() - started)} ms; commands: ${commandCount}, ${Math.round(commandMs)} ms`);
  try { await closeResources(); }
  finally {
    clearTimeout(watchdog);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
    process.off('message', forwardedSignal);
    if (process.connected) process.disconnect?.();
  }
}
