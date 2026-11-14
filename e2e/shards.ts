/** Keep stateful journeys together and in their original order. Rebalance from printed timings. */
export const SHARDS: readonly (readonly string[])[] = [
  ['sitesHandoff', 'editorLoading'],
  ['forgivingCodeEntry', 'pendingStorageRecovery', 'accountCorrectness', 'accountStorageBlocked', 'accountNavigation'],
  ['startupRecovery', 'startupEffectAndIsolation', 'legalInitialFragment', 'legalWithoutJavaScript',
    'legalLanguageHash', 'analyticsCounting', 'themeAtSendTime', 'legalNavigation', 'signsInWithARealCode', 'refusesAWrongCode',
    'keepsItsPlaceWhenLanguageChanges', 'navbarIsWhole', 'emailSamples'],
  // S-1/S-5, H-1/H-2 and A-5: invitation establishes the session used by People/Account;
  // Account changes the address used by the visual matrix. Do not reorder this chain.
  ['invitationFlow', 'peopleCorrectness', 'expiresInBrowser', 'accountFlow', 'visualMatrix']
];

/** Fail closed when a new scenario has no home, or a scenario would run more than once. */
export function assertShardAssignment(scenarios: readonly string[], shards: readonly (readonly string[])[]): void {
  const remaining = new Set(scenarios);
  if (remaining.size !== scenarios.length) throw new Error('Duplicate scenario registration');
  for (const shard of shards) {
    if (!shard.length) throw new Error('Empty shard');
    for (const name of shard) {
      if (!remaining.delete(name)) throw new Error(`Unknown or duplicate shard assignment: ${name}`);
    }
  }
  if (remaining.size) throw new Error(`Unassigned scenarios: ${[...remaining].join(', ')}`);
}

export function parseShard(value: string, count: number): number {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(value);
  if (!match || Number(match[2]) !== count || Number(match[1]) > count) {
    throw new Error(`Expected --shard N/${count}, with N from 1 to ${count}`);
  }
  return Number(match[1]);
}
