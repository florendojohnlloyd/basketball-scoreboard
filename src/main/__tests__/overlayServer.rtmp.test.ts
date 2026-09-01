/**
 * OverlayServer RTMP streaming tests — Requirement 33 (Task 71)
 *
 * Example-based tests covering:
 *  - invalid RTMP URL is rejected and emits an error event
 *  - per-second RTMP_STATUS_UPDATE tick while active
 *  - auto-reconnect capped at 3 attempts, then RTMP_FAILED
 *  - stop clears the status/reconnect timers
 *
 * An injected fake ffmpeg spawner is used so no real ffmpeg binary is needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createOverlayServer,
  isValidRtmpUrl,
  buildRtmpOutputUrl,
  RTMP_MAX_RECONNECT_ATTEMPTS,
  RTMP_RECONNECT_DELAY_MS,
  type OverlayServer,
  resolveFfmpegPath,
  type FfmpegProcess,
  type FfmpegSpawner,
  type RtmpEventHandlers,
} from '../overlayServer';
import type { RtmpConfig, RtmpStatus } from '../../shared/types';
import { join } from 'path';

const OVERLAY_DIR = join(process.cwd(), 'resources', 'overlay');
const VALID_CONFIG: RtmpConfig = { destinationUrl: 'rtmp://live.example.com/app', streamKey: 'secret-key' };

/**
 * A controllable fake ffmpeg spawner. Each spawn records its callbacks so a
 * test can simulate a connection loss by invoking the captured onError.
 */
function makeFakeFfmpeg() {
  const spawns: Array<{
    outputUrl: string;
    onError: (err: Error) => void;
    onEnd: () => void;
    process: FfmpegProcess;
    killed: boolean;
  }> = [];

  const spawner: FfmpegSpawner = ({ outputUrl, onError, onEnd }) => {
    const record = { outputUrl, onError, onEnd, killed: false } as (typeof spawns)[number] & {
      process: FfmpegProcess;
    };
    const process: FfmpegProcess = {
      kill: () => {
        record.killed = true;
      },
    };
    record.process = process;
    spawns.push(record);
    return process;
  };

  return { spawner, spawns };
}

function makeEvents(): { handlers: RtmpEventHandlers; calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {
    onStatusUpdate: [],
    onReconnectAttempt: [],
    onFailed: [],
    onError: [],
  };
  const handlers: RtmpEventHandlers = {
    onStatusUpdate: (s: RtmpStatus) => calls.onStatusUpdate.push([s]),
    onReconnectAttempt: (a: number, m: number) => calls.onReconnectAttempt.push([a, m]),
    onFailed: () => calls.onFailed.push([]),
    onError: (msg: string) => calls.onError.push([msg]),
  };
  return { handlers, calls };
}

describe('OverlayServer RTMP', () => {
  let server: OverlayServer;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // ── URL validation helpers ──

  describe('isValidRtmpUrl', () => {
    it('accepts rtmp:// and rtmps:// URLs', () => {
      expect(isValidRtmpUrl('rtmp://host/app')).toBe(true);
      expect(isValidRtmpUrl('rtmps://host/app')).toBe(true);
    });

    it('rejects non-rtmp URLs', () => {
      expect(isValidRtmpUrl('http://host/app')).toBe(false);
      expect(isValidRtmpUrl('https://host/app')).toBe(false);
      expect(isValidRtmpUrl('ftp://host')).toBe(false);
      expect(isValidRtmpUrl('')).toBe(false);
    });
  });

  describe('buildRtmpOutputUrl', () => {
    it('joins destination and stream key with a single slash', () => {
      expect(buildRtmpOutputUrl({ destinationUrl: 'rtmp://host/app', streamKey: 'key' })).toBe(
        'rtmp://host/app/key',
      );
    });

    it('normalizes redundant slashes', () => {
      expect(buildRtmpOutputUrl({ destinationUrl: 'rtmp://host/app/', streamKey: '/key' })).toBe(
        'rtmp://host/app/key',
      );
    });

    it('returns just the base when the stream key is empty', () => {
      expect(buildRtmpOutputUrl({ destinationUrl: 'rtmp://host/app', streamKey: '' })).toBe(
        'rtmp://host/app',
      );
    });
  });

  // ── Invalid URL rejection ──

  it('rejects an invalid RTMP URL and emits an error event without spawning ffmpeg', () => {
    const { spawner, spawns } = makeFakeFfmpeg();
    const { handlers, calls } = makeEvents();
    server = createOverlayServer({ overlayDir: OVERLAY_DIR, ffmpegSpawner: spawner, rtmpEvents: handlers });

    server.startRtmp({ destinationUrl: 'http://not-rtmp.example.com', streamKey: 'k' });

    expect(spawns).toHaveLength(0);
    expect(calls.onError).toHaveLength(1);
    expect(String(calls.onError[0][0])).toContain('rtmp://');
    const status = server.getRtmpStatus();
    expect(status.active).toBe(false);
    expect(status.error).not.toBeNull();
  });

  // ── Happy path start + status tick ──

  it('spawns ffmpeg with the assembled output URL and marks the stream active', () => {
    const { spawner, spawns } = makeFakeFfmpeg();
    const { handlers } = makeEvents();
    server = createOverlayServer({ overlayDir: OVERLAY_DIR, ffmpegSpawner: spawner, rtmpEvents: handlers });

    server.startRtmp(VALID_CONFIG);

    expect(spawns).toHaveLength(1);
    expect(spawns[0].outputUrl).toBe('rtmp://live.example.com/app/secret-key');
    expect(server.getRtmpStatus().active).toBe(true);
  });

  it('emits RTMP_STATUS_UPDATE every second with incrementing elapsed seconds', () => {
    const { spawner } = makeFakeFfmpeg();
    const { handlers, calls } = makeEvents();
    server = createOverlayServer({ overlayDir: OVERLAY_DIR, ffmpegSpawner: spawner, rtmpEvents: handlers });

    server.startRtmp(VALID_CONFIG);
    // Initial status update on start.
    const initialUpdates = calls.onStatusUpdate.length;

    vi.advanceTimersByTime(3000);

    const tickUpdates = calls.onStatusUpdate.slice(initialUpdates);
    expect(tickUpdates).toHaveLength(3);
    expect((tickUpdates[0][0] as RtmpStatus).elapsedSeconds).toBe(1);
    expect((tickUpdates[1][0] as RtmpStatus).elapsedSeconds).toBe(2);
    expect((tickUpdates[2][0] as RtmpStatus).elapsedSeconds).toBe(3);
    expect(server.getRtmpStatus().elapsedSeconds).toBe(3);
  });

  // ── Reconnect capped at 3 ──

  it('auto-reconnects up to 3 times then emits RTMP_FAILED', () => {
    const { spawner, spawns } = makeFakeFfmpeg();
    const { handlers, calls } = makeEvents();
    server = createOverlayServer({ overlayDir: OVERLAY_DIR, ffmpegSpawner: spawner, rtmpEvents: handlers });

    server.startRtmp(VALID_CONFIG);
    expect(spawns).toHaveLength(1);

    // Simulate connection loss + let each reconnect fire, up to the cap.
    for (let i = 0; i < RTMP_MAX_RECONNECT_ATTEMPTS; i++) {
      // The most recently spawned process drops its connection.
      spawns[spawns.length - 1].onError(new Error(`drop ${i}`));
      // Advance past the reconnect delay to trigger the next attempt.
      vi.advanceTimersByTime(RTMP_RECONNECT_DELAY_MS);
    }

    // 3 reconnect attempts were emitted (1-indexed).
    expect(calls.onReconnectAttempt.map((c) => c[0])).toEqual([1, 2, 3]);
    // The initial spawn + 3 reconnect spawns = 4 total.
    expect(spawns).toHaveLength(1 + RTMP_MAX_RECONNECT_ATTEMPTS);
    // Not yet failed — retries were used but the last one is still "connected".
    expect(calls.onFailed).toHaveLength(0);

    // The final reconnect attempt also drops → exhausted → RTMP_FAILED.
    spawns[spawns.length - 1].onError(new Error('final drop'));

    expect(calls.onFailed).toHaveLength(1);
    // No further reconnect scheduled.
    vi.advanceTimersByTime(RTMP_RECONNECT_DELAY_MS);
    expect(calls.onReconnectAttempt).toHaveLength(RTMP_MAX_RECONNECT_ATTEMPTS);

    const status = server.getRtmpStatus();
    expect(status.active).toBe(false);
    expect(status.error).not.toBeNull();
  });

  it('emits a reconnect warning after each failed attempt', () => {
    const { spawner, spawns } = makeFakeFfmpeg();
    const { handlers, calls } = makeEvents();
    server = createOverlayServer({ overlayDir: OVERLAY_DIR, ffmpegSpawner: spawner, rtmpEvents: handlers });

    server.startRtmp(VALID_CONFIG);
    spawns[spawns.length - 1].onError(new Error('lost'));
    vi.advanceTimersByTime(RTMP_RECONNECT_DELAY_MS);

    expect(calls.onReconnectAttempt).toEqual([[1, RTMP_MAX_RECONNECT_ATTEMPTS]]);
  });

  // ── stop clears interval / reconnect ──

  it('stop clears the status interval so no further updates fire', () => {
    const { spawner } = makeFakeFfmpeg();
    const { handlers, calls } = makeEvents();
    server = createOverlayServer({ overlayDir: OVERLAY_DIR, ffmpegSpawner: spawner, rtmpEvents: handlers });

    server.startRtmp(VALID_CONFIG);
    vi.advanceTimersByTime(2000);
    const countBeforeStop = calls.onStatusUpdate.length;

    server.stopRtmp();
    // stopRtmp emits one final status update.
    const countAfterStop = calls.onStatusUpdate.length;
    expect(countAfterStop).toBe(countBeforeStop + 1);

    // Advancing time should not produce more tick updates.
    vi.advanceTimersByTime(5000);
    expect(calls.onStatusUpdate).toHaveLength(countAfterStop);

    const status = server.getRtmpStatus();
    expect(status.active).toBe(false);
    expect(status.elapsedSeconds).toBe(0);
  });

  it('stop kills the running ffmpeg process', () => {
    const { spawner, spawns } = makeFakeFfmpeg();
    const { handlers } = makeEvents();
    server = createOverlayServer({ overlayDir: OVERLAY_DIR, ffmpegSpawner: spawner, rtmpEvents: handlers });

    server.startRtmp(VALID_CONFIG);
    server.stopRtmp();

    expect(spawns[0].killed).toBe(true);
  });

  it('stop cancels a pending reconnect so it never fires RTMP_FAILED', () => {
    const { spawner, spawns } = makeFakeFfmpeg();
    const { handlers, calls } = makeEvents();
    server = createOverlayServer({ overlayDir: OVERLAY_DIR, ffmpegSpawner: spawner, rtmpEvents: handlers });

    server.startRtmp(VALID_CONFIG);
    // Trigger a connection loss which schedules a reconnect.
    spawns[0].onError(new Error('lost'));

    // Stop before the reconnect delay elapses.
    server.stopRtmp();
    vi.advanceTimersByTime(RTMP_RECONNECT_DELAY_MS * 5);

    expect(calls.onReconnectAttempt).toHaveLength(0);
    expect(calls.onFailed).toHaveLength(0);
    expect(server.getRtmpStatus().active).toBe(false);
  });

  it('ignores connection-loss events emitted after an explicit stop', () => {
    const { spawner, spawns } = makeFakeFfmpeg();
    const { handlers, calls } = makeEvents();
    server = createOverlayServer({ overlayDir: OVERLAY_DIR, ffmpegSpawner: spawner, rtmpEvents: handlers });

    server.startRtmp(VALID_CONFIG);
    server.stopRtmp();

    // A late error from the killed process must not schedule a reconnect.
    spawns[0].onError(new Error('late error'));
    vi.advanceTimersByTime(RTMP_RECONNECT_DELAY_MS);

    expect(calls.onReconnectAttempt).toHaveLength(0);
    expect(calls.onFailed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resolveFfmpegPath — ffmpeg binary path resolution (Task 90)
// ---------------------------------------------------------------------------

describe('resolveFfmpegPath', () => {
  const originalFfmpegPath = process.env.FFMPEG_PATH;

  afterEach(() => {
    if (originalFfmpegPath === undefined) {
      delete process.env.FFMPEG_PATH;
    } else {
      process.env.FFMPEG_PATH = originalFfmpegPath;
    }
  });

  it('returns the FFMPEG_PATH environment override when set', () => {
    process.env.FFMPEG_PATH = '/custom/bin/ffmpeg';
    expect(resolveFfmpegPath()).toBe('/custom/bin/ffmpeg');
  });

  it('returns null (defer to system PATH lookup) when no override or bundled binary exists', () => {
    delete process.env.FFMPEG_PATH;
    // In the test (non-Electron) environment there is no bundled binary, so the
    // resolver defers to fluent-ffmpeg's default PATH lookup by returning null.
    expect(resolveFfmpegPath()).toBeNull();
  });
});
