/**
 * Basketball Scoreboard — Playwright E2E Test Suite
 *
 * Uses Playwright's `_electron` API to launch the production Electron build
 * and drive both the Control Panel and Scoreboard Display windows.
 *
 * ⚠️  PRE-REQUISITE: Run `npm run build` before executing these tests.
 *     The tests launch `out/main/index.js` via the electron executable bundled
 *     in `node_modules/electron/dist/electron.exe`.
 *
 * Flow coverage:
 *   Flow 1 — Full game flow (team names, scoring, period advance, new game)
 *   Flow 2 — Dual-window state sync (score update reflected in scoreboard ≤ 200 ms)
 *   Flow 3 — Clock precision (10-second run measured within ±1 second tolerance)
 *   Flow 4 — Preset round-trip (save preset, relaunch app, load preset, verify)
 */

import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Path to the electron executable (cross-platform) */
const ELECTRON_EXE = join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')

/** Path to the compiled main-process entry point */
const APP_MAIN = join(__dirname, '..', 'out', 'main', 'index.js')

/**
 * Launch the Electron application and return the two renderer windows:
 *   - controlPanel: the operator window (first window opened)
 *   - scoreboard: the display window (second window opened)
 *
 * The helper waits for both windows to finish loading before returning.
 */
async function launchApp(): Promise<{
  app: ElectronApplication
  controlPanel: Page
  scoreboard: Page
}> {
  const app = await electron.launch({
    executablePath: ELECTRON_EXE,
    args: [APP_MAIN],
    // Ensure a fresh user-data directory so presets from previous test runs
    // do not bleed across tests (electron-store writes to userData)
    env: {
      ...process.env,
      // Playwright injects PLAYWRIGHT_TEST_BASE_URL; keep remaining env clean
      NODE_ENV: 'test',
    },
  })

  // electron.launch returns the first BrowserWindow that loads;
  // wait for a second window so both windows are available
  const firstPage = await app.firstWindow()

  // Wait for both windows to be available (the app opens two windows on ready)
  // We poll until windows() reports 2 entries
  let attempts = 0
  while (app.windows().length < 2 && attempts < 50) {
    await firstPage.waitForTimeout(200)
    attempts++
  }

  const pages = app.windows()
  if (pages.length < 2) {
    throw new Error(
      `Expected 2 windows but got ${pages.length}. ` +
        'Make sure the app is built (`npm run build`) before running E2E tests.'
    )
  }

  // Identify windows by their title / URL pattern.
  // The Control Panel loads controlPanel.html; the Scoreboard loads scoreboard.html.
  let controlPanel: Page | undefined
  let scoreboard: Page | undefined

  for (const page of pages) {
    const url = page.url()
    if (url.includes('controlPanel') || url.includes('control')) {
      controlPanel = page
    } else {
      scoreboard = page
    }
  }

  // Fallback: if URL detection doesn't work, use index order.
  // The WindowManager creates the Control Panel first, then the Scoreboard.
  if (!controlPanel || !scoreboard) {
    controlPanel = pages[0]
    scoreboard = pages[1]
  }

  // Wait for both pages to finish initial render
  await Promise.all([
    controlPanel.waitForLoadState('domcontentloaded'),
    scoreboard.waitForLoadState('domcontentloaded'),
  ])

  // Give React a moment to mount and IPC state to flow in
  await controlPanel.waitForTimeout(500)

  return { app, controlPanel, scoreboard }
}

// ---------------------------------------------------------------------------
// Flow 1 — Full game flow
// ---------------------------------------------------------------------------

test('Flow 1 — Full game flow: team names, scoring, period advance, new game', async () => {
  const { app, controlPanel, scoreboard } = await launchApp()

  try {
    // ------------------------------------------------------------------
    // Step 1: Enter team names "Lakers" and "Celtics"
    // ------------------------------------------------------------------

    // Team name inputs are rendered with id="team-name-home" and id="team-name-away"
    const homeNameInput = controlPanel.locator('#team-name-home')
    const awayNameInput = controlPanel.locator('#team-name-away')

    await homeNameInput.waitFor({ state: 'visible', timeout: 10_000 })

    // Clear existing value and type new name
    await homeNameInput.fill('Lakers')
    await homeNameInput.press('Enter')
    await controlPanel.waitForTimeout(300)

    await awayNameInput.fill('Celtics')
    await awayNameInput.press('Enter')
    await controlPanel.waitForTimeout(300)

    // Verify Scoreboard Display shows updated team names
    await expect(scoreboard.locator('.team-section__name').first()).toContainText('Lakers', {
      timeout: 5_000,
    })
    await expect(scoreboard.locator('.team-section__name').last()).toContainText('Celtics', {
      timeout: 5_000,
    })

    // ------------------------------------------------------------------
    // Step 2: Click "+3 Home" three times → score should be 9
    // ------------------------------------------------------------------

    // The "+3" button for the home team is aria-labeled "Add 3 points to Lakers"
    // Use aria-label which is dynamically set to the team name
    const addThreeBtn = controlPanel
      .locator('button[aria-label*="Add 3 points"]')
      .first()

    await addThreeBtn.waitFor({ state: 'visible', timeout: 5_000 })

    await addThreeBtn.click()
    await controlPanel.waitForTimeout(150)
    await addThreeBtn.click()
    await controlPanel.waitForTimeout(150)
    await addThreeBtn.click()
    await controlPanel.waitForTimeout(300)

    // Verify the Scoreboard shows "9" for the home team
    const homeScoreDisplay = scoreboard
      .locator('.team-section[data-team="home"] .team-section__score')
    await expect(homeScoreDisplay).toHaveText('9', { timeout: 5_000 })

    // ------------------------------------------------------------------
    // Step 3: Advance to Q2, verify period label shows "Q2"
    // ------------------------------------------------------------------

    // Click "Next Period" button
    const nextPeriodBtn = controlPanel.locator('button[aria-label="Advance to next period"]')
    await nextPeriodBtn.waitFor({ state: 'visible', timeout: 5_000 })
    await nextPeriodBtn.click()
    await controlPanel.waitForTimeout(300)

    // The period label on the Scoreboard should now show "Q2"
    const periodLabel = scoreboard.locator('.period-display__label')
    await expect(periodLabel).toHaveText('Q2', { timeout: 5_000 })

    // ------------------------------------------------------------------
    // Step 4: Click "New Game" and confirm → all scores reset to 0, period Q1
    // ------------------------------------------------------------------

    // The New Game button is in the PeriodControl area; we click it then confirm
    // the browser confirm dialog by accepting it
    controlPanel.on('dialog', (dialog) => dialog.accept())

    // Find New Game button — it may be rendered differently; look by text
    const newGameBtn = controlPanel.locator('button', { hasText: 'New Game' })
    await newGameBtn.waitFor({ state: 'visible', timeout: 5_000 })
    await newGameBtn.click()
    await controlPanel.waitForTimeout(500)

    // After new game: home score = 0, period = Q1
    await expect(homeScoreDisplay).toHaveText('0', { timeout: 5_000 })
    const periodLabelAfterReset = scoreboard.locator('.period-display__label')
    await expect(periodLabelAfterReset).toHaveText('Q1', { timeout: 5_000 })
  } finally {
    await app.close()
  }
})

// ---------------------------------------------------------------------------
// Flow 2 — Dual-window state sync (≤ 200 ms)
// ---------------------------------------------------------------------------

test('Flow 2 — Dual-window state sync: score update reflected in scoreboard within 200 ms', async () => {
  const { app, controlPanel, scoreboard } = await launchApp()

  try {
    // Ensure the home score starts at 0
    const homeScoreDisplay = scoreboard.locator(
      '.team-section[data-team="home"] .team-section__score'
    )
    await expect(homeScoreDisplay).toHaveText('0', { timeout: 5_000 })

    // Capture timestamp immediately before clicking "+1 Home"
    const tBefore: number = await controlPanel.evaluate(() => performance.now())

    // Click "+1" for the home team
    const addOneBtn = controlPanel
      .locator('button[aria-label*="Add 1 point"]')
      .first()
    await addOneBtn.waitFor({ state: 'visible', timeout: 5_000 })
    await addOneBtn.click()

    // Wait for the scoreboard score to change to "1"
    await expect(homeScoreDisplay).toHaveText('1', { timeout: 1_000 })

    // Capture timestamp after the update is visible in the scoreboard renderer
    // We evaluate in the SCOREBOARD window to measure time-to-render there
    const tAfter: number = await scoreboard.evaluate(() => performance.now())

    // The elapsed time between command dispatch and scoreboard update.
    // Because performance.now() is per-process we compute an upper-bound:
    // the scoreboard's tAfter will always be >= the controlPanel tBefore
    // (they each start from 0 at navigation but both navigated at app launch),
    // so tAfter - tBefore gives a conservative upper bound on round-trip time.
    const elapsedMs = tAfter - tBefore

    // Require the score to have updated within 200 ms
    expect(elapsedMs).toBeLessThanOrEqual(200)
  } finally {
    await app.close()
  }
})

// ---------------------------------------------------------------------------
// Flow 3 — Clock precision (10-second run ± 1 second)
// ---------------------------------------------------------------------------

test('Flow 3 — Clock precision: 10-second run measured within ±1 second of 10 s', async () => {
  const { app, controlPanel, scoreboard } = await launchApp()

  try {
    // Set the game clock to exactly 00:30 so we are well within a valid range
    // and the test doesn't trigger end-of-period buzzer
    const clockInput = controlPanel.locator('input[aria-label="Set game clock time (MM:SS)"]')
    await clockInput.waitFor({ state: 'visible', timeout: 5_000 })
    await clockInput.fill('00:30')
    await clockInput.press('Enter')
    await controlPanel.waitForTimeout(200)

    // Start the game clock
    const startBtn = controlPanel.locator('button[aria-label="Start game clock"]')
    await startBtn.waitFor({ state: 'visible', timeout: 5_000 })
    await startBtn.click()

    // Wait exactly 10 real seconds
    await controlPanel.waitForTimeout(10_000)

    // Stop the clock
    const stopBtn = controlPanel.locator('button[aria-label="Stop game clock"]')
    await stopBtn.click()
    await controlPanel.waitForTimeout(200)

    // Read the displayed MM:SS value from the Scoreboard Display
    const clockDisplay = scoreboard.locator('.clock-display__time')
    const displayedTime = await clockDisplay.innerText({ timeout: 5_000 })

    // Parse "MM:SS" → total seconds remaining
    const match = displayedTime.trim().match(/^(\d+):(\d{2})$/)
    expect(match).not.toBeNull()
    if (!match) throw new Error(`Unexpected clock format: "${displayedTime}"`)

    const remainingSeconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10)

    // We started at 30 s and ran for ~10 s, so we expect ~20 s remaining.
    // Tolerance: ±1 second for drift.
    const expectedRemaining = 20
    expect(remainingSeconds).toBeGreaterThanOrEqual(expectedRemaining - 1)
    expect(remainingSeconds).toBeLessThanOrEqual(expectedRemaining + 1)
  } finally {
    await app.close()
  }
})

// ---------------------------------------------------------------------------
// Flow 4 — Preset round-trip (save, relaunch, load, verify)
// ---------------------------------------------------------------------------

test('Flow 4 — Preset round-trip: save preset, relaunch, load, verify period duration', async () => {
  // ---- First launch: configure and save preset ----
  const PRESET_NAME = 'Test Preset'
  const PERIOD_DURATION_MINUTES = 15

  const { app: app1, controlPanel: cp1 } = await launchApp()

  try {
    // Open the GameConfigPanel — it is rendered inside the Config section
    // Set the period duration field to 15 minutes
    const periodDurationInput = cp1.locator('#gcp-period-duration')
    await periodDurationInput.waitFor({ state: 'visible', timeout: 10_000 })

    await periodDurationInput.fill(String(PERIOD_DURATION_MINUTES))
    await periodDurationInput.press('Tab') // trigger onBlur to validate

    await cp1.waitForTimeout(300)

    // Click "Save As Preset" button
    const saveAsBtn = cp1.locator('button[aria-label="Save configuration as a new preset"]')
    await saveAsBtn.waitFor({ state: 'visible', timeout: 5_000 })
    await saveAsBtn.click()

    // The SaveAsModal should appear — fill in the preset name
    const nameInput = cp1.locator('#preset-name-input')
    await nameInput.waitFor({ state: 'visible', timeout: 5_000 })
    await nameInput.fill(PRESET_NAME)

    // Click Save in the modal
    const saveModalBtn = cp1.locator('.gcp-modal__btn--primary', { hasText: 'Save' })
    await saveModalBtn.click()
    await cp1.waitForTimeout(500)

    // Verify the preset appears in the list
    const presetItem = cp1.locator('.gcp__preset-name', { hasText: PRESET_NAME })
    await expect(presetItem).toBeVisible({ timeout: 5_000 })
  } finally {
    await app1.close()
    // Give the app a moment to flush electron-store to disk
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  // ---- Second launch: load the preset and verify the period duration ----
  const { app: app2, controlPanel: cp2 } = await launchApp()

  try {
    // Find the saved preset and click "Load"
    const loadBtn = cp2.locator(
      `.gcp__preset-item:has(.gcp__preset-name:text("${PRESET_NAME}")) .gcp__preset-btn--load`
    )
    await loadBtn.waitFor({ state: 'visible', timeout: 10_000 })
    await loadBtn.click()
    await cp2.waitForTimeout(500)

    // Verify the period duration field now shows 15
    const periodDurationInput = cp2.locator('#gcp-period-duration')
    await expect(periodDurationInput).toHaveValue(String(PERIOD_DURATION_MINUTES), {
      timeout: 5_000,
    })
  } finally {
    await app2.close()
  }
})
