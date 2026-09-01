/**
 * ApiKeyStore — persistence for REST API keys and server config (Requirement 34)
 *
 * Backed by electron-store. Stores:
 *  - `apiKeys`: ApiKey records. Only the SHA-256 hex hash of each key is
 *    persisted (never the raw key), matching ApiServer.hashApiKey() so the
 *    server can authenticate presented Bearer tokens.
 *  - `apiConfig`: whether the API server is enabled and which port it binds.
 *
 * Key generation returns the raw key exactly ONCE (at creation). After that
 * the raw key is unrecoverable — only the hash remains on disk.
 *
 * Business rules (Requirement 34.4):
 *  - Up to 20 *active* keys at a time.
 *  - Each label is 1–50 characters.
 *  - Revocation flips `active` to false; the record is retained for auditing.
 */

import Store from 'electron-store';
import { randomUUID, createHash } from 'crypto';
import type { ApiKey } from '../shared/types';
import { DEFAULT_API_PORT, isValidApiPort } from './apiServer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_ACTIVE_API_KEYS = 20;
export const API_KEY_LABEL_MIN = 1;
export const API_KEY_LABEL_MAX = 50;

// ---------------------------------------------------------------------------
// Persisted config
// ---------------------------------------------------------------------------

export interface ApiConfig {
  enabled: boolean;
  port: number;
}

interface StoreSchema {
  apiKeys: ApiKey[];
  apiConfig: ApiConfig;
}

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

/** Result of creating a key — the raw key is present ONLY here, once. */
export interface CreateApiKeyResult {
  key: ApiKey;
  rawKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 hash of a raw API key, hex-encoded (mirror of ApiServer.hashApiKey). */
function hashKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Generate a random, opaque raw key (two UUIDs, dashes stripped). */
function generateRawKey(): string {
  return (randomUUID() + randomUUID()).replace(/-/g, '');
}

export function isValidLabel(label: unknown): label is string {
  if (typeof label !== 'string') return false;
  const trimmed = label.trim();
  return trimmed.length >= API_KEY_LABEL_MIN && trimmed.length <= API_KEY_LABEL_MAX;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ApiKeyStore {
  /** All key records (active first, then revoked), newest first within each group. */
  listKeys(): ApiKey[];
  /** Only the active key records (used by the ApiServer for auth). */
  listActiveKeys(): ApiKey[];
  /**
   * Create a new API key with the given label. Returns the record plus the raw
   * key (shown once). Throws when the label is invalid or the active-key cap is
   * reached.
   */
  createKey(label: string): CreateApiKeyResult;
  /** Revoke a key by id (sets active=false). Throws when the id is unknown. */
  revokeKey(id: string): void;
  /** Current API server config (enabled + port). */
  getConfig(): ApiConfig;
  /** Persist API server config. Throws on an out-of-range port. */
  setConfig(config: ApiConfig): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createApiKeyStore(): ApiKeyStore {
  const store = new Store<StoreSchema>({
    name: 'api-keys',
    defaults: {
      apiKeys: [],
      apiConfig: { enabled: false, port: DEFAULT_API_PORT },
    },
  });

  function readKeys(): ApiKey[] {
    const raw = store.get('apiKeys', []);
    // Defensive: drop malformed records rather than crash the whole store.
    return raw.filter(
      (k): k is ApiKey =>
        !!k &&
        typeof k.id === 'string' &&
        typeof k.label === 'string' &&
        typeof k.keyHash === 'string' &&
        typeof k.createdAt === 'string' &&
        typeof k.active === 'boolean',
    );
  }

  function sortForDisplay(keys: ApiKey[]): ApiKey[] {
    return [...keys].sort((a, b) => {
      // Active keys first, then by creation date descending.
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  return {
    listKeys(): ApiKey[] {
      return sortForDisplay(readKeys());
    },

    listActiveKeys(): ApiKey[] {
      return readKeys().filter((k) => k.active);
    },

    createKey(label: string): CreateApiKeyResult {
      if (!isValidLabel(label)) {
        throw new Error(
          `API key label must be ${API_KEY_LABEL_MIN}–${API_KEY_LABEL_MAX} characters.`,
        );
      }

      const keys = readKeys();
      const activeCount = keys.filter((k) => k.active).length;
      if (activeCount >= MAX_ACTIVE_API_KEYS) {
        throw new Error(
          `Maximum of ${MAX_ACTIVE_API_KEYS} active API keys reached. Revoke an existing key first.`,
        );
      }

      const rawKey = generateRawKey();
      const record: ApiKey = {
        id: randomUUID(),
        label: label.trim(),
        keyHash: hashKey(rawKey),
        createdAt: new Date().toISOString(),
        active: true,
      };

      store.set('apiKeys', [...keys, record]);
      return { key: record, rawKey };
    },

    revokeKey(id: string): void {
      const keys = readKeys();
      const index = keys.findIndex((k) => k.id === id);
      if (index === -1) {
        throw new Error(`API key "${id}" not found.`);
      }
      if (keys[index].active) {
        keys[index] = { ...keys[index], active: false };
        store.set('apiKeys', keys);
      }
    },

    getConfig(): ApiConfig {
      const cfg = store.get('apiConfig', { enabled: false, port: DEFAULT_API_PORT });
      const port = isValidApiPort(cfg.port) ? cfg.port : DEFAULT_API_PORT;
      return { enabled: !!cfg.enabled, port };
    },

    setConfig(config: ApiConfig): void {
      if (!isValidApiPort(config.port)) {
        throw new Error(
          `Invalid port: ${config.port}. Must be an integer in range 1024–65535.`,
        );
      }
      store.set('apiConfig', { enabled: !!config.enabled, port: config.port });
    },
  };
}
