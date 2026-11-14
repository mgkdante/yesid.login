// Catch only this app's module graph, including failures before main.ts can execute.
import('/login/build/app.js').catch(() => {
  window.dispatchEvent(new Event('login-startup-failed'));
});
