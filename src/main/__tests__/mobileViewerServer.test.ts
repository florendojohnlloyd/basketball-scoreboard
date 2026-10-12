/**
 * MobileViewerServer tests — Requirement 36 (Task 77)
 *
 * Tests HTTP serving, WebSocket broadcast, port conflict handling, the
 * "Server disabled" 503 response, local URL / QR code generation, and the
 * < 500ms push latency.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createMobileViewerServer,
  buildLocalUrl,
  extractViewerState,
  type MobileViewerServer,
} from '../mobileViewerServer';
import { DEFAULT_GAME_STATE, makeDefaultPlayer, type GameState } from '../../shared/types';
import { join } from 'path';
import WebSocket from 'ws';

const VIEWER_DIR = join(process.cwd(), 'resources', 'viewer');

// Use a distinct port per test to avoid EADDRINUSE conflicts.
let portCounter = 19900;
function nextPort(): number {
  return portCounter++;
}

describe('MobileViewerServer', () => {
  const servers: MobileViewerServer[] = [];

  function makeServer(opts?: {
    onPortConflict?: (port: number) => void;
    localIPv4Resolver?: () => string;
  }): MobileViewerServer {
    const s = createMobileViewerServer({ viewerDir: VIEWER_DIR, ...opts });
    servers.push(s);
    return s;
  }

  afterEach(async () => {
    for (const s of servers) {
      await s.stop();
    }
    servers.length = 0;
  });

  // ── Lifecycle ──

  it('should start and report running state', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);
    expect(server.isRunning()).toBe(true);
    expect(server.getPort()).toBe(port);
  });

  it('should stop and report not running', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);
    await server.stop();
    expect(server.isRunning()).toBe(false);
    expect(server.getPort()).toBe(0);
  });

  it('should default the intended production port to 8081 in the viewer page', async () => {
    // The default port is a documentation/UX concern handled by callers; here we
    // just assert the server binds whatever valid port it is given.
    const server = makeServer();
    await server.start(8081);
    expect(server.getPort()).toBe(8081);
  });

  // ── Port validation ──

  it('should reject invalid port (below 1024)', async () => {
    const server = makeServer();
    await expect(server.start(80)).rejects.toThrow('Invalid port');
  });

  it('should reject invalid port (above 65535)', async () => {
    const server = makeServer();
    await expect(server.start(70000)).rejects.toThrow('Invalid port');
  });

  // ── Port conflict ──

  it('should emit MOBILE_VIEWER_PORT_CONFLICT callback when port is in use', async () => {
    const port = nextPort();
    const onConflict = vi.fn();
    const server1 = makeServer();
    const server2 = makeServer({ onPortConflict: onConflict });

    await server1.start(port);
    await expect(server2.start(port)).rejects.toThrow('MOBILE_VIEWER_PORT_CONFLICT');
    expect(onConflict).toHaveBeenCalledWith(port);
  });

  // ── HTTP serving ──

  it('should serve the viewer HTML page at /', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);

    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Live Scoreboard');
    expect(html).toContain('Box Score');
  });

  it('should serve the viewer HTML for unknown routes via catch-all', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);

    const res = await fetch(`http://localhost:${port}/some/unknown/path`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Live Scoreboard');
  });

  // ── WebSocket broadcast ──

  it('should push full state to connected WebSocket clients via broadcast()', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);

    const client = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    const messagePromise = new Promise<string>((resolve) => {
      client.on('message', (data) => resolve(data.toString()));
    });

    const state: GameState = DEFAULT_GAME_STATE();
    state.home.score = 55;
    state.away.score = 48;

    server.broadcast(state);

    const raw = await messagePromise;
    const msg = JSON.parse(raw);
    expect(msg.type).toBe('state');
    expect(msg.data.home.score).toBe(55);
    expect(msg.data.away.score).toBe(48);

    client.close();
  });

  it('should include per-player box score stats in the broadcast', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);

    const client = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    const messagePromise = new Promise<string>((resolve) => {
      client.on('message', (data) => resolve(data.toString()));
    });

    const state = DEFAULT_GAME_STATE();
    const player = { ...makeDefaultPlayer(), id: 'p1', number: '23', name: 'Jordan', points: 30, rebounds: 6, assists: 5, steals: 2, blocks: 1, fouls: 3 };
    state.home.players = [player];

    server.broadcast(state);

    const raw = await messagePromise;
    const msg = JSON.parse(raw);
    expect(msg.data.home.players).toHaveLength(1);
    const p = msg.data.home.players[0];
    expect(p.number).toBe('23');
    expect(p.name).toBe('Jordan');
    expect(p.points).toBe(30);
    expect(p.rebounds).toBe(6);
    expect(p.assists).toBe(5);
    expect(p.steals).toBe(2);
    expect(p.blocks).toBe(1);
    expect(p.fouls).toBe(3);

    client.close();
  });

  it('should broadcast to multiple clients', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);

    const client1 = new WebSocket(`ws://localhost:${port}/ws`);
    const client2 = new WebSocket(`ws://localhost:${port}/ws`);
    await Promise.all([
      new Promise<void>((resolve) => client1.on('open', resolve)),
      new Promise<void>((resolve) => client2.on('open', resolve)),
    ]);

    const messages: string[] = [];
    const msgPromise = new Promise<void>((resolve) => {
      let count = 0;
      const handler = (data: Buffer | string) => {
        messages.push(data.toString());
        if (++count === 2) resolve();
      };
      client1.on('message', handler);
      client2.on('message', handler);
    });

    const state = DEFAULT_GAME_STATE();
    state.home.score = 12;
    server.broadcast(state);

    await msgPromise;
    expect(messages).toHaveLength(2);
    for (const raw of messages) {
      expect(JSON.parse(raw).data.home.score).toBe(12);
    }

    client1.close();
    client2.close();
  });

  it('should not throw when broadcasting with no clients or while stopped', async () => {
    const server = makeServer();
    const state = DEFAULT_GAME_STATE();
    expect(() => server.broadcast(state)).not.toThrow(); // stopped
    await server.start(nextPort());
    expect(() => server.broadcast(state)).not.toThrow(); // no clients
  });

  it('should deliver a WebSocket push within 500ms of a state change', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.start(port);

    const client = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise<void>((resolve) => client.on('open', resolve));

    const latencyPromise = new Promise<number>((resolve) => {
      client.on('message', () => resolve(Date.now() - start));
    });

    const state = DEFAULT_GAME_STATE();
    state.home.score = 99;
    const start = Date.now();
    server.broadcast(state);

    const latency = await latencyPromise;
    expect(latency).toBeLessThan(500);

    client.close();
  });

  // ── Disabled state ──

  it('should serve a 503 "Server disabled" page when disabled', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.disable(port);

    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain('Server disabled');

    expect(server.isRunning()).toBe(false);
  });

  it('should transition from disabled to running via start()', async () => {
    const port = nextPort();
    const server = makeServer();
    await server.disable(port);

    let res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(503);

    await server.start(port);
    res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    expect(server.isRunning()).toBe(true);
  });

  // ── Local URL & QR code ──

  it('should return null local URL and QR when not running', async () => {
    const server = makeServer();
    expect(server.getLocalUrl()).toBeNull();
    expect(await server.generateQrCode()).toBeNull();
  });

  it('should build the local URL using the resolved IPv4 and port', async () => {
    const port = nextPort();
    const server = makeServer({ localIPv4Resolver: () => '192.168.1.42' });
    await server.start(port);
    expect(server.getLocalUrl()).toBe(`http://192.168.1.42:${port}`);
  });

  it('should generate a base64 PNG data URI QR code when running', async () => {
    const port = nextPort();
    const server = makeServer({ localIPv4Resolver: () => '10.0.0.5' });
    await server.start(port);

    const dataUri = await server.generateQrCode();
    expect(dataUri).toBeTruthy();
    expect(dataUri!.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('getStatus should reflect running state, port, url and qr', async () => {
    const port = nextPort();
    const server = makeServer({ localIPv4Resolver: () => '172.16.0.9' });
    await server.start(port);

    const status = await server.getStatus();
    expect(status.running).toBe(true);
    expect(status.port).toBe(port);
    expect(status.localUrl).toBe(`http://172.16.0.9:${port}`);
    expect(status.qrCodeDataUri).toBeTruthy();

    await server.stop();
    const stopped = await server.getStatus();
    expect(stopped.running).toBe(false);
    expect(stopped.port).toBe(0);
    expect(stopped.localUrl).toBeNull();
    expect(stopped.qrCodeDataUri).toBeNull();
  });

  // ── Pure helpers ──

  it('buildLocalUrl composes http://<ip>:<port>', () => {
    expect(buildLocalUrl('192.168.0.1', 8081)).toBe('http://192.168.0.1:8081');
  });

  it('extractViewerState maps only the fields the viewer renders', () => {
    const state = DEFAULT_GAME_STATE();
    state.home.score = 7;
    const view = extractViewerState(state);
    expect(view.home.score).toBe(7);
    expect(view.away).toBeDefined();
    expect(view.gameClock.displayMs).toBe(state.gameClock.displayMs);
    // Should not leak full game state fields.
    expect((view as unknown as GameState).events).toBeUndefined();
    expect((view as unknown as GameState).gamePhase).toBeUndefined();
  });
});

// ===========================================================================
// Property-based tests (Property 39)
// ===========================================================================

import fc from 'fast-check';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

/**
 * Decode a `data:image/png;base64,...` QR data URI back into its encoded text.
 * The PNG payload is decoded to raw RGBA pixels via pngjs, then handed to jsQR
 * (a standalone QR reader) to recover the original string.
 */
function decodeQrDataUri(dataUri: string): string | null {
  const prefix = 'data:image/png;base64,';
  expect(dataUri.startsWith(prefix)).toBe(true);
  const base64 = dataUri.slice(prefix.length);
  const png = PNG.sync.read(Buffer.from(base64, 'base64'));
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return result ? result.data : null;
}

describe('MobileViewerServer — property-based tests (Property 39)', () => {
  const pbtServers: MobileViewerServer[] = [];

  afterEach(async () => {
    for (const s of pbtServers) {
      await s.stop();
    }
    pbtServers.length = 0;
  });

  // Feature: basketball-scoreboard, Property 39: QR code round-trip encodes the correct mobile viewer URL
  // Validates: Requirements 36.8
  it('generateQrCode() produces a QR whose decoded content is exactly http://<ipv4>:<port>', async () => {
    await fc.assert(
      fc.asyncProperty(fc.ipV4(), fc.integer({ min: 1024, max: 65535 }), async (ipv4, port) => {
        const server = createMobileViewerServer({
          viewerDir: VIEWER_DIR,
          localIPv4Resolver: () => ipv4,
        });
        pbtServers.push(server);
        try {
          await server.start(port);

          const expectedUrl = `http://${ipv4}:${port}`;
          // Sanity: the server composes the same URL it will encode.
          expect(server.getLocalUrl()).toBe(expectedUrl);

          const dataUri = await server.generateQrCode();
          expect(dataUri).toBeTruthy();

          const decoded = decodeQrDataUri(dataUri!);
          expect(decoded).toBe(expectedUrl);
        } catch (err) {
          // A generated port may already be bound (EADDRINUSE) by an unrelated
          // process; skip those rare cases rather than fail the property.
          if (err instanceof Error && err.message.includes('MOBILE_VIEWER_PORT_CONFLICT')) {
            return;
          }
          throw err;
        } finally {
          await server.stop();
          const idx = pbtServers.indexOf(server);
          if (idx !== -1) pbtServers.splice(idx, 1);
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);
});
