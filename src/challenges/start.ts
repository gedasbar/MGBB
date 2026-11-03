/**
 * Chunk 29b: what the challenge bar's START (and the F key) does, as a pure decision. `block` is why the build may not fly the started challenge
 * (null = it may). 'none' = no challenge is on (nothing happens); 'blocked' = say why; 'fly' = start the challenge's tier.
 */
export type ChallengeStart = { kind: 'none' } | { kind: 'blocked'; why: string } | { kind: 'fly' };

export function challengeStart(active: boolean, block: string | null): ChallengeStart {
  if (!active) return { kind: 'none' };
  return block ? { kind: 'blocked', why: block } : { kind: 'fly' };
}
