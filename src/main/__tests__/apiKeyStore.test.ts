/**
 * Unit + property-based tests for ApiKeyStore (Task 74, Requirement 34)
 *
 * electron-store is mocked with an in-memory map so tests run in a plain Node
 * environment without Electron's app paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import fc from 'fast-check';
import {
  createApiKeyStore,
  isValidLabel,
  MAX_ACTIVE_API_KEYS,
  API_KEY_LABEL_MAX,
  type ApiKeyStore,
} from '../apiKeyStore';

// ---------------------------------------------------------------------------
// Mock electron-store (per-store in-memory map keyed by store `name`)
// ---------------------------------------------------------------------------

let mockStorage: Record<string, unknown> = {};

vi.mock('electron-store', () => {
  const MockStore = vi.fn().mockImplementation((opts: { name: string; defaults: Record<string, unknown> }) => {
    const ns = opts.name;
    return {
      get: (key: string, defaultValue: unknown) => {
        const full = `${ns}:${key}`;
        if (full in mockStorage) return mockStorage[full];
        if (opts.defaults && key in opts.defaults) return opts.defaults[key];
        return defaultValue;
      },
      set: (key: string, value: unknown) => {
        mockStorage[`${ns}:${key}`] = value;
      },
    };
  });
  return { default: MockStore };
});

function sha256(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function makeStore(): ApiKeyStore {
  return createApiKeyStore();
}

beforeEach(() => {
  mockStorage = {};
});

// ---------------------------------------------------------------------------
// isValidLabel
// ---------------------------------------------------------------------------

describe('isValidLabel', () => {
  it('accepts labels 1–50 characters', () => {
    expect(isValidLabel('A')).toBe(true);
    expect(isValidLabel('x'.repeat(50))).toBe(true);
  });

  it('rejects empty / whitespace-only / over-long labels', () => {
    expect(isValidLabel('')).toBe(false);
    expect(isValidLabel('   ')).toBe(false);
    expect(isValidLabel('x'.repeat(51))).toBe(false);
    expect(isValidLabel(123 as unknown)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createKey
// ---------------------------------------------------------------------------

describe('ApiKeyStore.createKey', () => {
  it('returns a raw key once and stores only its SHA-256 hash', () => {
    const store = makeStore();
    const { key, rawKey } = store.createKey('Stats Platform');

    expect(rawKey).toBeTruthy();
    expect(key.label).toBe('Stats Platform');
    expect(key.active).toBe(true);
    // The stored hash matches the SHA-256 of the raw key (matches ApiServer.hashApiKey).
    expect(key.keyHash).toBe(sha256(rawKey));
    // The raw key is never persisted on the record.
    expect(JSON.stringify(key)).not.toContain(rawKey);
  });

  it('trims the label', () => {
    const store = makeStore();
    const { key } = store.createKey('  Padded  ');
    expect(key.label).toBe('Padded');
  });

  it('rejects invalid labels', () => {
    const store = makeStore();
    expect(() => store.createKey('')).toThrow();
    expect(() => store.createKey('x'.repeat(API_KEY_LABEL_MAX + 1))).toThrow();
  });

  it('enforces the 20-active-key cap', () => {
    const store = makeStore();
    for (let i = 0; i < MAX_ACTIVE_API_KEYS; i++) {
      store.createKey(`key-${i}`);
    }
    expect(store.listActiveKeys()).toHaveLength(MAX_ACTIVE_API_KEYS);
    expect(() => store.createKey('one-too-many')).toThrow(/Maximum/);
  });

  it('allows a new key after revoking one at the cap', () => {
    const store = makeStore();
    const created = [];
    for (let i = 0; i < MAX_ACTIVE_API_KEYS; i++) {
      created.push(store.createKey(`key-${i}`).key);
    }
    store.revokeKey(created[0].id);
    expect(() => store.createKey('replacement')).not.toThrow();
    expect(store.listActiveKeys()).toHaveLength(MAX_ACTIVE_API_KEYS);
  });

  it('generates distinct keys and ids across creations', () => {
    const store = makeStore();
    const a = store.createKey('a');
    const b = store.createKey('b');
    expect(a.rawKey).not.toBe(b.rawKey);
    expect(a.key.id).not.toBe(b.key.id);
    expect(a.key.keyHash).not.toBe(b.key.keyHash);
  });
});

// ---------------------------------------------------------------------------
// revokeKey
// ---------------------------------------------------------------------------

describe('ApiKeyStore.revokeKey', () => {
  it('marks a key inactive but retains the record', () => {
    const store = makeStore();
    const { key } = store.createKey('to-revoke');
    store.revokeKey(key.id);

    expect(store.listActiveKeys()).toHaveLength(0);
    const all = store.listKeys();
    expect(all).toHaveLength(1);
    expect(all[0].active).toBe(false);
  });

  it('throws for an unknown id', () => {
    const store = makeStore();
    expect(() => store.revokeKey('does-not-exist')).toThrow(/not found/);
  });

  it('is idempotent for an already-revoked key', () => {
    const store = makeStore();
    const { key } = store.createKey('k');
    store.revokeKey(key.id);
    expect(() => store.revokeKey(key.id)).not.toThrow();
    expect(store.listActiveKeys()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listKeys ordering
// ---------------------------------------------------------------------------

describe('ApiKeyStore.listKeys', () => {
  it('lists active keys before revoked keys', () => {
    const store = makeStore();
    const a = store.createKey('a').key;
    store.createKey('b');
    store.revokeKey(a.id);

    const list = store.listKeys();
    expect(list[0].active).toBe(true);
    expect(list[list.length - 1].active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

describe('ApiKeyStore config', () => {
  it('defaults to disabled on port 3000', () => {
    const store = makeStore();
    expect(store.getConfig()).toEqual({ enabled: false, port: 3000 });
  });

  it('persists valid config', () => {
    const store = makeStore();
    store.setConfig({ enabled: true, port: 8080 });
    expect(store.getConfig()).toEqual({ enabled: true, port: 8080 });
  });

  it('rejects out-of-range ports', () => {
    const store = makeStore();
    expect(() => store.setConfig({ enabled: true, port: 80 })).toThrow();
    expect(() => store.setConfig({ enabled: true, port: 70000 })).toThrow();
    expect(() => store.setConfig({ enabled: true, port: 3000.5 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('ApiKeyStore properties', () => {
  it('stored hash always equals SHA-256(rawKey) for any valid label', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: API_KEY_LABEL_MAX }).filter((s) => s.trim().length >= 1),
        (label) => {
          mockStorage = {};
          const store = makeStore();
          const { key, rawKey } = store.createKey(label);
          return key.keyHash === sha256(rawKey) && key.active === true;
        },
      ),
    );
  });

  it('active-key count never exceeds the cap regardless of create/revoke ordering', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 0, maxLength: 40 }),
        (ops) => {
          mockStorage = {};
          const store = makeStore();
          const createdIds: string[] = [];
          for (const isCreate of ops) {
            if (isCreate) {
              try {
                const { key } = store.createKey('k');
                createdIds.push(key.id);
              } catch {
                // Hitting the cap is expected — swallow and continue.
              }
            } else if (createdIds.length > 0) {
              store.revokeKey(createdIds.shift() as string);
            }
          }
          return store.listActiveKeys().length <= MAX_ACTIVE_API_KEYS;
        },
      ),
    );
  });
});
