# 🧪 Relay Buzzer Testing Guide

## Pre-Testing Checklist

Before starting tests, ensure:
- [ ] USB relay module is connected to computer
- [ ] Relay is wired in NC (Normally Closed) mode
- [ ] Buzzer/siren is properly connected to relay NC terminals
- [ ] Scoreboard app is built successfully (`npm run build` completed)
- [ ] You have access to the Settings tab in the app

---

## Test Suite

### Test 1: Initial Connection ✅

**Objective:** Verify relay can connect successfully via Web Serial API

**Steps:**
1. Launch the Scoreboard application
2. Log in with your credentials
3. Navigate to **Settings** tab
4. Scroll to **⚡ Physical Buzzer Relay** section
5. Click **🔌 Connect USB Relay** button
6. Select USB-Serial device (CH340) from permission dialog
7. Click "Connect"

**Expected Results:**
- Status changes from "Disconnected" to "Connected"
- Port information displayed (e.g., "USB: 0x1a86")
- No error messages shown
- Connection uptime starts counting

**Pass/Fail:** _____

---

### Test 2: Configuration Verification ✅

**Objective:** Verify default configuration matches NC mode and NBA standards

**Steps:**
1. In the Settings tab, locate the relay buzzer configuration
2. Check each setting:
   - Physical Buzzer Status
   - Period End Duration
   - Shot Clock Duration
   - Wiring Mode
   - Trigger checkboxes

**Expected Results:**
- **Status:** RELAY ENABLED (ON) [green button]
- **Period End Duration:** 3.0s (with "NBA Standard: 3.0s" label)
- **Shot Clock Duration:** 1.5s (with "NBA Standard: 1.5s" label)
- **Wiring Mode:** NC (Normally Closed - Inverted)
- **Period End Trigger:** ✅ Checked
- **Shot Clock Trigger:** ✅ Checked
- **Manual Trigger:** ✅ Checked

**Pass/Fail:** _____

---

### Test 3: Manual Buzzer Test ✅

**Objective:** Verify manual trigger works with correct duration

**Steps:**
1. Ensure relay is connected (Test 1 passed)
2. Click **⚡ Test Physical Buzzer Relay** button
3. Observe:
   - Physical buzzer sound
   - Visual indicator near game clock
   - Countdown timer
   - Event log

**Expected Results:**
- Buzzer sounds for **exactly 3.0 seconds**
- Red pulsing indicator appears with "BUZZER ACTIVE" text
- Countdown timer shows 3.0 → 2.9 → ... → 0.0 smoothly
- After 3 seconds, buzzer stops and indicator disappears
- Event appears in diagnostics:
  - Source: MANUAL
  - Duration: 3.0s
  - Status: ✅
  - Timestamp: current time

**Pass/Fail:** _____

---

### Test 4: Period End Automatic Trigger ✅

**Objective:** Verify automatic 3-second buzzer when game clock reaches 00:00

**Steps:**
1. Go to **SCORE** tab (main game control)
2. Set game clock to **00:10** using time editor:
   - Type "00:10" in the MM:SS input field
   - Click "Set Time" button
3. Click **Start** button to start game clock
4. Observe clock countdown: 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0
5. Watch for automatic buzzer trigger at 00:00

**Expected Results:**
- Clock counts down smoothly
- At exactly 00:00:
  - Clock stops automatically
  - Buzzer sounds for **3.0 seconds**
  - Visual indicator appears with countdown
  - "Period End Buzzer Active" or similar shown
- Event logged in diagnostics:
  - Source: PERIOD END
  - Duration: 3.0s
  - Success: ✅

**Pass/Fail:** _____

---

### Test 5: Shot Clock Automatic Trigger ✅

**Objective:** Verify automatic 1.5-second buzzer when shot clock expires

**Steps:**
1. In **SCORE** tab, ensure shot clock is enabled
2. Manually set shot clock to **5 seconds**
   - Use shot clock controls (if available) or
   - Set game config to have short shot clock duration
3. Start the game clock (shot clock should start automatically)
4. Let shot clock count down to 0
5. Observe buzzer trigger

**Expected Results:**
- Shot clock counts down: 5, 4, 3, 2, 1, 0
- At shot clock expiration:
  - Buzzer sounds for **1.5 seconds** (shorter than period end)
  - Game clock auto-stops (dead ball)
  - Visual indicator shows buzzer active
  - Distinct from period end buzzer (shorter duration)
- Event logged in diagnostics:
  - Source: SHOT CLOCK
  - Duration: 1.5s
  - Success: ✅

**Pass/Fail:** _____

---

### Test 6: Visual Indicator Functionality ✅

**Objective:** Verify buzzer status indicator works correctly

**Steps:**
1. Trigger any buzzer (manual, period end, or shot clock)
2. Observe the visual indicator near the game clock

**Expected Results:**
- Indicator appears immediately when buzzer triggers
- Red/orange pulsing background
- White pulsing dot animation
- Countdown timer updates smoothly (e.g., 3.0 → 2.9 → ... → 0.0)
- Label shows "BUZZER: X.Xs" in compact mode
- Indicator disappears immediately when buzzer completes
- No visual glitches or lag

**Pass/Fail:** _____

---

### Test 7: Duration Configuration ✅

**Objective:** Verify custom duration settings work correctly

**Steps:**
1. Go to **Settings** tab → Relay Buzzer section
2. Change **Period End Duration** to **4.0 seconds**
3. Change **Shot Clock Duration** to **2.0 seconds**
4. Trigger manual buzzer test
5. Measure actual duration
6. Set clock to 10s, let it expire, measure duration
7. Trigger shot clock violation, measure duration

**Expected Results:**
- Manual test buzzer sounds for **4.0 seconds** (uses period end duration)
- Period end (00:00) buzzer sounds for **4.0 seconds**
- Shot clock violation buzzer sounds for **2.0 seconds**
- Countdown timers show correct values
- Settings persist after app restart

**Pass/Fail:** _____

---

### Test 8: Enable/Disable Triggers ✅

**Objective:** Verify trigger checkboxes control automatic triggering

**Steps:**
1. In Settings, **uncheck** "Period End Trigger"
2. Set clock to 10s, let it expire
3. Verify NO buzzer sounds
4. **Re-check** "Period End Trigger"
5. Repeat test, verify buzzer sounds
6. **Uncheck** "Shot Clock Trigger"
7. Trigger shot clock violation
8. Verify NO buzzer sounds
9. **Re-check** "Shot Clock Trigger"

**Expected Results:**
- When unchecked, buzzer does NOT trigger for that event type
- When checked, buzzer DOES trigger for that event type
- Manual test always works (unless manual trigger unchecked)
- Visual indicator only appears when buzzer actually sounds
- Console logs show "trigger disabled" messages when unchecked

**Pass/Fail:** _____

---

### Test 9: Diagnostics Panel ✅

**Objective:** Verify event logging and statistics tracking

**Steps:**
1. Clear browser localStorage (optional, for fresh start)
2. Trigger manual buzzer 3 times
3. Trigger period end 2 times (set clock to 5s twice)
4. Trigger shot clock 1 time
5. View diagnostics panel in Settings

**Expected Results:**
- **Statistics:**
  - Manual Triggers: 3
  - Period End Triggers: 2
  - Shot Clock Triggers: 1
  - Connection Uptime: shows minutes
- **Last Trigger:**
  - Shows most recent event details
  - Correct source, duration, and time
- **Event History Table:**
  - Shows all 6 events (most recent first)
  - Each row has: Time, Source, Duration, Status (✅)
  - Table scrollable if more than 10 events
  - All data accurate and matches actual triggers

**Pass/Fail:** _____

---

### Test 10: Connection Test Function ✅

**Objective:** Verify connection test button works

**Steps:**
1. Ensure relay is connected
2. Click **🔍 Test Connection** button in diagnostics section
3. Watch relay LED indicator (should flicker briefly)
4. Observe alert message

**Expected Results:**
- Relay LED flickers ON then OFF quickly (100ms cycle)
- Alert shows "Connection test successful! ✅"
- No errors in console
- Buzzer does NOT sound (test is too fast)
- Connection remains stable after test

**Pass/Fail:** _____

---

### Test 11: USB Disconnect/Reconnect ✅

**Objective:** Verify system handles disconnection gracefully

**Steps:**
1. Connect relay normally
2. Trigger manual buzzer to verify working
3. **Unplug USB cable** while app is running
4. Try to trigger buzzer
5. **Plug USB cable back in**
6. Click Connect button again
7. Test buzzer

**Expected Results:**
- On disconnect:
  - Status changes to "Disconnected"
  - Error message: "Device disconnected"
  - Connection uptime resets to 0
- While disconnected:
  - Manual test button disabled
  - Automatic triggers do not crash app
  - Console shows "Not connected" messages
- On reconnect:
  - Can click Connect button successfully
  - Connection re-established
  - Buzzer works again
  - Connection uptime starts from 0

**Pass/Fail:** _____

---

### Test 12: Settings Persistence ✅

**Objective:** Verify settings save and load correctly across app restarts

**Steps:**
1. Configure custom settings:
   - Period End: 5.0 seconds
   - Shot Clock: 2.5 seconds
   - Uncheck Manual Trigger
2. **Close the app completely**
3. **Reopen the app**
4. Log in and navigate to Settings
5. Check all configuration values

**Expected Results:**
- All custom settings preserved:
  - Period End Duration: 5.0s
  - Shot Clock Duration: 2.5s
  - Manual Trigger: ❌ Unchecked
  - Other settings unchanged
- Connection NOT automatically established (requires manual reconnect)
- Event history cleared (stored in session, not persisted)
- Statistics reset to 0 (fresh session)

**Pass/Fail:** _____

---

### Test 13: Multiple Rapid Triggers ✅

**Objective:** Verify system handles rapid successive triggers correctly

**Steps:**
1. Set clock to 3 seconds
2. Start clock
3. When buzzer triggers at 00:00:
   - Immediately click Manual Test button
   - Or immediately set clock to 3s again and start
4. Observe behavior

**Expected Results:**
- First buzzer completes its full duration OR
- First buzzer is interrupted and second buzzer starts immediately
- No relay command conflicts
- No crashes or errors
- Visual indicator updates correctly
- All events logged separately in history
- System remains stable

**Pass/Fail:** _____

---

### Test 14: Wiring Mode Switch ✅

**Objective:** Verify switching between NO and NC modes works

**Steps:**
1. Connect relay in NC mode (current configuration)
2. Click Manual Test
3. Verify buzzer sounds
4. Change Wiring Mode to **NO**
5. Click Manual Test again
6. Observe behavior
7. Change back to **NC**
8. Test again

**Expected Results:**
- **In NC mode:** Buzzer sounds correctly
- **After switching to NO:** 
  - If wiring is actually NC, buzzer behavior inverts (silent when should sound)
  - This test verifies software correctly sends opposite commands
- **After switching back to NC:** Buzzer sounds correctly again
- No errors during mode switches
- Idle state updates immediately when mode changed

**Note:** This test verifies software control. Actual buzzer behavior depends on physical wiring.

**Pass/Fail:** _____

---

### Test 15: Flask Server Independence ✅

**Objective:** Verify Flask server can control relay as backup

**Steps:**
1. **Disconnect** relay from Scoreboard app
2. Open terminal/command prompt
3. Navigate to Flask server directory:
   ```
   cd "c:\Users\flore\OneDrive\Desktop\System\Jaloy system\Relay Automatic"
   ```
4. Run Flask server:
   ```
   python web_server.py
   ```
5. Open browser to `http://localhost:5000`
6. Test relay control from Flask interface

**Expected Results:**
- Flask server starts successfully
- Web interface loads
- Can connect to relay from Flask UI
- Manual SIREN ON/OFF buttons work
- Relay controls buzzer correctly
- Scoreboard app and Flask can both control relay (when not simultaneously connected)

**Pass/Fail:** _____

---

## Test Results Summary

| Test # | Test Name | Pass/Fail | Notes |
|--------|-----------|-----------|-------|
| 1 | Initial Connection | _____ | |
| 2 | Configuration Verification | _____ | |
| 3 | Manual Buzzer Test | _____ | |
| 4 | Period End Trigger | _____ | |
| 5 | Shot Clock Trigger | _____ | |
| 6 | Visual Indicator | _____ | |
| 7 | Duration Configuration | _____ | |
| 8 | Enable/Disable Triggers | _____ | |
| 9 | Diagnostics Panel | _____ | |
| 10 | Connection Test | _____ | |
| 11 | Disconnect/Reconnect | _____ | |
| 12 | Settings Persistence | _____ | |
| 13 | Rapid Triggers | _____ | |
| 14 | Wiring Mode Switch | _____ | |
| 15 | Flask Server | _____ | |

**Total Passed:** _____ / 15  
**Total Failed:** _____ / 15

---

## Issue Reporting Template

If any test fails, document using this template:

```
**Test Number:** ___
**Test Name:** ___________
**Date/Time:** ___________
**Tester:** ___________

**Issue Description:**
[What went wrong?]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Result:**
[What should have happened]

**Actual Result:**
[What actually happened]

**Screenshots/Logs:**
[Attach if available]

**Workaround:**
[If any workaround was found]

**Severity:** Critical / High / Medium / Low
```

---

## Performance Benchmarks

Record these metrics during testing:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Manual trigger response time | < 100ms | _____ | _____ |
| Auto trigger delay at 00:00 | < 200ms | _____ | _____ |
| Visual indicator lag | < 50ms | _____ | _____ |
| Countdown timer accuracy | ± 0.1s | _____ | _____ |
| Connection time | < 2s | _____ | _____ |
| Settings save time | < 100ms | _____ | _____ |

---

## Sign-Off

**Tested By:** _____________________  
**Date:** _____________________  
**Signature:** _____________________

**Approved By:** _____________________  
**Date:** _____________________  
**Signature:** _____________________

---

## Notes

Use this space for additional observations, recommendations, or comments:

_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________

---

**Document Version:** 1.0  
**Last Updated:** October 16, 2026
