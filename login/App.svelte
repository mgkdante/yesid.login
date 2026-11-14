<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Card } from '@yesid/ui/card';
  import Chrome from './Chrome.svelte';
  import { readStep, saveStep, clearStep } from './step.ts';
  import { Button } from '@yesid/ui/button';
  import { copy } from './copy.ts';
  import { createController, popupHandover, type State } from './controller.ts';
  import { initialLocale } from './preferences.ts';

  const locale = initialLocale();
  const text = copy[locale];
  // Access the browser properties inside the guarded storage operations too.
  const sessionStore = {
    getItem: (key: string) => window.sessionStorage.getItem(key),
    setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
    removeItem: (key: string) => window.sessionStorage.removeItem(key)
  };
  const localStore = {
    getItem: (key: string) => window.localStorage.getItem(key),
    setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    removeItem: (key: string) => window.localStorage.removeItem(key)
  };
  const pending = readStep(sessionStore);
  let email = $state(pending?.email ?? '');
  let code = $state('');
  let codeAttempt = $state(0);
  let view = $state<State>({ step: 'ask', busy: false, sites: [] });
  let codeInput = $state<HTMLInputElement>();
  const controller = createController({
    fetch: async (...args) => {
      const response = await window.fetch(...args);
      if (response.ok && response.headers.get('set-auth-token')) clearStep(sessionStore);
      return response;
    }, storage: localStore, search: location.search,
    navigate: path => { clearStep(sessionStore); location.assign(path); }, handOver: token => popupHandover(window, token)
  }, location.pathname === '/auth/popup', value => { view = value; if (value.step === 'sites') storageMessage = ''; if (controller?.token || value.message === 'connected' || value.message === 'reopen') clearStep(sessionStore); });
  let expiresAt = pending?.expiresAt ?? 0;
  let expired = $state(!!pending && Date.now() >= pending.expiresAt);
  let storageMessage = $state('');
  let warnedStorage = false;
  let emailInput = $state<HTMLInputElement>();
  let resendButton = $state<HTMLButtonElement>();
  const fieldMessage = $derived(expired ? text.expired : view.message === 'format' || view.message === 'invalid' ? text[view.message] : '');
  const statusMessage = $derived(view.message === 'rate' && view.retryMinutes !== undefined
    ? (view.retryMinutes === 1 ? text.rateOne : text.rateMany).replace('{n}', String(view.retryMinutes))
    : view.message && !['neutral', 'format', 'invalid'].includes(view.message) ? text[view.message] : '');
  async function back() {
    if (view.busy) return;
    clearStep(sessionStore); code = ''; expired = false; expiresAt = 0;
    controller.emit({ step: 'ask', message: undefined });
    await tick(); emailInput?.focus();
  }
  async function requestCode(resending = false) {
    if (view.busy) return;
    const sentEmail = email.trim();
    await controller.send(sentEmail, locale, document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    if (view.message !== 'neutral' || view.sentAt === undefined) {
      await tick();
      if (resending) resendButton?.focus(); else emailInput?.focus();
      return;
    }
    email = sentEmail;
    expiresAt = view.sentAt + 300000; expired = Date.now() >= expiresAt; code = '';
    if (saveStep(sessionStore, sentEmail, view.sentAt)) {
      storageMessage = '';
    } else if (!warnedStorage) {
      storageMessage = text.noRestore; warnedStorage = true;
    }
    if (resending) controller.emit({ message: 'resent' });
    await tick();
    codeInput?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
  async function verify() {
    if (view.busy) return;
    if (expiresAt && Date.now() >= expiresAt) {
      const moveFocus = document.activeElement?.id === 'sign-in';
      expired = true;
      await tick(); if (moveFocus) resendButton?.focus({ preventScroll: true });
      return;
    }
    if (expired) return;
    codeAttempt += 1;
    await controller.verify(email, code);
    await tick();
    if (view.message === 'format' || view.message === 'invalid') {
      codeInput?.focus();
      if (view.message === 'invalid') codeInput?.select();
    }
    if (controller.token || view.message === 'connected' || view.message === 'reopen') clearStep(sessionStore);
  }
  function send(event: SubmitEvent) { event.preventDefault(); void requestCode(); }
  onMount(() => {
    if (pending) controller.emit({ step: 'enter', message: 'neutral' });
    void controller.restore();
    const timer = setInterval(() => {
      if (view.step !== 'enter' || expired || !expiresAt || Date.now() < expiresAt) return;
      const moveFocus = document.activeElement?.id === 'sign-in';
      expired = true;
      if (moveFocus) { void tick().then(() => resendButton?.focus({ preventScroll: true })); }
    }, 250);
    return () => clearInterval(timer);
  });
</script>

<svelte:head><title>{view.step === 'enter' ? text.codeTitle : view.step === 'sites' ? text.choose : text.title} | yesid.dev</title></svelte:head>

<Chrome {locale} center>
  <main id="main" tabindex="-1">
    {#if view.step !== 'sites'}<p class="label-station">{view.step === 'ask' ? text.step1 : text.step2}</p>{/if}
    <h1>{view.step === 'enter' ? text.codeTitle : view.step === 'sites' ? text.choose : text.title}</h1>
    <p class="lead">{view.step === 'enter' ? text.codeLead.replace('{email}', email.trim()) : view.step === 'ask' ? text.lead : ''}</p>
    {#if view.step === 'ask'}
      <Card class="form-card"><form onsubmit={send}>
        <label for="email">{text.email}</label>
        <input id="email" name="email" type="email" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="email" required bind:value={email} bind:this={emailInput} />
        <Button type="submit" size="cta" disabled={view.busy}>{view.busy && view.operation === 'send' ? text.requesting : text.send}</Button>
      </form></Card>
    {:else if view.step === 'enter'}
      <Card class="form-card"><form onsubmit={event => { event.preventDefault(); void verify(); }}>
        <label for="code">{text.code}</label>
        <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" aria-describedby={fieldMessage ? "code-error" : undefined} aria-invalid={fieldMessage ? "true" : undefined} bind:value={code} bind:this={codeInput} />
        {#key codeAttempt}
          {#if fieldMessage}<p id="code-error" role="alert">{fieldMessage}</p>{/if}
        {/key}
        <Button id="sign-in" type="submit" size="cta" disabled={view.busy || expired}>{view.busy && view.operation === 'verify' ? text.checking : text.verify}</Button>
      </form></Card>
      <div class="step-actions"><button disabled={view.busy} bind:this={resendButton} onclick={() => requestCode(true)}>{view.busy && view.operation === 'send' ? text.requesting : text.resend}</button><button disabled={view.busy} onclick={back}>{text.change}</button></div>
    {:else}
      <Card class="form-card"><div class="sites">
        {#each view.sites as site}
          <Button size="cta" variant="outline" onclick={() => controller.open(site.slug)}>{site.label}</Button>
        {/each}
      </div>{#if view.message === "switchNotice"}<p>{text.switchNotice}</p><Button class="wrap-action" size="cta" disabled={view.busy} onclick={() => controller.switchSite()}>{text.switchSite}</Button>{/if}</Card>
    {/if}
    <p class="message" role="status">{view.step === 'sites' && view.message === 'switchNotice' ? '' : statusMessage} {storageMessage}</p>
  </main>
</Chrome>
