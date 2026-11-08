import assert from 'node:assert/strict';
import { test, expect } from 'bun:test';
import tokens from '@yesid/tokens/tokens.json';
import { passcodeEmail, emailLanguage, welcomeEmail } from '../src/email.ts';

const email = passcodeEmail('482915');

test('the code appears in the subject, the HTML and the plain text', () => {
  assert.match(email.subject, /482915/);
  assert.match(email.html, /482915/);
  assert.match(email.text, /482915/);
});

test('the plain text version says the same thing, with no markup', () => {
  assert.match(email.text, /5 minutes/);
  assert.match(email.text, /ignorez/i);
  assert.doesNotMatch(email.text, /</);
});

test('the colours come from the design tokens, not copied values', () => {
  const { dark, brand } = tokens.color as unknown as Record<string, Record<string, { $value?: string; value?: string }>>;
  const value = (token: { $value?: string; value?: string }) => (token.$value ?? token.value) as string;
  for (const colour of [value(dark.background), value(dark.foreground), value(dark.card), value(brand.accent)]) {
    assert.ok(email.html.toLowerCase().includes(colour.toLowerCase()), colour);
  }
});

test('the email loads nothing from outside, and needs no stylesheet', () => {
  assert.doesNotMatch(email.html, /<img|<link|<script|url\(|https?:\/\//i);
  assert.doesNotMatch(email.html, /<style/i);
});

test('it declares its language and dark colours for mail apps', () => {
  assert.match(email.html, /<html lang="fr"/);
  assert.match(email.html, /name="color-scheme" content="dark"/);
});

test('only a six-digit code can enter the email', () => {
  for (const code of ['', '12345', '1234567', '<b>12</b>', '12345a']) {
    assert.throws(() => passcodeEmail(code), /six digits/, code);
  }
});

test('all email languages retain expiry, code and image-free layout', () => {
  for (const language of ['fr', 'en', 'es'] as const) {
    const message = passcodeEmail('482915', language);
    assert.match(message.html, new RegExp(`<html lang="${language}"`));
    assert.match(message.text, /482915/);
    assert.match(message.text, /5 minut/);
    assert.doesNotMatch(message.html, /<img|<link|<script|url\(|https?:\/\//i);
  }
  for (const value of ['FR', 'es-CO', '<script>', '', null]) assert.equal(emailLanguage(value), 'fr');
});

test('each language punctuates its subject its own way', () => {
  assert.equal(passcodeEmail('123456', 'fr').subject, 'Votre code de connexion : 123456');
  assert.equal(passcodeEmail('123456', 'en').subject, 'Your sign-in code: 123456');
  assert.equal(passcodeEmail('123456', 'es').subject, 'Tu código de inicio de sesión: 123456');
});

test('welcome escapes labels and contains only an editor link, no images or codes', async () => {
  for (const language of ['fr', 'en', 'es'] as const) {
    const email = welcomeEmail('<img src=x onerror="bad()">', 'a', language);
    expect(email.html).not.toContain('<img'); expect(email.html).toContain('&lt;img');
    expect(email.text).toContain('https://login.yesid.dev/a/');
  }
});

test('the welcome subject names the site in each language', () => {
  assert.equal(welcomeEmail('Example', 'example', 'fr').subject, 'Accès à l’éditeur de Example');
  assert.equal(welcomeEmail('Example', 'example', 'en').subject, 'Access to the editor for Example');
  assert.equal(welcomeEmail('Example', 'example', 'es').subject, 'Acceso al editor de Example');
});


test('theme is allowlisted and changes only colours in code email', async () => {
  const { emailTheme } = await import('../src/email.ts');
  expect(emailTheme('light')).toBe('light'); expect(emailTheme('dark')).toBe('dark');
  for (const value of [null, 'LIGHT', '<style>']) expect(emailTheme(value)).toBe('dark');
  const light = passcodeEmail('123456','en','light'), dark = passcodeEmail('123456','en','dark');
  expect(light.subject).toBe(dark.subject); expect(light.text).toBe(dark.text);
  expect(light.html).toContain('content="light"'); expect(light.html).not.toBe(dark.html);
});
test('unsolicited notices follow reader theme and escape all supplied content', async () => {
  const { ownerNoticeEmail, emailChangedEmail } = await import('../src/email.ts');
  for (const message of [welcomeEmail('<evil>','a','fr'),ownerNoticeEmail('<evil>','<site>','a'),emailChangedEmail('en')]) {
    expect(message.html).toContain('prefers-color-scheme:dark');
    expect(message.html).not.toContain('<evil>'); expect(message.html).not.toContain('<site>');
  }
});
