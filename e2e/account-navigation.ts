import { resolve } from 'node:path';
import type { Browser, Page } from 'playwright-core';

type Check = (name: string, passed: boolean, detail?: string) => void;
type Sql = (command: string) => Promise<string>;
type RequestCode = (page: Page, query: string, email: string) => Promise<void>;

// LOG-16 / Account access and A-1: real site-bound sessions, with no role bypass.
export async function accountNavigation(browser: Browser, sql: Sql, requestCode: RequestCode, code: string, origin: string, shots: string, check: Check) {
  const now = new Date().toISOString();
  for (const role of ['employee', 'it', 'owner']) {
    const email = `e2e-account-${role}@example.test`;
    await sql(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES ('account-${role}','Account fixture','${email}',1,'${now}','${now}');
INSERT INTO membership(site_slug,user_id,role) VALUES ('example','account-${role}','${role}');`);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await requestCode(page, '?site=example&lang=en', email);
      await page.locator('#code').fill(code);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(origin + '/example/');
      for (const [lang, label] of [['en', 'My account'], ['fr', 'Mon compte'], ['es', 'Mi cuenta']]) {
        await page.evaluate(value => localStorage.setItem('login.language', value), lang!);
        await page.goto(origin + '/example/');
        const link = page.getByRole('link', { name: label, exact: true });
        await link.waitFor({ timeout: 15000 });
        await page.locator('#editor-start').waitFor({ state: 'detached' });
        check(`${role}/${lang}: Account link carries site and language`, await link.getAttribute('href') === `/account?site=example&lang=${lang}`);
        await accountLinkLayout(page, label!, `${role}-${lang}`, shots, check);
        // Sveltia opens links outside its editor path in a new tab on mousedown.
        const [account] = await Promise.all([page.waitForEvent('popup'), link.click()]);
        try {
          await account.locator('#email').waitFor();
          await account.locator('form button[type="submit"]:enabled').waitFor();
          check(`${role}/${lang}: editor opens Account (A-1)`, account.url() === `${origin}/account?site=example&lang=${lang}` && await account.locator('html').getAttribute('lang') === lang);
        } finally { await account.close(); }
      }
    } finally { await context.close(); }
    await sql(`DELETE FROM membership WHERE user_id='account-${role}'; DELETE FROM user WHERE id='account-${role}';`);
  }
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(origin + '/example/');
    await page.waitForURL(origin + '/?site=example');
    check('signed-out visitor has no My account link', await page.getByRole('link', { name: /My account|Mon compte|Mi cuenta/ }).count() === 0);
  } finally { await context.close(); }
}

async function accountLinkLayout(page: Page, label: string, prefix: string, shots: string, check: Check) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const link = page.getByRole('link', { name: label, exact: true });
    const clear = await link.evaluate(account => {
      const a = account.getBoundingClientRect();
      return { box: a.toJSON(), clear: a.width >= 44 && a.height >= 44 && a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= innerHeight &&
        [...document.querySelectorAll('a.login-people, a.login-switch')].every(other => {
          const b = other.getBoundingClientRect();
          return a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right;
        }) };
    });
    check(`${prefix}/${width}: Account is visible, tappable and clear of other links`, clear.clear, JSON.stringify(clear));
    await page.screenshot({ path: resolve(shots, `account-link-${prefix}-${width}.png`) });
    for (const hash of ['#/collections/pages/entries/area', '#/collections/pages/new', '#/collections/pages/entries/area/']) {
      await page.evaluate(value => { location.hash = value; }, hash);
      await link.waitFor({ state: 'hidden' });
      check(`${prefix}/${width}: Account stays off ${hash}`, !await link.isVisible());
    }
    await page.evaluate(() => { location.hash = '#/collections/pages'; });
    await link.waitFor();
  }
}
