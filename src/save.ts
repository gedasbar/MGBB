export interface SaveData {
  version: number;
  currency: number;
  hexTokens: number;
  coreShards: number;
  maxTier: number;
  ownedBlocks: Record<string, number>;
  ownedHulls: string[];
  activeHull: string;
  ownedCaptains: Record<string, number>;
  activeCaptain: string | null;
  skillNodes: string[];
  quests: Record<string, number>;
}

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  currency: 0,
  hexTokens: 0,
  coreShards: 0,
  maxTier: 1,
  ownedBlocks: {},
  ownedHulls: ['basic_hull'],
  activeHull: 'basic_hull',
  ownedCaptains: {},
  activeCaptain: null,
  skillNodes: [],
  quests: {}
};

export function migrateSave(data: any): SaveData {
  if (!data || typeof data !== 'object') return JSON.parse(JSON.stringify(DEFAULT_SAVE));
  
  let migrated = { ...data };
  
  // Future migrations
  // if (migrated.version < 2) { ... migrated.version = 2; }

  // Fallbacks for corrupted/missing keys
  for (const key of Object.keys(DEFAULT_SAVE)) {
    if (migrated[key] === undefined) {
      migrated[key] = (DEFAULT_SAVE as any)[key];
    }
  }
  
  migrated.version = DEFAULT_SAVE.version;
  return migrated as SaveData;
}

export function loadSave(jsonStr: string | null): SaveData {
  if (!jsonStr) return JSON.parse(JSON.stringify(DEFAULT_SAVE));
  try {
    const data = JSON.parse(jsonStr);
    return migrateSave(data);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_SAVE)); // Corrupted JSON fallback
  }
}

export function exportSave(data: SaveData): string {
  return JSON.stringify(data);
}
