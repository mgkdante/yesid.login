/** Every code request and code check takes at least this long, so its duration cannot reveal whether the address has an account. */
export const CODE_FLOOR_MS = 1000;
const CODES_PER_HOUR = 5;
const CODES_PER_DAY = 10;

/** Returns the value once at least the floor has passed since `started`. Waiting costs no CPU time in a Worker. */
export async function atLeast<T>(started: number, value: T, floor = CODE_FLOOR_MS): Promise<T> {
  const wait = floor - (Date.now() - started);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  return value;
}

/** A keyed hash of the address: the budget can count requests without storing the address. */
async function budgetKey(secret: string, email: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('code-budget:' + email.trim().toLowerCase()));
  return [...new Uint8Array(mac)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Claims one code request for this address, whoever asks and whether or not it has an account, so rotating
 * IP addresses can neither flood one inbox nor keep replacing someone's code. The claim is one atomic statement,
 * so simultaneous requests cannot all see an empty budget. Undefined means the budget is spent; otherwise the
 * caller releases the claim when the library refuses the request, so refusals cost nothing.
 */
export async function claimCode(db: D1Database, secret: string, email: string): Promise<{ release(): Promise<void> } | undefined> {
  const key = await budgetKey(secret, email);
  const claimed = await db.prepare(`INSERT INTO code_budget (key, started_at) SELECT ?1, unixepoch()
    WHERE (SELECT count(*) FROM code_budget WHERE key = ?1 AND started_at > unixepoch() - 3600) < ?2
      AND (SELECT count(*) FROM code_budget WHERE key = ?1 AND started_at > unixepoch() - 86400) < ?3
    RETURNING rowid`).bind(key, CODES_PER_HOUR, CODES_PER_DAY).first<{ rowid: number }>();
  if (!claimed) return undefined;
  return { release: async () => { await db.prepare('DELETE FROM code_budget WHERE rowid = ?').bind(claimed.rowid).run(); } };
}
