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
  const pending = readStep(sessionStorage);
  let email = $state(pending?.email ?? '');
  let code = $state('');
  let view = $state<State>({ step: 'ask', busy: false, sites: [] });
  let codeInput = $state<HTMLInputElement>();
  const controller = createController({
    fetch: async (...args) => {
      const response = await window.fetch(...args);
      if (response.ok && response.headers.get('set-auth-token')) clearStep(sessionStorage);
      return response;
    }, storage: localStorage, search: location.search,
    navigate: path => { clearStep(sessionStorage); location.assign(path); }, handOver: token => popupHandover(window, token)
  }, location.pathname === '/auth/popup', value => { view = value; if (controller?.token || value.message === 'connected' || value.message === 'reopen') clearStep(sessionStorage); });
  let expiresAt = pending?.expiresAt ?? 0;
  let storageMessage = $state('');
  function back() { clearStep(sessionStorage); code = ''; controller.emit({ step: 'ask', message: undefined }); }
  async function requestCode() {
    await controller.send(email, locale, document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    if (view.step === 'enter' && view.message === 'neutral') {
      expiresAt = Date.now() + 300000;
      storageMessage = saveStep(sessionStorage, email, expiresAt) ? '' : text.noRestore;
    }
  }
  async function resend() { await requestCode(); if (view.message === 'neutral') controller.emit({ message: 'resent' }); }
  async function verify() {
    await controller.verify(email, code);
    if (controller.token || view.message === 'connected' || view.message === 'reopen') clearStep(sessionStorage);
  }
  async function send(event: SubmitEvent) {
    event.preventDefault();
    await requestCode();
    await tick();
    if (view.step === 'enter') codeInput?.focus();
  }
  onMount(() => {
    if (pending) controller.emit({ step: 'enter' });
    void controller.restore();
    const timer = setInterval(() => { if (view.step === 'enter' && expiresAt && Date.now() >= expiresAt) { back(); controller.emit({ message: 'invalid' }); } }, 1000);
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
        <input id="email" type="email" autocomplete="email" required bind:value={email} />
        <Button type="submit" size="cta" disabled={view.busy}>{text.send}</Button>
      </form></Card>
    {:else if view.step === 'enter'}
      <Card class="form-card"><form onsubmit={event => { event.preventDefault(); void verify(); }}>
        <label for="code">{text.code}</label>
        <input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]&#123;6&#125;" required maxlength="6" bind:value={code} bind:this={codeInput} />
        <Button type="submit" size="cta" disabled={view.busy}>{text.verify}</Button>
      </form></Card>
      <div class="step-actions"><button disabled={view.busy} onclick={resend}>{text.resend}</button><button disabled={view.busy} onclick={back}>{text.change}</button></div>
    {:else}
      <Card class="form-card"><div class="sites">
        {#each view.sites as site}
          <Button size="cta" variant="outline" onclick={() => controller.open(site.slug)}>{site.label}</Button>
        {/each}
      </div>{#if view.message === "switchNotice"}<Button size="cta" disabled={view.busy} onclick={() => controller.switchSite()}>{text.switchSite}</Button>{/if}</Card>
    {/if}
    <p class="message" role="status">{view.message && view.message !== 'neutral' ? text[view.message] : ''} {storageMessage}</p>
  </main>
</Chrome>
