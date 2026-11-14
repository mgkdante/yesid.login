<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Masthead } from '@yesid/ui/layout';
  import { Button } from '@yesid/ui/button';
  import { Card } from '@yesid/ui/card';
  import Chrome from './Chrome.svelte';
  import { copy, accountCopy, throttleMessage } from './copy.ts';
  import { initialLocale } from './preferences.ts';
  import { siteKey, validTarget, retryMinutes } from './controller.ts';
  import { normalizeCode } from './code.ts';
  import { readAccount, saveAccount, clearAccount, type AccountStage } from './step.ts';
  const slug = new URLSearchParams(location.search).get('site') || '';
  const locale = initialLocale(), common = copy[locale];
  const text = accountCopy[locale];
  let email = $state(''), currentEmail = $state(''), code = $state(''), step = $state('ask'), busy = $state(true), message = $state('');
  const steps = { fr: ['Nouvelle adresse', 'Code à l’adresse actuelle', 'Code à la nouvelle adresse'], en: ['New address', 'Code to current address', 'Code to new address'], es: ['Nueva dirección', 'Código a la dirección actual', 'Código a la nueva dirección'] }[locale];
  let token = '', userId = '';
  let restored = $state(false), restoreFailed = $state(false), fieldMessage = $state(''), codeAttempt = $state(0), storageWarning = $state(false);
  let emailInput = $state<HTMLInputElement>(), codeInput = $state<HTMLInputElement>();
  const headers = () => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Login-Language': locale, 'X-Login-Theme': document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' });
  function clearRecord() { try { clearAccount(sessionStorage, slug); } catch { /* Storage itself may be blocked. */ } }
  function signIn() { clearRecord(); location.replace(validTarget(slug) ? '/?site=' + encodeURIComponent(slug) : '/'); }
  function retain(stage: AccountStage, sentAt = Date.now()) {
    try { if (!saveAccount(sessionStorage, slug, userId, stage, email, sentAt)) storageWarning = true; }
    catch { storageWarning = true; }
  }
  function restoreRecord() {
    try {
      const record = readAccount(sessionStorage, slug, userId);
      if (!record) return;
      email = record.newEmail;
      step = record.stage === 'address' || Date.now() >= record.expiresAt ? 'ask' : record.stage === 'current' ? 'current' : 'enter';
      if (record.stage !== 'address' && step === 'ask') message = common.expired;
    } catch { /* Storage is optional. */ }
  }
  onMount(() => { void restore(); });
  function restoreResponse(response: Response): boolean {
    if (response.status === 401 || response.status === 403) { signIn(); return false; }
    if (response.status === 429) { restoreFailed = true; message = text.loadFailed + ' ' + throttleMessage(locale, retryMinutes(response)); return false; }
    if (!response.ok) throw Error();
    return true;
  }
  async function restore() {
    busy = true; restored = false; restoreFailed = false; message = '';
    try {
      if (!validTarget(slug)) { signIn(); return; }
      token = JSON.parse(localStorage.getItem(siteKey(slug)) || 'null')?.token || '';
      if (!token) { signIn(); return; }
      const response = await fetch('/auth/api/get-session', { headers: headers() });
      if (!restoreResponse(response)) return;
      const data = await response.json();
      if (!data || !data.session) { signIn(); return; }
      if (typeof data.user?.email !== 'string' || typeof data.user?.id !== 'string') throw Error();
      currentEmail = data.user.email; userId = data.user.id;
      const access = await fetch('/account', { headers: headers() });
      if (!restoreResponse(access)) return;
      const sites = await fetch('/auth/sites', { headers: headers() });
      if (!restoreResponse(sites)) return;
      const list = await sites.json();
      if (!Array.isArray(list)) throw Error();
      if (!list.some(site => site.slug === slug)) { signIn(); return; }
      restoreRecord(); restored = true;
    } catch { restoreFailed = true; message = text.loadFailed; }
    finally { busy = false; }
  }
  const operationFailure = () => step === 'ask' ? text.sendFailed : step === 'current' ? text.checkFailed : text.changeFailed;
  async function codeError(value: string) {
    busy = false; fieldMessage = value; message = ''; codeAttempt += 1;
    await tick(); codeInput?.focus(); codeInput?.select();
  }
  async function submit() {
    if (busy || !restored) return;
    fieldMessage = ''; message = '';
    const normalized = step === 'ask' ? undefined : normalizeCode(code);
    if (step !== 'ask' && normalized === undefined) { await codeError(common.format); return; }
    busy = true;
    const sentAt = Date.now();
    try {
      const response = await fetch('/auth/api/email-otp/' + (step === 'ask' ? 'send-verification-otp' : step === 'current' ? 'request-email-change' : 'change-email'), {
        method: 'POST', headers: headers(), body: JSON.stringify(step === 'ask' ? { type: 'email-verification' } : { newEmail: email.trim(), otp: normalized })
      });
      if (response.status === 401) { signIn(); return; }
      if (response.status === 429) {
        message = throttleMessage(locale, retryMinutes(response)); return;
      }
      if (response.status === 400 && step !== 'ask') { await codeError(common.invalid); return; }
      if (!response.ok) throw Error();
      const data = await response.json();
      if (data?.success !== true && data?.status !== true) throw Error();
      if (step === 'ask' || step === 'current') {
        email = email.trim(); step = step === 'ask' ? 'current' : 'enter'; code = '';
        retain(step === 'current' ? 'current' : 'new', sentAt);
        message = step === 'current' ? text.sentCurrent : text.sent;
      } else {
        step = 'done'; code = ''; clearRecord();
        try { localStorage.removeItem(siteKey(slug)); } catch { /* All sessions are already closed. */ }
        message = text.done;
      }
    } catch { message = operationFailure(); }
    finally {
      busy = false;
      await tick();
      if (step === 'ask') emailInput?.focus();
      else if (step !== 'done') codeInput?.focus();
    }
  }
</script>
<svelte:head><title>{text.title} | yesid.dev</title></svelte:head>
<Chrome {locale}>
  <main id="main" tabindex="-1">
    <a href="/">{text.back}</a><Masthead kicker="yesid. | login" heading={text.title} lede={text.lead} />
    <p class="label-station">{step === 'ask' ? '1 / 3' : step === 'current' ? '2 / 3' : '3 / 3'} · {steps[step === 'ask' ? 0 : step === 'current' ? 1 : 2]}</p>
    {#if step !== 'done'}
      <Card class="form-card"><form onsubmit={event => { event.preventDefault(); void submit(); }}>
        {#if step === 'ask'}<label for="email">{common.email}</label><input id="email" name="email" type="email" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="email" disabled={busy || !restored} required bind:this={emailInput} bind:value={email} oninput={event => { email = event.currentTarget.value; if (restored) retain('address'); }} />
        {:else}
          <p class="confirm-address">{text.current} {currentEmail}</p>
          <p class="confirm-address">{text.next} {email}</p>
          <label for="code">{common.code}</label>
          <input id="code" name="code" bind:this={codeInput} inputmode="numeric" autocomplete="one-time-code" disabled={busy || !restored} aria-describedby={fieldMessage ? 'code-error' : undefined} aria-invalid={fieldMessage ? 'true' : undefined} bind:value={code} />
          {#key codeAttempt}{#if fieldMessage}<p id="code-error" role="alert">{fieldMessage}</p>{/if}{/key}
        {/if}
        <Button type="submit" size="cta" disabled={busy || !restored}>{step === 'ask' ? common.send : text.save}</Button>
      </form></Card>
    {/if}
    {#if restoreFailed}<Button onclick={() => void restore()} disabled={busy}>{text.retry}</Button>{/if}
    {#if storageWarning}<p role="status">{text.storage}</p>{/if}
    <p role="status" class="message state-panel">{message}</p>
  </main>
</Chrome>
