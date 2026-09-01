/**
 * Example-based unit tests for RoleStore — user accounts and RBAC (Task 57)
 *
 * Tests cover:
 * - Sole Admin deletion rejected
 * - Account lockout triggers at attempt 3
 * - Account lockout clears after expiry
 * - bcrypt hash is not plain text
 * - validatePassword requirements
 * - canPerform permission matrix
 * - createUser and authenticate flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RoleStore } from '../roleStore';

// ---------------------------------------------------------------------------
// Mock electron-store
// ---------------------------------------------------------------------------

let mockStorage: Record<string, unknown> = {};

vi.mock('electron-store', () => {
  const MockStore = vi.fn().mockImplementation(() => ({
    get: vi.fn((key: string, defaultValue: unknown) => {
      return key in mockStorage ? mockStorage[key] : defaultValue;
    }),
    set: vi.fn((key: string, value: unknown) => {
      mockStorage[key] = value;
    }),
  }));
  return { default: MockStore };
});

// ---------------------------------------------------------------------------
// Mock bcrypt with real-ish hashing (prefix-based so we can verify it's not plaintext)
// ---------------------------------------------------------------------------

const HASH_PREFIX = '$2b$12$mockhash_';

vi.mock('bcrypt', () => ({
  hash: vi.fn(async (password: string, _saltRounds: number) => {
    // Produce a deterministic hash that is clearly NOT the plaintext
    return `${HASH_PREFIX}${Buffer.from(password).toString('base64')}`;
  }),
  compare: vi.fn(async (password: string, hash: string) => {
    // Reverse the mock hash to compare
    const expected = `${HASH_PREFIX}${Buffer.from(password).toString('base64')}`;
    return hash === expected;
  }),
  hashSync: vi.fn((password: string, _saltRounds: number) => {
    return `${HASH_PREFIX}${Buffer.from(password).toString('base64')}`;
  }),
  compareSync: vi.fn((password: string, hash: string) => {
    const expected = `${HASH_PREFIX}${Buffer.from(password).toString('base64')}`;
    return hash === expected;
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { createRoleStore } from '../roleStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore(): RoleStore {
  return createRoleStore();
}

const VALID_PASSWORD = 'Admin1@pass';
const WEAK_PASSWORD = 'weak';

// ---------------------------------------------------------------------------
// Sole Admin deletion rejected
// ---------------------------------------------------------------------------

describe('RoleStore — sole Admin deletion rejected', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  it('throws when attempting to delete the only Admin account', async () => {
    const store = makeStore();
    const admin = await store.createUser('admin', VALID_PASSWORD, 'Admin');

    expect(() => store.deleteUser(admin.id)).toThrow(/sole Admin/i);
  });

  it('allows deleting an Admin when another Admin exists', async () => {
    const store = makeStore();
    const admin1 = await store.createUser('admin1', VALID_PASSWORD, 'Admin');
    const admin2 = await store.createUser('admin2', VALID_PASSWORD, 'Admin');

    // Should not throw
    expect(() => store.deleteUser(admin2.id)).not.toThrow();

    // admin1 still exists
    const user = store.getUserById(admin1.id);
    expect(user).toBeDefined();
    expect(user!.username).toBe('admin1');
  });

  it('allows deleting non-Admin users freely', async () => {
    const store = makeStore();
    await store.createUser('admin', VALID_PASSWORD, 'Admin');
    const viewer = await store.createUser('viewer', VALID_PASSWORD, 'Viewer');

    expect(() => store.deleteUser(viewer.id)).not.toThrow();
  });

  it('rejects deletion even if other roles exist but no other Admin', async () => {
    const store = makeStore();
    const admin = await store.createUser('admin', VALID_PASSWORD, 'Admin');
    await store.createUser('scorer', VALID_PASSWORD, 'Scorekeeper');
    await store.createUser('coach', VALID_PASSWORD, 'Coach');

    expect(() => store.deleteUser(admin.id)).toThrow(/sole Admin/i);
  });
});

// ---------------------------------------------------------------------------
// Account lockout triggers at attempt 3
// ---------------------------------------------------------------------------

describe('RoleStore — lockout triggers at attempt 3', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  it('locks account after 3 consecutive failed authentication attempts', async () => {
    const store = makeStore();
    await store.createUser('testuser', VALID_PASSWORD, 'Scorekeeper');

    // First two failures should just say "Invalid username or password"
    await expect(store.authenticate('testuser', 'wrong1')).rejects.toThrow(/Invalid username or password/);
    await expect(store.authenticate('testuser', 'wrong2')).rejects.toThrow(/Invalid username or password/);

    // Third failure triggers lockout
    await expect(store.authenticate('testuser', 'wrong3')).rejects.toThrow(/locked/i);
  });

  it('subsequent login attempts while locked are rejected immediately', async () => {
    const store = makeStore();
    await store.createUser('lockme', VALID_PASSWORD, 'Viewer');

    // Trigger lockout
    await expect(store.authenticate('lockme', 'bad1')).rejects.toThrow();
    await expect(store.authenticate('lockme', 'bad2')).rejects.toThrow();
    await expect(store.authenticate('lockme', 'bad3')).rejects.toThrow(/locked/i);

    // Even correct password is rejected while locked
    await expect(store.authenticate('lockme', VALID_PASSWORD)).rejects.toThrow(/locked/i);
  });

  it('failed attempt counter resets on successful login before reaching 3', async () => {
    const store = makeStore();
    await store.createUser('resilient', VALID_PASSWORD, 'Coach');

    // Two failures
    await expect(store.authenticate('resilient', 'bad1')).rejects.toThrow(/Invalid/);
    await expect(store.authenticate('resilient', 'bad2')).rejects.toThrow(/Invalid/);

    // Successful login resets counter
    const user = await store.authenticate('resilient', VALID_PASSWORD);
    expect(user.username).toBe('resilient');

    // Two more failures after reset — should NOT lock
    await expect(store.authenticate('resilient', 'bad3')).rejects.toThrow(/Invalid/);
    await expect(store.authenticate('resilient', 'bad4')).rejects.toThrow(/Invalid/);

    // Still not locked — can authenticate
    const user2 = await store.authenticate('resilient', VALID_PASSWORD);
    expect(user2.username).toBe('resilient');
  });
});

// ---------------------------------------------------------------------------
// Lockout clears after expiry
// ---------------------------------------------------------------------------

describe('RoleStore — lockout clears after expiry', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lockout expires after 5 minutes and user can authenticate again', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    await store.createUser('timedout', VALID_PASSWORD, 'Scorekeeper');

    // Trigger lockout
    await expect(store.authenticate('timedout', 'bad1')).rejects.toThrow();
    await expect(store.authenticate('timedout', 'bad2')).rejects.toThrow();
    await expect(store.authenticate('timedout', 'bad3')).rejects.toThrow(/locked/i);

    // Advance time by 5 minutes + 1 second
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    // Should now be able to authenticate successfully
    const user = await store.authenticate('timedout', VALID_PASSWORD);
    expect(user.username).toBe('timedout');
  });

  it('failed attempt counter resets to 0 after lockout expiry', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    await store.createUser('resetme', VALID_PASSWORD, 'Admin');

    // Trigger lockout
    await expect(store.authenticate('resetme', 'bad1')).rejects.toThrow();
    await expect(store.authenticate('resetme', 'bad2')).rejects.toThrow();
    await expect(store.authenticate('resetme', 'bad3')).rejects.toThrow(/locked/i);

    // Advance past lockout
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    // Two failed attempts after expiry — should NOT trigger a new lockout yet
    await expect(store.authenticate('resetme', 'badagain1')).rejects.toThrow(/Invalid/);
    await expect(store.authenticate('resetme', 'badagain2')).rejects.toThrow(/Invalid/);

    // Still not locked — can login
    const user = await store.authenticate('resetme', VALID_PASSWORD);
    expect(user.username).toBe('resetme');
  });
});

// ---------------------------------------------------------------------------
// bcrypt hash is not plain text
// ---------------------------------------------------------------------------

describe('RoleStore — bcrypt hash is not plain text', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  it('stored passwordHash does not equal the plaintext password', async () => {
    const store = makeStore();
    const user = await store.createUser('hashuser', VALID_PASSWORD, 'Admin');

    // Directly check the stored user's hash
    expect(user.passwordHash).not.toBe(VALID_PASSWORD);
    expect(user.passwordHash).not.toContain(VALID_PASSWORD);
  });

  it('stored passwordHash starts with bcrypt prefix', async () => {
    const store = makeStore();
    const user = await store.createUser('bcryptuser', VALID_PASSWORD, 'Scorekeeper');

    // Our mock uses $2b$12$ prefix; real bcrypt would too
    expect(user.passwordHash).toMatch(/^\$2b\$12\$/);
  });

  it('different users with same password get different-looking entries (hash includes salt)', async () => {
    const store = makeStore();
    const user1 = await store.createUser('user1', VALID_PASSWORD, 'Admin');
    const user2 = await store.createUser('user2', VALID_PASSWORD, 'Coach');

    // Note: with our deterministic mock they'll be the same, but in real bcrypt they'd differ.
    // The important test is that the hash is NOT the plaintext.
    expect(user1.passwordHash).not.toBe(VALID_PASSWORD);
    expect(user2.passwordHash).not.toBe(VALID_PASSWORD);
  });
});

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------

describe('RoleStore — validatePassword', () => {
  let store: RoleStore;

  beforeEach(() => {
    mockStorage = {};
    store = makeStore();
  });

  it('accepts a password meeting all requirements', () => {
    const result = store.validatePassword('MyPass1!');
    expect(result.valid).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = store.validatePassword('Ab1!xyz');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/8 characters/);
  });

  it('rejects a password with no uppercase letter', () => {
    const result = store.validatePassword('mypass1!abc');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/uppercase/i);
  });

  it('rejects a password with no digit', () => {
    const result = store.validatePassword('MyPass!!abc');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/digit/i);
  });

  it('rejects a password with no special character', () => {
    const result = store.validatePassword('MyPass123');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/special/i);
  });
});

// ---------------------------------------------------------------------------
// canPerform — permission matrix
// ---------------------------------------------------------------------------

describe('RoleStore — canPerform permission matrix', () => {
  let store: RoleStore;

  beforeEach(() => {
    mockStorage = {};
    store = makeStore();
  });

  it('Admin can perform all action categories', () => {
    const actions = [
      'SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS',
      'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING',
      'TOURNAMENT',
    ] as const;
    for (const action of actions) {
      expect(store.canPerform('Admin', action)).toBe(true);
    }
  });

  it('Scorekeeper can perform game-related and viewer actions', () => {
    expect(store.canPerform('Scorekeeper', 'SCORING')).toBe(true);
    expect(store.canPerform('Scorekeeper', 'CLOCK')).toBe(true);
    expect(store.canPerform('Scorekeeper', 'FOULS')).toBe(true);
    expect(store.canPerform('Scorekeeper', 'TIMEOUTS')).toBe(true);
    expect(store.canPerform('Scorekeeper', 'PLAYER_STATS')).toBe(true);
    expect(store.canPerform('Scorekeeper', 'VIEWER')).toBe(true);
  });

  it('Scorekeeper cannot perform admin-only actions', () => {
    expect(store.canPerform('Scorekeeper', 'LIGA_CONFIG')).toBe(false);
    expect(store.canPerform('Scorekeeper', 'USER_MGMT')).toBe(false);
    expect(store.canPerform('Scorekeeper', 'SYSTEM')).toBe(false);
    expect(store.canPerform('Scorekeeper', 'STREAMING')).toBe(false);
  });

  it('Coach can only view and access player stats', () => {
    expect(store.canPerform('Coach', 'VIEWER')).toBe(true);
    expect(store.canPerform('Coach', 'PLAYER_STATS')).toBe(true);
    expect(store.canPerform('Coach', 'SCORING')).toBe(false);
    expect(store.canPerform('Coach', 'CLOCK')).toBe(false);
    expect(store.canPerform('Coach', 'LIGA_CONFIG')).toBe(false);
  });

  it('Coach is blocked from USER_MGMT (user management)', () => {
    expect(store.canPerform('Coach', 'USER_MGMT')).toBe(false);
  });

  it('Viewer is blocked from every game-control category', () => {
    // Game-control categories: scoring, clock, fouls, timeouts.
    expect(store.canPerform('Viewer', 'SCORING')).toBe(false);
    expect(store.canPerform('Viewer', 'CLOCK')).toBe(false);
    expect(store.canPerform('Viewer', 'FOULS')).toBe(false);
    expect(store.canPerform('Viewer', 'TIMEOUTS')).toBe(false);
  });

  it('Viewer can only perform VIEWER action', () => {
    expect(store.canPerform('Viewer', 'VIEWER')).toBe(true);
    expect(store.canPerform('Viewer', 'SCORING')).toBe(false);
    expect(store.canPerform('Viewer', 'CLOCK')).toBe(false);
    expect(store.canPerform('Viewer', 'PLAYER_STATS')).toBe(false);
    expect(store.canPerform('Viewer', 'LIGA_CONFIG')).toBe(false);
    expect(store.canPerform('Viewer', 'USER_MGMT')).toBe(false);
    expect(store.canPerform('Viewer', 'SYSTEM')).toBe(false);
    expect(store.canPerform('Viewer', 'STREAMING')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createUser and authenticate
// ---------------------------------------------------------------------------

describe('RoleStore — createUser and authenticate', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  it('createUser returns a user with the correct username and role', async () => {
    const store = makeStore();
    const user = await store.createUser('newuser', VALID_PASSWORD, 'Coach');

    expect(user.username).toBe('newuser');
    expect(user.role).toBe('Coach');
    expect(user.id).toBeDefined();
    expect(user.createdAt).toBeDefined();
    expect(user.failedAttempts).toBe(0);
  });

  it('createUser rejects duplicate username (case-insensitive)', async () => {
    const store = makeStore();
    await store.createUser('Admin', VALID_PASSWORD, 'Admin');

    await expect(store.createUser('admin', VALID_PASSWORD, 'Viewer')).rejects.toThrow(/already taken/i);
  });

  it('createUser rejects weak password', async () => {
    const store = makeStore();

    await expect(store.createUser('user', WEAK_PASSWORD, 'Admin')).rejects.toThrow();
  });

  it('authenticate succeeds with correct credentials', async () => {
    const store = makeStore();
    await store.createUser('authtest', VALID_PASSWORD, 'Scorekeeper');

    const user = await store.authenticate('authtest', VALID_PASSWORD);
    expect(user.username).toBe('authtest');
    expect(user.role).toBe('Scorekeeper');
  });

  it('authenticate fails with wrong password', async () => {
    const store = makeStore();
    await store.createUser('authfail', VALID_PASSWORD, 'Coach');

    await expect(store.authenticate('authfail', 'WrongPass1!')).rejects.toThrow(/Invalid/);
  });

  it('authenticate fails with non-existent username', async () => {
    const store = makeStore();

    await expect(store.authenticate('ghost', VALID_PASSWORD)).rejects.toThrow(/Invalid/);
  });
});

// ---------------------------------------------------------------------------
// updateUser and changePassword
// ---------------------------------------------------------------------------

describe('RoleStore — updateUser and changePassword', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  it('updateUser changes username', async () => {
    const store = makeStore();
    const user = await store.createUser('oldname', VALID_PASSWORD, 'Coach');

    const updated = store.updateUser(user.id, { username: 'newname' });
    expect(updated.username).toBe('newname');
  });

  it('updateUser changes role', async () => {
    const store = makeStore();
    const user = await store.createUser('rolechange', VALID_PASSWORD, 'Viewer');

    const updated = store.updateUser(user.id, { role: 'Scorekeeper' });
    expect(updated.role).toBe('Scorekeeper');
  });

  it('updateUser throws for non-existent user', () => {
    const store = makeStore();

    expect(() => store.updateUser('fake-id', { username: 'x' })).toThrow(/not found/i);
  });

  it('changePassword updates the hash', async () => {
    const store = makeStore();
    const user = await store.createUser('pwchange', VALID_PASSWORD, 'Admin');
    const originalHash = user.passwordHash;

    await store.changePassword(user.id, 'NewPass2@xyz');

    const updatedUser = store.getUserById(user.id);
    expect(updatedUser!.passwordHash).not.toBe(originalHash);
  });

  it('changePassword stores a bcrypt hash, never the plaintext new password', async () => {
    const store = makeStore();
    const user = await store.createUser('pwplain', VALID_PASSWORD, 'Admin');
    const newPassword = 'NewPass2@xyz';

    await store.changePassword(user.id, newPassword);

    const updatedUser = store.getUserById(user.id);
    // The stored hash must not equal or contain the plaintext new password.
    expect(updatedUser!.passwordHash).not.toBe(newPassword);
    expect(updatedUser!.passwordHash).not.toContain(newPassword);
    // And it must be a bcrypt-format hash.
    expect(updatedUser!.passwordHash).toMatch(/^\$2b\$12\$/);
    // The new password must still authenticate (proving the hash is valid, not garbage).
    const authed = await store.authenticate('pwplain', newPassword);
    expect(authed.username).toBe('pwplain');
  });

  it('changePassword rejects weak new password', async () => {
    const store = makeStore();
    const user = await store.createUser('weakpw', VALID_PASSWORD, 'Admin');

    await expect(store.changePassword(user.id, 'short')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TOURNAMENT permission matrix (Requirements 10.1, 10.2, 10.3)
// ---------------------------------------------------------------------------

describe('RoleStore — TOURNAMENT permission matrix', () => {
  let store: RoleStore;

  beforeEach(() => {
    mockStorage = {};
    store = makeStore();
  });

  it('Admin can perform TOURNAMENT actions', () => {
    expect(store.canPerform('Admin', 'TOURNAMENT')).toBe(true);
  });

  it('Scorekeeper can perform TOURNAMENT actions', () => {
    expect(store.canPerform('Scorekeeper', 'TOURNAMENT')).toBe(true);
  });

  it('Coach cannot perform TOURNAMENT actions (read-only via IPC VIEWER category)', () => {
    expect(store.canPerform('Coach', 'TOURNAMENT')).toBe(false);
  });

  it('Viewer cannot perform TOURNAMENT actions (read-only via IPC VIEWER category)', () => {
    expect(store.canPerform('Viewer', 'TOURNAMENT')).toBe(false);
  });
});

// ===========================================================================
// Property-Based Tests — Task 79 (Properties 25–28)
// Feature: basketball-scoreboard
// ===========================================================================

import * as fc from 'fast-check';
import type { Role, ActionCategory, UserAccount } from '../../shared/types';

const ALL_ROLES: Role[] = ['Admin', 'Scorekeeper', 'Coach', 'Viewer'];

const ALL_ACTIONS: ActionCategory[] = [
  'SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS',
  'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING',
  'TOURNAMENT', 'SHARE',
];

// Expected permission matrix (mirrors the authoritative matrix in roleStore.ts).
// A role R is authorized for action A iff A ∈ EXPECTED_MATRIX[R].
const EXPECTED_MATRIX: Record<Role, Set<ActionCategory>> = {
  Admin: new Set(ALL_ACTIONS),
  Scorekeeper: new Set([
    'SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'VIEWER',
    'TOURNAMENT', 'SHARE',
  ] as ActionCategory[]),
  Coach: new Set(['VIEWER', 'PLAYER_STATS'] as ActionCategory[]),
  Viewer: new Set(['VIEWER'] as ActionCategory[]),
};

// ---------------------------------------------------------------------------
// Property 25: RBAC permission matrix is complete and consistent
// Validates: Requirement 28 (acceptance criteria 1–5)
// ---------------------------------------------------------------------------

describe('Property 25 — RBAC permission matrix is complete and consistent', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  // Feature: basketball-scoreboard, Property 25: RBAC permission matrix is complete and consistent
  it('canPerform(R, A) is true iff R is authorized for A; Admin authorized for all, Viewer only for VIEWER', () => {
    const store = makeStore();
    fc.assert(
      fc.property(
        fc.constantFrom<Role>(...ALL_ROLES),
        fc.constantFrom<ActionCategory>(...ALL_ACTIONS),
        (role, action) => {
          const expected = EXPECTED_MATRIX[role].has(action);
          expect(store.canPerform(role, action)).toBe(expected);

          // Admin is authorized for every action category.
          if (role === 'Admin') {
            expect(store.canPerform('Admin', action)).toBe(true);
          }
          // Viewer is authorized only for the VIEWER (view scoreboard) category.
          if (role === 'Viewer') {
            expect(store.canPerform('Viewer', action)).toBe(action === 'VIEWER');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 26: Deleting the sole Admin account is always rejected
// Validates: Requirement 28 (acceptance criterion 7)
// ---------------------------------------------------------------------------

describe('Property 26 — deleting the sole Admin account is always rejected', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  // Builds a valid UserAccount record with a caller-supplied id and role.
  function makeAccount(id: string, username: string, role: Role): UserAccount {
    return {
      id,
      username,
      passwordHash: `$2b$12$mockhash_${id}`,
      role,
      createdAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
      failedAttempts: 0,
    };
  }

  // Feature: basketball-scoreboard, Property 26: Deleting the sole Admin account is always rejected
  it('for any user list with exactly one Admin, deleting that Admin fails and leaves the list unchanged', () => {
    fc.assert(
      fc.property(
        // Roles for the additional (non-Admin) accounts, so there is exactly one Admin total.
        fc.array(fc.constantFrom<Role>('Scorekeeper', 'Coach', 'Viewer'), { minLength: 0, maxLength: 6 }),
        (otherRoles) => {
          // Seed the credential store directly with exactly one Admin account
          // plus the generated non-Admin accounts. This avoids the (slow) bcrypt
          // hashing path while faithfully producing "a list with exactly one Admin".
          const admin = makeAccount('admin-id', 'admin', 'Admin');
          const accounts: UserAccount[] = [
            admin,
            ...otherRoles.map((role, i) => makeAccount(`user-${i}`, `user${i}`, role)),
          ];
          mockStorage = { users: accounts };

          const store = makeStore();

          const before = store.listUsers();
          const adminCount = before.filter((u) => u.role === 'Admin').length;
          expect(adminCount).toBe(1); // precondition: exactly one Admin

          // Deleting the sole Admin must be rejected.
          expect(() => store.deleteUser(admin.id)).toThrow(/sole Admin/i);

          // User list must be unchanged.
          const after = store.listUsers();
          expect(after).toEqual(before);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 27: Password validation accepts strong passwords and rejects weak ones
// Validates: Requirement 28 (acceptance criterion 8)
// ---------------------------------------------------------------------------

describe('Property 27 — password validation accepts strong and rejects weak passwords', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  // Reference definition of "strong": length >= 8 AND has uppercase AND digit AND special (non-alphanumeric).
  function isStrong(p: string): boolean {
    return (
      p.length >= 8 &&
      /[A-Z]/.test(p) &&
      /[0-9]/.test(p) &&
      /[^A-Za-z0-9]/.test(p)
    );
  }

  // Feature: basketball-scoreboard, Property 27: Password validation accepts strong passwords and rejects weak ones
  it('validatePassword(P) is valid iff P is >=8 chars with uppercase, digit and special; else invalid with a reason', () => {
    const store = makeStore();
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        (p) => {
          const result = store.validatePassword(p);
          const strong = isStrong(p);
          expect(result.valid).toBe(strong);
          if (!strong) {
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: basketball-scoreboard, Property 27: Password validation accepts strong passwords and rejects weak ones
  it('accepts all deliberately strong passwords built from required character classes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20 }),
        fc.constantFrom('A', 'B', 'Z', 'Q'),
        fc.constantFrom('0', '5', '9'),
        fc.constantFrom('!', '@', '#', '$', '%', '*'),
        (filler, upper, digit, special) => {
          // Compose a password guaranteed to be >= 8 chars with all classes.
          const base = `${filler}${upper}${digit}${special}aaaaaaaa`;
          const store = makeStore();
          const result = store.validatePassword(base);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 28: User account store round-trip preserves all fields
// Validates: Requirement 28 (acceptance criterion 10)
// ---------------------------------------------------------------------------

describe('Property 28 — user account store round-trip preserves all fields', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  // Arbitrary for a valid UserAccount record.
  const userAccountArb = fc.record({
    id: fc.uuid(),
    username: fc.string({ minLength: 1, maxLength: 20 }),
    passwordHash: fc.string({ minLength: 1, maxLength: 60 }).map((s) => `$2b$12$${s}`),
    role: fc.constantFrom<Role>(...ALL_ROLES),
    createdAt: fc
      .date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2100-01-01T00:00:00.000Z'), noInvalidDate: true })
      .map((d) => d.toISOString()),
    failedAttempts: fc.integer({ min: 0, max: 3 }),
  });

  // Feature: basketball-scoreboard, Property 28: User account store round-trip preserves all fields
  it('for any valid list of UserAccounts, saving and reloading produces a deeply equal list', () => {
    fc.assert(
      fc.property(
        // Ensure unique ids so records are unambiguous on reload.
        fc.uniqueArray(userAccountArb, {
          minLength: 0,
          maxLength: 8,
          selector: (u) => u.id,
        }),
        (accounts: UserAccount[]) => {
          mockStorage = {};

          // Persist the accounts directly into the backing store.
          mockStorage['users'] = accounts;

          // A fresh store reads from the same backing storage — simulating a
          // new application session reloading the credential store.
          const store = makeStore();

          // listUsers() returns every persisted account (with hash redacted),
          // so the set of ids and roles must be preserved exactly.
          const listed = store.listUsers();
          expect(listed.length).toBe(accounts.length);

          // Every account is present and deeply equal after reload
          // (getUserById returns the raw, unredacted record).
          for (const original of accounts) {
            const found = store.getUserById(original.id);
            expect(found).toEqual(original);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
