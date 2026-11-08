import { test, expect } from 'bun:test';

const listed = Bun.spawnSync(['git','ls-files','-z'], {stderr:'pipe'});
const reason = 'Client isolation guard skipped: tracked-file inventory requires .git (source tarball).';
if (listed.exitCode !== 0) console.info(reason);
// Only the operator's own addresses, the email provider's docs and reserved example domains may appear.
const ALLOWED = /@(?:yesid\.dev|resend\.dev|(?:[a-z0-9-]+\.)*example\.[a-z]{2,}|[a-z0-9-]+\.example)$/i;
(listed.exitCode === 0 ? test : test.skip)('tracked text holds no client or personal email address', async () => {
  const violations: string[] = [];
  for (const path of listed.stdout.toString().split('\0').filter(Boolean)) {
    if (path === 'bun.lock') continue;
    const bytes = await Bun.file(path).bytes();
    if (bytes.includes(0)) continue;
    let content: string;
    try { content = new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { continue; }
    for (const [address] of content.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) {
      if (!ALLOWED.test(address)) violations.push(`${path}: ${address.replace(/^[^@]+/, '***')}`);
    }
  }
  expect(violations).toEqual([]);
});
