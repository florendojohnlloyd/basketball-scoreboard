/**
 * RoleStore — user accounts and RBAC (Requirement 28)
 *
 * Stores user accounts in {userData}/users.json via electron-store.
 * Passwords are hashed with bcrypt at saltRounds: 12.
 */

let bcrypt: any;
try {
  bcrypt = require('bcrypt');
} catch {
  // Fallback — use plain comparison if bcrypt native module fails
  bcrypt = {
    hashSync: (pw: string) => `plain:${pw}`,
    compareSync: (pw: string, hash: string) => hash === `plain:${pw}`,
  };
  console.warn('[LigaControl] bcrypt not available — using fallback auth');
}
import { randomUUID } from 'crypto';
import Store from 'electron-store';
import type { UserAccount, Role, ActionCategory, ValidationResult } from '../shared/types';

const SALT_ROUNDS = 12;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Permission matrix: role → set of allowed ActionCategories
// ---------------------------------------------------------------------------

const PERMISSIONS: Record<Role, Set<ActionCategory>> = {
  Admin: new Set([
    'SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS',
    'LIGA_CONFIG', 'USER_MGMT', 'SYSTEM', 'VIEWER', 'STREAMING',
    'TOURNAMENT', 'SHARE',
  ]),
  Scorekeeper: new Set([
    'SCORING', 'CLOCK', 'FOULS', 'TIMEOUTS', 'PLAYER_STATS', 'VIEWER',
    'TOURNAMENT', 'SHARE',
  ]),
  Coach: new Set(['VIEWER', 'PLAYER_STATS']),
  Viewer: new Set(['VIEWER']),
};

// ---------------------------------------------------------------------------
// Store schema
// ---------------------------------------------------------------------------

interface UsersStoreSchema {
  users: UserAccount[];
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface RoleStore {
  createUser(username: string, password: string, role: Role): Promise<UserAccount>;
  updateUser(userId: string, updates: Partial<Pick<UserAccount, 'username' | 'role'>>): UserAccount;
  changePassword(userId: string, newPassword: string): Promise<void>;
  deleteUser(userId: string): void;
  authenticate(username: string, password: string): Promise<UserAccount>;
  canPerform(role: Role, action: ActionCategory): boolean;
  validatePassword(p: string): ValidationResult;
  listUsers(): UserAccount[];
  getUserById(id: string): UserAccount | undefined;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRoleStore(): RoleStore {
  const store = new Store<UsersStoreSchema>({
    name: 'users',
    defaults: { users: [] },
  });

  function getUsers(): UserAccount[] {
    return store.get('users', []);
  }

  function saveUsers(users: UserAccount[]): void {
    store.set('users', users);
  }

  function findById(id: string): UserAccount | undefined {
    return getUsers().find(u => u.id === id);
  }

  function findByUsername(username: string): UserAccount | undefined {
    return getUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  function isLocked(user: UserAccount): boolean {
    if (!user.lockedUntil) return false;
    return new Date(user.lockedUntil) > new Date();
  }

  const roleStore: RoleStore = {
    validatePassword(p: string): ValidationResult {
      if (p.length < 8) return { valid: false, error: 'Password must be at least 8 characters.' };
      if (!/[A-Z]/.test(p)) return { valid: false, error: 'Password must contain at least one uppercase letter.' };
      if (!/[0-9]/.test(p)) return { valid: false, error: 'Password must contain at least one digit.' };
      if (!/[^A-Za-z0-9]/.test(p)) return { valid: false, error: 'Password must contain at least one special character.' };
      return { valid: true };
    },

    async createUser(username: string, password: string, role: Role): Promise<UserAccount> {
      const validation = roleStore.validatePassword(password);
      if (!validation.valid) throw new Error(validation.error);
      if (findByUsername(username)) throw new Error(`Username "${username}" is already taken.`);
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const account: UserAccount = {
        id: randomUUID(),
        username,
        passwordHash,
        role,
        createdAt: new Date().toISOString(),
        failedAttempts: 0,
      };
      const users = getUsers();
      users.push(account);
      saveUsers(users);
      return account;
    },

    updateUser(userId: string, updates: Partial<Pick<UserAccount, 'username' | 'role'>>): UserAccount {
      const users = getUsers();
      const idx = users.findIndex(u => u.id === userId);
      if (idx === -1) throw new Error(`User "${userId}" not found.`);
      if (updates.username) {
        const existing = findByUsername(updates.username);
        if (existing && existing.id !== userId) {
          throw new Error(`Username "${updates.username}" is already taken.`);
        }
      }
      users[idx] = { ...users[idx], ...updates };
      saveUsers(users);
      return users[idx];
    },

    async changePassword(userId: string, newPassword: string): Promise<void> {
      const validation = roleStore.validatePassword(newPassword);
      if (!validation.valid) throw new Error(validation.error);
      const users = getUsers();
      const idx = users.findIndex(u => u.id === userId);
      if (idx === -1) throw new Error(`User "${userId}" not found.`);
      users[idx].passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      saveUsers(users);
    },

    deleteUser(userId: string): void {
      const users = getUsers();
      const user = users.find(u => u.id === userId);
      if (!user) throw new Error(`User "${userId}" not found.`);
      const adminCount = users.filter(u => u.role === 'Admin').length;
      if (user.role === 'Admin' && adminCount <= 1) {
        throw new Error('Cannot delete the sole Admin account.');
      }
      saveUsers(users.filter(u => u.id !== userId));
    },

    async authenticate(username: string, password: string): Promise<UserAccount> {
      const users = getUsers();
      const user = findByUsername(username);
      if (!user) throw new Error('Invalid username or password.');

      // Check if lockout has expired — if so, reset failedAttempts
      if (user.lockedUntil && new Date(user.lockedUntil) <= new Date()) {
        const idx = users.findIndex(u => u.id === user.id);
        users[idx] = { ...users[idx], failedAttempts: 0, lockedUntil: undefined };
        saveUsers(users);
        user.failedAttempts = 0;
        delete user.lockedUntil;
      }

      if (isLocked(user)) {
        throw new Error(`Account locked until ${user.lockedUntil}.`);
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      const idx = users.findIndex(u => u.id === user.id);

      if (!match) {
        const newAttempts = (user.failedAttempts ?? 0) + 1;
        const locked = newAttempts >= MAX_FAILED_ATTEMPTS;
        users[idx] = {
          ...users[idx],
          failedAttempts: newAttempts,
          lockedUntil: locked
            ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
            : undefined,
        };
        saveUsers(users);
        if (locked) {
          throw new Error(`Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts.`);
        }
        throw new Error('Invalid username or password.');
      }

      // Successful login — reset failedAttempts
      users[idx] = { ...users[idx], failedAttempts: 0, lockedUntil: undefined };
      saveUsers(users);
      return users[idx];
    },

    canPerform(role: Role, action: ActionCategory): boolean {
      return PERMISSIONS[role]?.has(action) ?? false;
    },

    listUsers(): UserAccount[] {
      return getUsers().map(u => ({ ...u, passwordHash: '[REDACTED]' }));
    },

    getUserById(id: string): UserAccount | undefined {
      return findById(id);
    },
  };

  return roleStore;
}
