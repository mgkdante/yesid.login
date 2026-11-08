type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'login.pending';
export function clearStep(storage: Store): void {
  try { storage.removeItem(KEY); } catch { /* Storage can be unavailable. */ }
}
export function readStep(storage: Store, now = Date.now()): { email: string; expiresAt: number } | undefined {
  try {
    const value = JSON.parse(storage.getItem(KEY) || 'null');
    if (typeof value?.email === 'string' && value.step === 'enter' && value.expiresAt > now && value.expiresAt <= now + 300000) return { email: value.email, expiresAt: value.expiresAt };
  } catch { /* Fall back to step one. */ }
  clearStep(storage);
}
export function saveStep(storage: Store, email: string, expiresAt: number): boolean {
  try { storage.setItem(KEY, JSON.stringify({ step: 'enter', email, expiresAt })); return true; }
  catch { return false; }
}
