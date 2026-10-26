# 📢 Relay Buzzer Setup Guide

## Overview
This guide will help you set up the automatic physical buzzer/siren system that triggers when the game clock reaches 00:00 or when the shot clock expires. The system uses a USB relay module connected to your computer to control a physical buzzer or siren.

---

## 🔧 Hardware Requirements

### Required Equipment
1. **USB Relay Module** - LCUS-1 compatible (CH340/USB-Serial chip)
2. **Physical Buzzer/Siren** - Connected to the relay's NC (Normally Closed) terminals
3. **USB Cable** - To connect relay module to computer
4. **Power Supply** - For the buzzer/siren (if required)

### Wiring Configuration
Your system uses **NC (Normally Closed)** wiring mode:
- **Relay OFF** → NC circuit **CLOSED** → Buzzer **SOUNDS** 🔊
- **Relay ON** → NC circuit **OPEN** → Buzzer **SILENT** 🔇

**Physical Connections:**
```
Power Supply (+) → Buzzer (+)
Buzzer (−) → Relay NC Terminal
Relay COM Terminal → Power Supply (−)
```

---

## 🚀 First-Time Setup

### Step 1: Connect Hardware
1. Plug the USB relay module into your computer's USB port
2. Windows should automatically detect it as a USB-Serial device (CH340 driver)
3. Verify the relay LED indicator lights up

### Step 2: Open Scoreboard App
1. Launch the **Basketball Scoreboard** application (LigaControl)
2. Log in with your credentials
3. Start or load a game to access the Control Panel

### Step 3: Access Relay Buzzer Settings
1. Click on the **SETTINGS** tab in the Control Panel
2. Scroll down to find the **⚡ Physical Buzzer Relay** section
3. You should see "Disconnected" status initially

### Step 4: Connect to Relay
1. Click the **🔌 Connect USB Relay** button
2. A browser permission dialog will appear asking to select a serial port
3. Select the USB-Serial device (usually shows "USB-SERIAL CH340")
4. Click "Connect" in the permission dialog
5. The status should change to **Connected** with port information

> **Note:** The browser will remember your selection, so you won't need to do this every time.

---

## ⚙️ Configuration

### Buzzer Duration Settings

The system now supports **NBA-standard** buzzer durations:

#### Period End Buzzer
- **Default:** 3.0 seconds (NBA standard)
- **Range:** 0.5 - 10.0 seconds
- **When it triggers:** When game clock reaches 00:00
- **Slider:** "🏀 Period End Buzzer Duration"

#### Shot Clock Buzzer  
- **Default:** 1.5 seconds (NBA standard)
- **Range:** 0.5 - 10.0 seconds
- **When it triggers:** When shot clock expires
- **Slider:** "⏱️ Shot Clock Buzzer Duration"

**To adjust durations:**
1. Use the sliders in the settings panel
2. Changes are saved automatically
3. Test the buzzer to verify the duration

### Wiring Mode
- **Current Setting:** NC (Normally Closed) - Inverted
- **Don't change this** unless your physical wiring is different
- If the buzzer sounds when it shouldn't, try switching between NO and NC modes

### Trigger Events

Control when the buzzer automatically triggers:

| Trigger | Default | Description |
|---------|---------|-------------|
| **🏀 Game Clock Period End (00:00)** | ✅ Enabled | Automatic 3-second buzzer when time expires |
| **⏱️ Shot Clock Violation** | ✅ Enabled | Automatic 1.5-second horn when shot clock expires |
| **📢 Manual Buzzer / Horn Button** | ✅ Enabled | Manual trigger from control panel |

**To enable/disable:**
- Simply check or uncheck the boxes for each trigger type
- Changes take effect immediately

---

## 🧪 Testing

### Manual Test
1. Ensure relay status shows **Connected**
2. Click the **⚡ Test Physical Buzzer Relay** button
3. You should hear the buzzer sound for the configured period end duration (default 3.0 seconds)
4. Visual indicator will show "BUZZER ACTIVE" with a countdown

### Live Game Test

#### Test Period End Buzzer:
1. Start a new game or open control panel
2. Set game clock to **10 seconds** (use the time editor: type "00:10" and click "Set Time")
3. Click **Start** button
4. Watch the clock count down
5. At **00:00**, the buzzer should automatically sound for **3 seconds**
6. Visual indicator will show with countdown

#### Test Shot Clock Buzzer:
1. Ensure shot clock is enabled in game config
2. Set shot clock to **5 seconds** using shot clock controls
3. Start the game clock (shot clock starts automatically)
4. Let the shot clock count down to 0
5. You should hear a **1.5-second** horn
6. Game clock should auto-stop (dead ball situation)

### Visual Feedback
When the buzzer is active, you'll see:
- 🔴 Red pulsing indicator near the game clock
- Countdown timer showing remaining buzzer time
- "BUZZER ACTIVE" label

---

## 🔍 Troubleshooting

### "Permission Denied" Error
**Problem:** Can't connect to relay, permission dialog doesn't appear  
**Solutions:**
- Close and reopen the Scoreboard app
- Try a different USB port
- Check Windows Device Manager to verify CH340 driver is installed
- Restart your computer

### "No Sound" from Buzzer
**Problem:** Relay connects but no sound when triggered  
**Solutions:**
1. **Check physical wiring:** Verify buzzer is connected to NC terminals
2. **Test with Flask server:** Use the backup manual control (see below)
3. **Verify wiring mode:** Try switching between NO and NC in settings
4. **Check relay LED:** The relay module's LED should change state when triggered
5. **Power supply:** Ensure buzzer has adequate power

### Wrong Duration
**Problem:** Buzzer sounds too long or too short  
**Solutions:**
- Check duration settings in Settings tab
- Verify Period End Duration and Shot Clock Duration are set correctly
- Save settings and test again

### Doesn't Trigger Automatically
**Problem:** Manual test works but automatic triggers don't  
**Solutions:**
- Check that triggers are enabled (checkboxes in settings)
- Verify "Physical Buzzer Status" is set to **RELAY ENABLED (ON)**
- Check if buzzer is still connected (status shows "Connected")
- Try disconnecting and reconnecting the relay

### Buzzer Sounds at Wrong Time
**Problem:** Buzzer triggers when it shouldn't  
**Solutions:**
- Verify wiring mode is set to **NC** (not NO)
- Check that the correct trigger events are enabled
- If using shot clock, ensure it's properly configured

---

## 🔄 Flask Server Backup Control

### What is it?
The Flask relay server is a standalone web interface for manual relay control, useful for:
- Testing relay hardware independently
- Backup control when Scoreboard app isn't running
- Debugging connection issues

### How to Use:
1. Open a terminal/command prompt
2. Navigate to: `C:\Users\flore\OneDrive\Desktop\System\Jaloy system\Relay Automatic`
3. Run: `python web_server.py`
4. Open browser to: `http://localhost:5000`
5. Use the web interface to manually control the relay

**Note:** You may need to disconnect from the Scoreboard app first if both are trying to use the same relay.

---

## 📊 NBA Buzzer Duration Reference

### Official NBA Standards:
- **End of Period/Quarter Buzzer:** ~3.0 seconds (long, sustained)
- **End of Game Buzzer:** ~3.0 seconds (same as period end)
- **Shot Clock Violation Horn:** ~1.5 seconds (shorter, distinct)
- **Timeout Horn:** ~1.0 second (brief)

### This Implementation:
- **Period End:** 3.0 seconds ✅
- **Shot Clock:** 1.5 seconds ✅
- **Manual Horn:** 3.0 seconds (uses period end duration)

---

## 🎯 Quick Reference

### Connection Status Indicators:
| Status | Meaning |
|--------|---------|
| 🟢 **Connected** | Relay ready, will trigger automatically |
| 🔴 **Disconnected** | No relay connected, click Connect button |
| 🟡 **Connecting...** | Attempting to establish connection |
| 🔴 **BUZZER ACTIVE** | Buzzer is currently sounding |

### Button Functions:
| Button | Function |
|--------|----------|
| **🔌 Connect USB Relay** | Opens serial port selection dialog |
| **⚡ Test Physical Buzzer Relay** | Manual test (uses period end duration) |
| **🔌 Disconnect Relay** | Closes serial port connection |

### Keyboard Shortcuts:
- No specific keyboard shortcuts for relay control
- Use mouse/touch to interact with buttons

---

## 💡 Tips & Best Practices

1. **Keep USB cable secure** - Avoid accidental disconnection during games
2. **Test before games** - Always run a test before live matches
3. **Monitor connection status** - Check the indicator remains green
4. **Backup plan** - Keep Flask server available as fallback
5. **Volume control** - Adjust physical buzzer volume at the buzzer unit, not in software
6. **Multiple games** - Relay connection persists across game sessions
7. **Power cycles** - Relay resets to silent state when powered off

---

## 🆘 Getting Help

### Contact Support:
- Check app documentation in `PAANO_GAMITIN.md`
- Review release notes for updates
- Contact system administrator

### Diagnostic Information:
When reporting issues, provide:
- Relay connection status
- USB device info (from Device Manager)
- Error messages (if any)
- Event log from diagnostics panel
- What you were doing when the issue occurred

---

## 📝 Version History

### Current Version (v1.0.0+)
- ✅ Differential NBA-standard buzzer durations
- ✅ Period end: 3.0 seconds
- ✅ Shot clock: 1.5 seconds
- ✅ NC wiring mode support
- ✅ Visual buzzer status indicator with countdown
- ✅ Automatic triggers on game events
- ✅ Manual test button
- ✅ Web Serial API integration

---

## ✅ Checklist

Use this checklist before each game:

- [ ] USB relay module plugged in
- [ ] Scoreboard app opened and logged in
- [ ] Relay status shows "Connected"
- [ ] Wiring mode set to "NC"
- [ ] Period end trigger enabled
- [ ] Shot clock trigger enabled (if using shot clock)
- [ ] Period end duration: 3.0s
- [ ] Shot clock duration: 1.5s
- [ ] Manual test successful
- [ ] Visual indicator working

---

**Last Updated:** October 16, 2026  
**Document Version:** 1.0
