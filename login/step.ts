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
      && validDeadline(value, now)) {
      return { email: value.email, sentAt: value.sentAt, expiresAt: value.expiresAt };
    }
  } catch { /* Unreadable storage restores Email. */ }
  clearStep(storage);
}
export function saveStep(storage: Store, email: string, sentAt: number): boolean {
  try { storage.setItem(KEY, JSON.stringify({ step: 'enter', email, sentAt, expiresAt: sentAt + 300000 })); return true; }
  catch { clearStep(storage); return false; }
}

function validDeadline(value: { sentAt?: unknown; expiresAt?: unknown }, now: number): boolean {
  return typeof value.sentAt === 'number' && Number.isFinite(value.sentAt) && value.sentAt <= now
    && typeof value.expiresAt === 'number' && value.expiresAt === value.sentAt + 300000
    && value.expiresAt <= now + 300000 && now <= value.expiresAt + 1800000;
}
export type AccountStage = 'address' | 'current' | 'new';
export type AccountStep = { userId: string; stage: AccountStage; newEmail: string; sentAt: number; expiresAt: number };
const accountKey = (slug: string) => 'login.account.' + slug;
export function clearAccount(storage: Store, slug: string): void {
  try { storage.removeItem(accountKey(slug)); } catch { /* Server outcome still stands. */ }
}
export function readAccount(storage: Store, slug: string, userId: string, now = Date.now()): AccountStep | undefined {
  try {
    const value = JSON.parse(storage.getItem(accountKey(slug)) || 'null');
    if (value && typeof value.userId === 'string' && value.userId === userId
      && ['address', 'current', 'new'].includes(value.stage) && typeof value.newEmail === 'string'
      && validDeadline(value, now)) {
      return { userId, stage: value.stage, newEmail: value.newEmail, sentAt: value.sentAt, expiresAt: value.expiresAt };
    }
  } catch { /* Unreadable storage restores the address stage. */ }
  clearAccount(storage, slug);
}
export function saveAccount(storage: Store, slug: string, userId: string, stage: AccountStage, newEmail: string, sentAt: number): boolean {
  try {
    storage.setItem(accountKey(slug), JSON.stringify({ userId, stage, newEmail, sentAt, expiresAt: sentAt + 300000 }));
    return true;
  } catch { clearAccount(storage, slug); return false; }
}
