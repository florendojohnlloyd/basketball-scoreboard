# 📘 ELECTRONIC SCOREBOARD SYSTEM — OPERATIONAL USER MANUAL
**Professional Basketball & Volleyball Event Management Suite**  
*Fitness Exclusive Systems & Engineering Directorate*

---

## 1. EXECUTIVE SUMMARY & SYSTEM ARCHITECTURE

The **Fitness Exclusive Electronic Scoreboard Application** is an enterprise-grade, dual-sport event management system engineered for high-visibility sports broadcasts and live arena presentations. The system operates across a dual-window architecture:

1. **Control Center Interface (Operator Window):** Optimized for high-speed touch screen or mouse interaction, providing event operators with single-screen control over game timers, scores, fouls, shot clocks, and timeouts without horizontal scrolling.
2. **Television Presentation Display (Broadcast Window):** A high-definition LED arena display presenting zero-latency digital score updates, dynamic team branding, centered chronometers, and synchronized commercial media overlays.

---

## 2. BASKETBALL CONTROL CENTER OPERATIONS

### 🏀 A. Game Chronometer & Shot Clock Controls
* **START / PAUSE CLOCK (`SPACEBAR` / Master Touch Button):**
  * Toggles synchronized countdown execution for both the main Game Clock and the Shot Clock.
* **SHOT CLOCK DIRECTIVES (`24s` / `14s` / `SHOT: ON`):**
  * **`24s` Reset Button:** Triggered upon change of possession; resets shot clock to 24.0 seconds.
  * **`14s` Reset Button:** Triggered upon offensive rebound or frontcourt foul scenario; resets shot clock to 14.0 seconds.
  * **`SHOT: ON` Status Indicator:** Natively illuminated in high-contrast cyan to confirm active shot clock tracking.
* **PERIOD CLOCK RESET:** Instantly resets main chronometer to configured quarter durations (e.g., 10:00 or 12:00 minutes).

### 🏀 B. Scoring Engine — Home & Away
* **`+3 PTS` Button:** Increments score by 3 points (Three-point field goal).
* **`+2 PTS` Button:** Increments score by 2 points (Standard field goal / Drive).
* **`+1 PT` Button:** Increments score by 1 point (Free throw).
* **`-1 PT` Button:** Decrements score by 1 point (Operator correction function).

### 🏀 C. Team Fouls & Timeout Management
* **TEAM FOULS (`+` / `-`):** Tracks accumulated team fouls per quarter. The interface automatically flags penalty status upon reaching 5 team fouls.
* **TIMEOUT INITIATION:** Executing a timeout request automatically activates the synchronized **Commercial Media & Ad Overlay** on the primary arena TV presentation screen.

---

## 3. VOLLEYBALL CONTROL CENTER OPERATIONS

### 🏐 A. Set Navigation & Point Management
* **`+1 POINT` / `-1 POINT` Buttons:** Modifies real-time set score increments for active rally points.
* **`SETS WON` (`+` / `-`):** Records set victories (e.g., reaching 25 rally points with a 2-point advantage).
* **CURRENT SET SELECTOR:** Seamlessly transitions match tracking across Sets 1, 2, 3, 4, and 5.

### 🏐 B. Serving Vector Indicator (Arrow Controls)
* **`SERVE AWAY (◀)` & `SERVE HOME (▶)`:** Toggles the high-visibility green directional serve arrow on the main TV presentation screen to indicate active server orientation.

### 🏐 C. Timeout (T) & Technical Fault (F) Tracking
* **TIMEOUT INDICATORS (T):** Dedicated twin-LED indicators track remaining timeouts per set. Activating a timeout initializes the proportioned countdown chronometer and commercial ad overlay.
* **FAULT INDICATORS (F):** Tracks technical warnings, sanction cards, or team penalty points.

---

## 4. TELEVISION PRESENTATION & ADVANCED VISUAL ENGINE

### 📺 A. Multi-Line Auto-Wrapping Team Name Engine
* **Intelligent Typography Adapter:** Long team names (e.g., *"HOME A LONG THE REALITY"* or *"BARANGAY GINEBRA KINGS"*) automatically wrap into balanced multi-line configurations (up to 2 lines) using ultra-bold presentation fonts, completely eliminating text truncation or character clipping.
* **Corporate Palette Standard:** **AWAY** team branding utilizes Cyan Blue (`#00A2FF`), while **HOME** team branding utilizes Crimson Red (`#FF3333`).

### 📺 B. Precision Centered Chronometer & Set Display
* The digital Game Clock (`09:48`) and Set Indicator (`SET 1`) are mathematically centered in the top header row using micro-offset kerning to guarantee absolute visual symmetry.

### 📺 C. Commercial Media & Ad Overlay System
* Upon timeout invocation, the display transitions to the **Split Commercial Overlay Screen**:
  1. **Left Panel:** Displays timeout team designation, proportioned **Cyan Countdown Ring** (200px balanced diameter), remaining countdown timer, and `TIME REMAINING` banner.
  2. **Right Panel:** Seamlessly streams high-definition video commercials or uploaded sponsor ad banners.
  3. **Bottom Bar:** Displays real-time match scores and current set metrics along the lower third of the display.

---

## 5. STANDARD OPERATING PROCEDURES (SOP) & BEST PRACTICES

1. **System Initialization:** Launch the Control Center application on the primary operator workstation. Drag the presentation window to the secondary arena LED TV display and press `F11` or click `Fullscreen`.
2. **Primary Keyboard Shortcuts:**
   * `SPACEBAR` — Master Start / Pause Toggle.
   * `ESC` — Close Presentation Window.
3. **Brand Integrity:** Ensure the official **Fitness Exclusive Corporate Header** is illuminated at the top of the operator control panel throughout event execution.

---
*Document Ref: FE-SOP-2026-V2*  
**FITNESS EXCLUSIVE ENGINEERING & EVENT OPERATIONS DIRECTORATE**
