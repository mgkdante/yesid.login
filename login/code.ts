/** S-4: remove only agreed separators, never extract digits from prose. */
export function normalizeCode(value: string): string | undefined {
  const code = value.replace(/[ \t\u00a0\u200b\-\u2013]/g, '');
  return /^[0-9]{6}$/.test(code) ? code : undefined;
}
