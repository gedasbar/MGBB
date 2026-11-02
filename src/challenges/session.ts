// Chunk 28a: the challenge the player has started, if any. One value for the whole session: the builder reads it (rule banner, FLY blocked
// by a broken rule, FLY flies the challenge's tier) and the Map clears it when a normal tier is started.

import { CHALLENGE_BY_ID, ChallengeDef } from '../data/challenges';

let active: string | null = null;

export const activeChallenge = (): ChallengeDef | null => (active ? CHALLENGE_BY_ID[active] ?? null : null);
export const startChallengeSession = (id: string) => { active = id in CHALLENGE_BY_ID ? id : null; };
export const endChallengeSession = () => { active = null; };
