/**
 * SocialShareService — unit & property tests (Task 75, Requirement 35)
 *
 * All external collaborators (HTTP client, browser opener, token store, audit
 * sink, screenshot capturer) are injected, so these tests run without Electron
 * or network access.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_GAME_STATE } from '../../shared/types';
import type { GameState, SocialPlatform, AuditEntry } from '../../shared/types';
import {
  createSocialShareService,
  ReauthorizationRequiredError,
  type TokenStore,
  type StoredToken,
  type HttpPostFn,
  type PlatformConfig,
} from '../socialShareService';

// ---------------------------------------------------------------------------
// In-memory token store
// ---------------------------------------------------------------------------

function memoryTokenStore(): TokenStore & { _map: Map<SocialPlatform, StoredToken> } {
  const map = new Map<SocialPlatform, StoredToken>();
  return {
    _map: map,
    get: (p) => map.get(p) ?? null,
    set: (p, t) => { map.set(p, t); },
    delete: (p) => { map.delete(p); },
  };
}

// Minimal platform config for both platforms (facebook text-only in one test).
function testPlatformConfig(overrides?: Partial<Record<SocialPlatform, Partial<PlatformConfig>>>): Record<SocialPlatform, PlatformConfig> {
  const base: Record<SocialPlatform, PlatformConfig> = {
    twitter: {
      clientId: 'tw-client',
      authorizeUrl: 'https://tw/authorize',
      tokenUrl: 'https://tw/token',
      postUrl: 'https://tw/tweets',
      imageUploadUrl: 'https://tw/media',
      scopes: ['tweet.write', 'offline.access'],
      supportsImages: true,
    },
    facebook: {
      clientId: 'fb-client',
      authorizeUrl: 'https://fb/authorize',
      tokenUrl: 'https://fb/token',
      postUrl: 'https://fb/feed',
      imageUploadUrl: 'https://fb/photos',
      scopes: ['pages_manage_posts'],
      supportsImages: true,
    },
  };
  return {
    twitter: { ...base.twitter, ...(overrides?.twitter ?? {}) },
    facebook: { ...base.facebook, ...(overrides?.facebook ?? {}) },
  };
}

function auditSink() {
  const entries: AuditEntry[] = [];
  return {
    entries,
    append: (e: AuditEntry) => { entries.push(e); },
  };
}

// ---------------------------------------------------------------------------
// generateShareText — examples (Req 35.2)
// ---------------------------------------------------------------------------

describe('generateShareText', () => {
  function make(): GameState {
    const s = DEFAULT_GAME_STATE();
    s.ligaName = 'Sunday League';
    s.home.config.name = 'Lakers';
    s.away.config.name = 'Celtics';
    s.home.score = 102;
    s.away.score = 98;
    return s;
  }

  it('includes liga name, both teams, both scores, and the period label', () => {
    const svc = createSocialShareService({ tokenStore: memoryTokenStore() });
    const s = make();
    s.gamePhase = 'in-game';
    s.period = { current: 3, format: 'quarters', isOvertime: false, overtimeNumber: 0 };
    const text = svc.generateShareText(s);
    expect(text).toContain('Sunday League');
    expect(text).toContain('Lakers');
    expect(text).toContain('Celtics');
    expect(text).toContain('102');
    expect(text).toContain('98');
    expect(text).toContain('Q3');
  });

  it('shows "Final" when the game is in the post-game phase', () => {
    const svc = createSocialShareService({ tokenStore: memoryTokenStore() });
    const s = make();
    s.gamePhase = 'post-game';
    const text = svc.generateShareText(s);
    expect(text).toContain('Final');
    expect(text).not.toContain('Q1');
  });

  it('shows overtime label for overtime periods', () => {
    const svc = createSocialShareService({ tokenStore: memoryTokenStore() });
    const s = make();
    s.gamePhase = 'in-game';
    s.period = { current: 5, format: 'quarters', isOvertime: true, overtimeNumber: 2 };
    const text = svc.generateShareText(s);
    expect(text).toContain('OT2');
  });

  it('falls back to placeholders when liga/team names are empty', () => {
    const svc = createSocialShareService({ tokenStore: memoryTokenStore() });
    const s = DEFAULT_GAME_STATE();
    s.home.config.name = '';
    s.away.config.name = '';
    s.ligaName = null;
    const text = svc.generateShareText(s);
    expect(text).toContain('Liga');
    expect(text).toContain('Home');
    expect(text).toContain('Away');
  });
});

// ---------------------------------------------------------------------------
// Token status & silent refresh (Req 35.6)
// ---------------------------------------------------------------------------

describe('token status', () => {
  it('reports missing / valid / expired correctly', () => {
    const store = memoryTokenStore();
    const svc = createSocialShareService({ tokenStore: store });
    expect(svc.getTokenStatus('twitter')).toBe('missing');

    store.set('twitter', { accessToken: 'a', expiresAt: Date.now() + 3_600_000 });
    expect(svc.getTokenStatus('twitter')).toBe('valid');

    store.set('twitter', { accessToken: 'a', expiresAt: Date.now() - 1000 });
    expect(svc.getTokenStatus('twitter')).toBe('expired');
  });

  it('revokeToken removes the stored token', () => {
    const store = memoryTokenStore();
    store.set('twitter', { accessToken: 'a', expiresAt: Date.now() + 1000 });
    const svc = createSocialShareService({ tokenStore: store });
    svc.revokeToken('twitter');
    expect(svc.getTokenStatus('twitter')).toBe('missing');
  });
});

describe('sharePost token handling', () => {
  it('throws ReauthorizationRequiredError when no token is stored', async () => {
    const audit = auditSink();
    const svc = createSocialShareService({
      tokenStore: memoryTokenStore(),
      platformConfig: testPlatformConfig(),
      appendAudit: audit.append,
      httpPost: vi.fn(),
    });
    await expect(svc.sharePost('twitter', 'hi')).rejects.toBeInstanceOf(ReauthorizationRequiredError);
    // Audit records the failure (Req 35.9)
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0].newValue).toMatchObject({ platform: 'twitter', success: false });
  });

  it('silently refreshes an expired token before posting (Req 35.6)', async () => {
    const store = memoryTokenStore();
    store.set('twitter', { accessToken: 'old', refreshToken: 'refresh-1', expiresAt: Date.now() - 1000 });

    const calls: Array<{ url: string; body: string }> = [];
    const httpPost: HttpPostFn = async (url, _headers, body) => {
      calls.push({ url, body: body.toString() });
      if (url.endsWith('/token')) {
        return { status: 200, body: JSON.stringify({ access_token: 'fresh', expires_in: 3600 }) };
      }
      return { status: 201, body: '{}' };
    };

    const audit = auditSink();
    const svc = createSocialShareService({
      tokenStore: store,
      platformConfig: testPlatformConfig(),
      httpPost,
      appendAudit: audit.append,
    });

    await svc.sharePost('twitter', 'hello world');

    // Refresh happened first, then the post.
    expect(calls[0].url).toContain('/token');
    expect(calls[0].body).toContain('grant_type=refresh_token');
    expect(calls[1].url).toContain('/tweets');
    // Stored token updated.
    expect(store.get('twitter')?.accessToken).toBe('fresh');
    // Success audited.
    expect(audit.entries.at(-1)?.newValue).toMatchObject({ success: true });
  });

  it('prompts re-authorization when the silent refresh fails (Req 35.6)', async () => {
    const store = memoryTokenStore();
    store.set('twitter', { accessToken: 'old', refreshToken: 'bad', expiresAt: Date.now() - 1000 });
    const httpPost: HttpPostFn = async () => ({ status: 400, body: 'invalid_grant' });
    const svc = createSocialShareService({
      tokenStore: store,
      platformConfig: testPlatformConfig(),
      httpPost,
    });
    await expect(svc.sharePost('twitter', 'hi')).rejects.toBeInstanceOf(ReauthorizationRequiredError);
  });
});

// ---------------------------------------------------------------------------
// Image fallback (Req 35.8)
// ---------------------------------------------------------------------------

describe('image attachment fallback', () => {
  it('posts text-only and notifies when the platform does not support images', async () => {
    const store = memoryTokenStore();
    store.set('facebook', { accessToken: 'valid', expiresAt: Date.now() + 3_600_000 });

    const posted: string[] = [];
    const httpPost: HttpPostFn = async (url, _h, body) => {
      posted.push(url);
      return { status: 200, body: '{}' };
    };
    const events: any[] = [];
    const svc = createSocialShareService({
      tokenStore: store,
      platformConfig: testPlatformConfig({ facebook: { supportsImages: false, imageUploadUrl: undefined } }),
      httpPost,
      getControlPanelWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: (_ch: string, payload: any) => events.push(payload) },
      }) as any,
    });

    await svc.sharePost('facebook', 'text only', Buffer.from([1, 2, 3]));

    // Only the feed post endpoint hit, no image upload.
    expect(posted).toEqual(['https://fb/feed']);
    // Non-blocking notification emitted.
    expect(events.some((e) => e.type === 'SHARE_IMAGE_UNSUPPORTED')).toBe(true);
    expect(events.some((e) => e.type === 'SHARE_POST_COMPLETE' && e.success === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OAuth callback (Req 35.4)
// ---------------------------------------------------------------------------

describe('OAuth flow', () => {
  it('completes the PKCE code exchange and stores tokens on callback', async () => {
    const store = memoryTokenStore();
    let capturedAuthUrl = '';
    const httpPost: HttpPostFn = async (url, _h, body) => {
      expect(url).toContain('/token');
      expect(body.toString()).toContain('grant_type=authorization_code');
      expect(body.toString()).toContain('code_verifier=');
      return { status: 200, body: JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 7200 }) };
    };
    const events: any[] = [];
    const svc = createSocialShareService({
      tokenStore: store,
      platformConfig: testPlatformConfig(),
      httpPost,
      openBrowser: (u) => { capturedAuthUrl = u; },
      getControlPanelWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: (_c: string, p: any) => events.push(p) },
      }) as any,
    });

    svc.initiateOAuth('twitter');
    expect(capturedAuthUrl).toContain('code_challenge=');
    expect(capturedAuthUrl).toContain('code_challenge_method=S256');

    // Extract the CSRF state the service generated.
    const state = new URL(capturedAuthUrl).searchParams.get('state')!;
    await svc.handleOAuthCallback(`ligacontrol://oauth-callback?code=abc123&state=${state}`);

    expect(store.get('twitter')?.accessToken).toBe('AT');
    expect(events.some((e) => e.type === 'SHARE_OAUTH_COMPLETE' && e.platform === 'twitter')).toBe(true);
  });

  it('rejects a callback whose state does not match a pending session', async () => {
    const events: any[] = [];
    const svc = createSocialShareService({
      tokenStore: memoryTokenStore(),
      platformConfig: testPlatformConfig(),
      httpPost: vi.fn(),
      getControlPanelWindow: () => ({
        isDestroyed: () => false,
        webContents: { send: (_c: string, p: any) => events.push(p) },
      }) as any,
    });
    await svc.handleOAuthCallback('ligacontrol://oauth-callback?code=x&state=forged');
    expect(events.some((e) => e.type === 'SHARE_OAUTH_FAILED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Screenshot capture (Req 35.7)
// ---------------------------------------------------------------------------

describe('captureScreenshot', () => {
  it('delegates to the injected capturer', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const svc = createSocialShareService({
      tokenStore: memoryTokenStore(),
      captureScreenshot: async () => png,
    });
    await expect(svc.captureScreenshot()).resolves.toBe(png);
  });
});

// ---------------------------------------------------------------------------
// Property 38: Share text summary contains all required fields for any game state
// Validates: Requirements 35.2
// ---------------------------------------------------------------------------

describe('Property 38: generateShareText contains all required fields', () => {
  it('contains liga name, both team names, both integer scores, and period/Final', () => {
    // Feature: basketball-scoreboard, Property 38: Share text summary contains all required fields for any game state
    //
    // Validates: Requirements 35.2
    const svc = createSocialShareService({ tokenStore: memoryTokenStore() });

    const nonEmpty = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

    fc.assert(
      fc.property(
        fc.record({
          gamePhase: fc.constantFrom('pre-game', 'in-game', 'post-game') as fc.Arbitrary<GameState['gamePhase']>,
          ligaName: nonEmpty,
          homeName: nonEmpty,
          awayName: nonEmpty,
          homeScore: fc.integer({ min: 0, max: 300 }),
          awayScore: fc.integer({ min: 0, max: 300 }),
          current: fc.integer({ min: 1, max: 12 }),
          format: fc.constantFrom('quarters', 'halves') as fc.Arbitrary<'quarters' | 'halves'>,
          isOvertime: fc.boolean(),
          overtimeNumber: fc.integer({ min: 0, max: 5 }),
        }),
        (r) => {
          const s = DEFAULT_GAME_STATE();
          s.gamePhase = r.gamePhase;
          s.ligaName = r.ligaName;
          s.home.config.name = r.homeName;
          s.away.config.name = r.awayName;
          s.home.score = r.homeScore;
          s.away.score = r.awayScore;
          s.period = {
            current: r.current,
            format: r.format,
            isOvertime: r.isOvertime,
            overtimeNumber: r.overtimeNumber,
          };

          const text = svc.generateShareText(s);

          // Liga + both team names present.
          expect(text).toContain(r.ligaName);
          expect(text).toContain(r.homeName);
          expect(text).toContain(r.awayName);
          // Both integer scores present.
          expect(text).toContain(String(r.homeScore));
          expect(text).toContain(String(r.awayScore));
          // Period label or "Final".
          if (r.gamePhase === 'post-game') {
            expect(text).toContain('Final');
          } else if (r.isOvertime) {
            expect(text).toContain(r.overtimeNumber > 1 ? `OT${r.overtimeNumber}` : 'OT');
          } else {
            const unit = r.format === 'halves' ? 'H' : 'Q';
            expect(text).toContain(`${unit}${r.current}`);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
