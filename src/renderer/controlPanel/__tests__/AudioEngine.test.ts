/**
 * Property-based tests for AudioEngine.
 *
 * Feature: basketball-scoreboard
 * Property covered: 24
 *
 * The Web Audio API (AudioContext, GainNode, OscillatorNode) is mocked via
 * Vitest globals so the test runs in jsdom without a real audio device.
 */

import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Web Audio API mocks
// ---------------------------------------------------------------------------

/**
 * A minimal mock GainNode whose gain.value is readable/writable.
 */
function makeMockGainNode() {
  return {
    gain: { value: 0.8 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
}

/**
 * A minimal mock OscillatorNode.
 */
function makeMockOscillatorNode() {
  return {
    type: 'sine',
    frequency: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as null | (() => void),
  }
}

/**
 * Factory that builds a mock AudioContext.
 * Keeps a reference to the last created GainNode so tests can inspect it.
 */
function makeMockAudioContext() {
  const gainNode = makeMockGainNode()
  const oscillatorNode = makeMockOscillatorNode()

  const ctx = {
    state: 'running' as AudioContextState,
    destination: {} as AudioDestinationNode,
    currentTime: 0,
    createGain: vi.fn(() => gainNode),
    createOscillator: vi.fn(() => oscillatorNode),
    resume: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    // Expose internals for assertions
    _gainNode: gainNode,
    _oscillatorNode: oscillatorNode,
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Module reset + fresh import helpers
// ---------------------------------------------------------------------------

/**
 * Installs Web Audio API mocks on globalThis, resets the module registry,
 * then dynamically imports audioEngine.ts so the singleton is constructed
 * with the fresh mocks.
 *
 * Returns both the audioEngine singleton and the mock AudioContext instance
 * (so tests can inspect gainNode.gain.value).
 */
async function loadFreshAudioEngine() {
  // Build the mock context before the module loads
  const mockCtx = makeMockAudioContext()

  // Install mocks on globalThis (jsdom does not provide Web Audio)
  ;(globalThis as unknown as Record<string, unknown>)['AudioContext'] = vi.fn(
    () => mockCtx
  )

  // Mock window.electron so the constructor's IPC calls don't throw
  ;(globalThis as unknown as Record<string, unknown>)['window'] = {
    electron: {
      ipcRenderer: {
        send: vi.fn(),
        on: vi.fn(),
      },
    },
  }

  // Reset the module registry so a fresh singleton is created
  vi.resetModules()

  // Dynamically import the module — the singleton is constructed at import time
  const mod = await import('../audio/audioEngine')

  return { audioEngine: mod.audioEngine, mockCtx }
}

// ---------------------------------------------------------------------------
// Property 24: Volume level maps to gain linearly
// Feature: basketball-scoreboard, Property 24: Volume control maps level to audio gain linearly
// Validates: Requirements 12.4
// ---------------------------------------------------------------------------

/**
 * For any volume level V in [0.0, 1.0], calling audioEngine.setGain(V) must
 * set gainNode.gain.value to exactly V.
 *
 * The implementation clamps the input to [0, 1], so any value already in that
 * range passes through unchanged and maps 1-to-1 to the gain node's value.
 */
test('Property 24 — volume level maps to gain linearly: setGain(V) sets gainNode.gain.value === V for V ∈ [0, 1]', async () => {
  const { audioEngine, mockCtx } = await loadFreshAudioEngine()

  fc.assert(
    fc.property(
      fc.float({ min: 0, max: 1, noNaN: true }),
      (level) => {
        audioEngine.setGain(level)

        // The gain node's value must equal the level exactly (linear mapping)
        expect(mockCtx._gainNode.gain.value).toBe(level)
      }
    ),
    { numRuns: 100 }
  )
})
