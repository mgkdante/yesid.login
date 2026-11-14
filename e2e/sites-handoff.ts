import type { Browser, Page } from 'playwright-core';
import { copy } from '../login/copy.ts';

// LOG-6 / S-13 to S-17, H-1 to H-7: synthetic browser boundaries, real app and opener windows.
export async function sitesHandoff(browser: Browser, origin: string, check: (name: string, passed: boolean) => void) {
  for (const lang of ['fr', 'en', 'es'] as const) {
    const text = copy[lang];
    const context = await browser.newContext();
    const page = await context.newPage();
    let sites: unknown = [], siteStatus = 200, bindStatus = 200;
    await context.route('**/auth/api/email-otp/send-verification-otp', r => r.fulfill({ json: {} }));
    await context.route('**/auth/api/sign-in/email-otp', r => r.fulfill({ json: {}, headers: { 'set-auth-token': 'synthetic-handoff-token' } }));
    await context.route('**/example/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Opened editor destination</title><p>Editor destination</p>' }));
    await context.route('**/auth/api/get-session', r => r.fulfill({ json: { session: {} } }));
    await context.route('**/auth/api/sign-out', r => r.fulfill({ json: {} }));
    await context.route('**/auth/sites', r => r.fulfill({ status: siteStatus, json: sites }));
    await context.route('**/auth/bind', r => r.fulfill({ status: bindStatus, json: {} }));
    async function signIn(view: Page, path = '/') {
      await view.goto(origin + path + (path.includes('?') ? '&' : '?') + 'lang=' + lang);
      await view.locator('#email').fill('e2e-owner@example.test');
      await view.locator('form button').click();
      await view.locator('#code').fill('123456');
      await view.locator('form button').click();
    }
    await signIn(page);
    await page.getByRole('heading', { name: text.empty, exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
    check(`S-16 ${lang} empty replaces card and chooser`, await page.locator('.form-card').count() === 0 && await page.getByRole('button', { name: text.signOut, exact: true }).count() === 1);
    siteStatus = 503; await signIn(page);
    await page.getByRole('button', { name: text.retry, exact: true }).waitFor();
    sites = [{ slug: 'example', label: 'Example' }, { slug: 'choice', label: 'Choice' }]; siteStatus = 200;
    await page.getByRole('button', { name: text.retry, exact: true }).click();
    await page.getByRole('button', { name: text.openEditor, exact: true }).first().waitFor();
    check(`S-13 S-15 ${lang} retry lists sites with one heading`, await page.getByRole('heading', { level: 1 }).count() === 1);
    bindStatus = 403; await page.getByRole('button', { name: text.openEditor, exact: true }).first().click();
    await page.getByRole('button', { name: text.retry, exact: true }).waitFor();
    check(`H-1 ${lang} failure belongs to selected row`, await page.getByText(text.openFailure, { exact: true }).count() === 1 && await page.getByRole('button', { name: text.openEditor, exact: true }).count() === 1);
    siteStatus = 401; await signIn(page); await page.locator('#email').waitFor();
    check(`S-13 ${lang} expired sign-in explains return`, await page.getByText(text.sessionEnded, { exact: true }).count() === 1);
    siteStatus = 200; bindStatus = 200; sites = [{ slug: 'example', label: 'Example' }];
    await signIn(page, '/?site=example&switch=1');
    await page.getByRole('button', { name: text.keepEditing, exact: true }).waitFor();
    check(`S-17 ${lang} one site asks before opening`, page.url().includes('switch=1'));
    await page.getByRole('button', { name: text.keepEditing, exact: true }).click();
    await page.waitForURL(origin + '/example/');
    check(`S-14 S-17 H-1 ${lang} Keep editing opens the requested site`, true);
    await page.goto(origin + '/?site=example&switch=1&lang=' + lang);
    await page.getByRole('button', { name: text.switchSite, exact: true }).click();
    await page.locator('#email').waitFor();
    check(`S-17 ${lang} signed-out screen drops switch explanation`, await page.getByText(text.switchNotice, { exact: true }).count() === 0);
    // A real same-origin page plays the editor's side of the OAuth protocol.
    await context.route('**/handoff-test', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Editor handshake fixture</title><button>Open sign-in</button>' }));
    for (const mode of ['reply', 'twice', 'late', 'retry', 'abandon', 'null', 'close'] as const) {
      await page.goto(origin + '/handoff-test');
      await page.evaluate(() => {
        Object.assign(window, { received: [] });
        window.addEventListener('message', event => { if (event.origin === location.origin) Reflect.get(window, 'received').push(event.data); });
        document.querySelector('button')!.onclick = () => { window.open('/auth/popup', 'handoff'); };
      });
      let popup: Page;
      if (mode === 'null') popup = await context.newPage();
      else { const opened = context.waitForEvent('page'); await page.getByRole('button').click(); popup = await opened; }
      await signIn(popup, '/auth/popup');
      await popup.getByRole('heading', { name: text.openingEditor, exact: true }).waitFor();
      check(`H-4 ${lang} ${mode} replaces code form`, await popup.locator('form').count() === 0);
      if (mode === 'null') {
        await popup.getByText(text.reopen, { exact: true }).waitFor();
        await popup.getByRole('link', { name: text.title, exact: true }).click(); await popup.locator('#email').waitFor();
      } else {
        await page.waitForFunction(() => Reflect.get(window, 'received').includes('authorizing:github'));
        check(`H-5 ${lang} ${mode} no token before acknowledgement`, (await page.evaluate(() => Reflect.get(window, 'received'))).length === 1);
        if (mode === 'close') { await page.close(); await popup.getByText(text.reopen, { exact: true }).waitFor({ timeout: 15000 }); }
        else if (mode === 'abandon') { await popup.goto(origin + '/?lang=' + lang); await popup.locator('#email').waitFor(); }
        else {
          if (mode === 'late' || mode === 'retry') {
            await popup.getByText(text.handoverFailed, { exact: true }).waitFor({ timeout: 15000 });
            if (mode === 'retry') { await popup.getByRole('button', { name: text.retry, exact: true }).click(); await page.waitForFunction(() => Reflect.get(window, 'received').length === 2); }
          }
          await page.evaluate(() => {
            const target = window.open('', 'handoff')!;
            target.postMessage('authorizing:github', location.origin);
            target.postMessage('authorizing:github', location.origin);
          });
          await popup.getByRole('status').filter({ hasText: text.connected }).waitFor();
          await page.waitForFunction(() => Reflect.get(window, 'received').some((v: string) => v.startsWith('authorization:github:success:')));
          const messages: string[] = await page.evaluate(() => Reflect.get(window, 'received'));
          check(`H-5 H-6 ${lang} ${mode} token posted exactly once`, messages.filter(v => v === 'authorization:github:success:{"token":"synthetic-handoff-token"}').length === 1);
        }
      }
      await popup.close();
      if (page.isClosed()) break;
    }
    await context.close();
  }
}

export async function editorLoading(browser: Browser, origin: string, check: (name: string, passed: boolean) => void) {
  for (const lang of ['fr', 'en', 'es']) for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.addInitScript(lang => { localStorage.setItem('login.language', lang); localStorage.setItem('login.session.example', JSON.stringify({ token: 'synthetic' })); }, lang);
    const page = await context.newPage();
    await page.route('**/auth/api/get-session', r => r.fulfill({ json: { session: {} } }));
    await page.route('**/auth/sites', r => r.fulfill({ json: [{ slug: 'example', label: 'Example', role: 'employee' }] }));
    await page.route('**/editor/sveltia-cms.js', async r => { await page.getByRole('heading', { name: /Example/ }).waitFor(); await r.abort(); });
    await page.goto(origin + '/example/');
    await page.getByRole('button').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const font = await page.locator('#editor-start h1').evaluate(el => ({ family: getComputedStyle(el).fontFamily, loaded: [...document.fonts].some(f => f.family.includes('Inter Variable') && f.status === 'loaded') }));
    check(`H-3 ${lang} ${width} Inter Variable loaded`, font.family.includes('Inter Variable') && font.loaded);
    const status = await page.getByRole('status').textContent();
    check(`H-3 ${lang} ${width} live region says a sentence`, !!status && status.length > 20 && !['!', '…'].includes(status.trim()));
    check(`H-3 ${lang} ${width} failure offers retry and help`, await page.locator('#editor-start a[href="https://yesid.dev/contact"]').count() === 1);
    await context.close();
  }
}
