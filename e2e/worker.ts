// Test-only entry selected explicitly by the local browser runner. Never deployed.
import worker from '../src/index.ts';
globalThis.fetch = (async (input: RequestInfo | URL) => {
  if (String(input) === 'https://api.resend.com/emails') return Response.json({});
  throw new Error('Outbound network disabled in browser E2E');
}) as typeof fetch;
export default worker;
