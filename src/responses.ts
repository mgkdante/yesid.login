import { PAGE_HEADERS } from './pages.ts';
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...PAGE_HEADERS, 'Content-Type': 'application/json' }
});
export const denied = (message: string, status = 403) => json({ message }, status);
/** Better Auth reports success even when the database kept the session, so success has to be checked. */
export const confirmSignOut = (response: Response, stillSignedIn: boolean): Response =>
  response.ok && stillSignedIn ? denied('Session still active', 502) : response;
/** Every failed code attempt reads the same, or the attempt counter would reveal which addresses have accounts. */
export const sameCodeFailure = (response: Response): Response => {
  if (response.ok || response.status === 429) return response;
  if (response.status >= 500) console.error('Code sign-in failed', response.status);
  return denied('Invalid or expired code', 400);
};
export const page = (body: string, type = 'text/html; charset=utf-8', headers = PAGE_HEADERS) =>
  new Response(body, { headers: { ...headers, 'Content-Type': type } });
