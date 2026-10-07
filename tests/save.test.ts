import { describe, it, expect } from 'vitest';
import { loadSave, exportSave, migrateSave, DEFAULT_SAVE } from '../src/save';

describe('Save System', () => {
  it('Save round-trips correctly.', () => {
    const data = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    data.currency = 500;
    data.maxTier = 42;
    data.ownedHulls.push('advanced_hull');
    
    const str = exportSave(data);
    const loaded = loadSave(str);
    
    expect(loaded.currency).toBe(500);
    expect(loaded.maxTier).toBe(42);
    expect(loaded.ownedHulls).toContain('advanced_hull');
  });

  it('Migrates older versions and fills missing keys.', () => {
    const oldSave = {
      version: 0,
      currency: 100
      // Missing maxTier, hexTokens, etc.
    };
    
    const migrated = migrateSave(oldSave);
    expect(migrated.currency).toBe(100); // Preserved
    expect(migrated.maxTier).toBe(1);    // Default filled
    expect(migrated.version).toBe(1);    // Updated to current
  });

  it('Corrupted JSON falls back to defaults safely.', () => {
    const corruptedStr = '{ "currency": 500, broken_json ';
    const loaded = loadSave(corruptedStr);
    
    expect(loaded.currency).toBe(0); // Should be default
    expect(loaded.maxTier).toBe(1);
    expect(loaded.version).toBe(1);
  });
});
