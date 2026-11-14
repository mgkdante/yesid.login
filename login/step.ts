type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'login.pending';
export type PendingStep = { email: string; sentAt: number; expiresAt: number };
export function clearStep(storage: Store): void {
  try { storage.removeItem(KEY); } catch { /* The current page treats the record as void. */ }
}
export function readStep(storage: Store, now = Date.now()): PendingStep | undefined {
  try {
    const value = JSON.parse(storage.getItem(KEY) || 'null');
    if (typeof value?.email === 'string' && value.step === 'enter'
      && typeof value.sentAt === 'number' && Number.isFinite(value.sentAt) && value.sentAt <= now
      && typeof value.expiresAt === 'number' && value.expiresAt === value.sentAt + 300000
      && value.expiresAt <= now + 300000 && now <= value.expiresAt + 1800000) {
      return { email: value.email, sentAt: value.sentAt, expiresAt: value.expiresAt };
    }
  } catch { /* Unreadable storage restores Email. */ }
  clearStep(storage);
}
export function saveStep(storage: Store, email: string, sentAt: number): boolean {
  try { storage.setItem(KEY, JSON.stringify({ step: 'enter', email, sentAt, expiresAt: sentAt + 300000 })); return true; }
  catch { return false; }
}
