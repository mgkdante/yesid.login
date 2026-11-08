import { test, expect } from 'bun:test';
import { EDITOR_HEADERS } from '../src/pages.ts';

test('the editor may reach only its own origin, GitHub status and Gemini for translation', () => {
  const connect = EDITOR_HEADERS['Content-Security-Policy'].split('; ').find(part => part.startsWith('connect-src '));
  expect(connect).toBe("connect-src 'self' blob: data: https://www.githubstatus.com https://generativelanguage.googleapis.com");
});
