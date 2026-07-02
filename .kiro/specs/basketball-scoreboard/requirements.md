# Requirements Document

## Introduction

A PC desktop application for managing and displaying a professional basketball scoreboard. The application runs on a PC and outputs a full-screen scoreboard display to a secondary screen (TV via HDMI or extended display). A separate operator control panel on the PC allows a game operator to manage scores, clocks, periods, fouls, and timeouts in real time during a game.

---

## Glossary

- **Application**: The basketball scoreboard desktop software as a whole.
- **Scoreboard Display**: The full-screen output window shown on the secondary screen (TV).
- **Control Panel**: The operator-facing window shown on the primary PC monitor used to manage game state.
- **Home Team**: The team designated as the home side at the start of a game.
- **Away Team**: The team designated as the away (visiting) side at the start of a game.
- **Game Clock**: The countdown timer representing the time remaining in the current period.
- **Shot Clock**: The countdown timer representing the time a team has to attempt a shot (typically 24 seconds in professional play).
- **Period**: A defined segment of game time (quarter in NBA-style play; half in college-style play).
- **Foul**: A rule infraction charged to a player or team.
- **Team Foul**: The accumulated count of personal fouls charged to a team within a period.
- **Timeout**: A stoppage of play called by a team or official.
- **Operator**: The person using the Control Panel to manage the game.
- **Display Monitor**: The secondary screen (TV) connected via HDMI or extended display.

---

## Requirements

### Requirement 1: Dual-Window Display Architecture

**User Story:** As an operator, I want the scoreboard displayed on the TV while I control the game from my PC monitor, so that the audience sees a clean scoreboard without the control interface.

#### Acceptance Criteria

1. THE Application SHALL open two separate windows on launch: the Scoreboard Display and the Control Panel.
2. WHEN the Application launches with more than one monitor available, THE Control Panel SHALL open on the primary monitor and the Scoreboard Display SHALL open on the secondary monitor by default.
3. THE Application SHALL allow the Operator to assign the Scoreboard Display to any available monitor via a monitor-selection control in the Control Panel.
4. WHEN the Operator selects a Display Monitor, THE Scoreboard Display SHALL move to that monitor and occupy the entire display area with no title bar or operating-system chrome visible.
5. THE Control Panel SHALL remain on the primary PC monitor and SHALL NOT be shown on the Display Monitor.
6. WHEN only one monitor is connected, THE Application SHALL disable the monitor-selection control and display a status indicator informing the Operator that a second display is required for the Scoreboard Display.
7. WHEN the Display Monitor is disconnected during a session, THE Application SHALL detect the loss within 5 seconds and display a persistent alert in the Control Panel stating the display monitor has been disconnected and the scoreboard is no longer visible.

---

### Requirement 2: Team Configuration

**User Story:** As an operator, I want to configure both team names before a game, so that the scoreboard shows accurate team identities.

#### Acceptance Criteria

1. THE Control Panel SHALL provide input fields for the Home Team name and Away Team name before the game starts.
2. WHEN the Operator saves team configuration, THE Scoreboard Display SHALL update both team names within 200 milliseconds.
3. THE Application SHALL accept team names between 1 and 30 characters in length and SHALL reject names composed entirely of whitespace characters.
4. IF a team name field is empty or contains only whitespace when the game is started, THEN THE Application SHALL display a validation error message identifying the invalid field and prevent the game from starting.
5. WHERE a team logo image is provided by the Operator, THE Scoreboard Display SHALL render the logo alongside the team name; IF the image file is unsupported or unreadable, THEN THE Application SHALL display an error message in the Control Panel and continue without rendering a logo.
6. WHEN the Operator edits a team name during an active game and saves the change, THE Scoreboard Display SHALL update the team name within 200 milliseconds.

---

### Requirement 3: Score Tracking

**User Story:** As an operator, I want to add or subtract points for each team, so that the scoreboard always reflects the current game score.

#### Acceptance Criteria

1. THE Control Panel SHALL provide buttons to add 1, 2, or 3 points to the Home Team score and the Away Team score independently.
2. THE Control Panel SHALL provide a button to subtract 1 point from the Home Team score and the Away Team score independently, to correct operator entry errors.
3. WHEN a score change is made, THE Scoreboard Display SHALL update the affected team's score within 200 milliseconds.
4. WHEN a team's score is 0, THE Control Panel SHALL disable the subtract button for that team so that the score cannot be decremented below 0.
5. THE Scoreboard Display SHALL render each team's score at a minimum height of 150 pixels on a 1080p display, using foreground and background colors that achieve a contrast ratio of at least 4.5:1 (WCAG AA), ensuring legibility at a viewing distance of at least 5 meters.

---

### Requirement 4: Game Clock Management

**User Story:** As an operator, I want to start, stop, and reset the game clock for each period, so that the displayed time accurately reflects the time remaining in play.

#### Acceptance Criteria

1. THE Control Panel SHALL provide Start, Stop, and Reset controls for the Game Clock.
2. WHEN the Operator starts the Game Clock, THE Game Clock SHALL count down in real time from the current displayed value, with a drift tolerance not exceeding 1 second per 10 minutes of continuous operation.
3. WHEN the Operator stops the Game Clock, THE Game Clock SHALL pause at the current value and hold that value on the Scoreboard Display.
4. WHEN the Operator resets the Game Clock, THE Application SHALL first stop the clock if it is running, then return the Game Clock to the configured period duration.
5. WHEN the Game Clock reaches 00:00, THE Application SHALL stop the Game Clock automatically and emit an audible buzzer sound.
6. IF the Game Clock is stopped, THEN THE Control Panel SHALL allow the Operator to manually set the Game Clock to any valid time value between 00:00 and 60:00.
7. THE Scoreboard Display SHALL show the Game Clock in MM:SS format, updating every 100 milliseconds or less.

---

### Requirement 5: Shot Clock Management

**User Story:** As an operator, I want to control a shot clock that resets independently from the game clock, so that shot clock violations can be properly tracked and displayed.

#### Acceptance Criteria

1. THE Control Panel SHALL provide Start, Stop, and Reset controls for the Shot Clock that operate independently from the Game Clock controls.
2. WHEN the Operator resets the Shot Clock, THE Shot Clock SHALL return to the configured shot clock duration (default: 24 seconds).
3. WHEN the Shot Clock reaches 00, THE Application SHALL stop the Shot Clock automatically, hold the display at 0, and emit a distinct audible buzzer sound lasting at least 1 second.
4. THE Control Panel SHALL allow the Operator to configure the Shot Clock duration to any whole-second value between 14 and 30 seconds inclusive.
5. THE Scoreboard Display SHALL show the Shot Clock value as a whole number of seconds, updating every 100 milliseconds or less.
6. WHERE the Shot Clock is disabled by the Operator, THE Scoreboard Display SHALL hide the Shot Clock element; WHEN the Shot Clock is re-enabled, THE Scoreboard Display SHALL show the Shot Clock element displaying the configured duration.

---

### Requirement 6: Period Tracking

**User Story:** As an operator, I want to advance the game through periods or halves, so that the scoreboard correctly reflects the current segment of the game.

#### Acceptance Criteria

1. THE Control Panel SHALL allow the Operator to configure the game format as either 4 quarters or 2 halves before the game starts.
2. WHEN the Operator advances to the next period, THE Application SHALL increment the period counter and reset the Game Clock to the configured period duration.
3. THE Scoreboard Display SHALL show the current period label using the format "Q1", "Q2", "Q3", "Q4" for quarter format and "1st Half", "2nd Half" for half format.
4. IF the Game Clock is running when the Operator attempts to advance the period, THEN THE Application SHALL stop the Game Clock before advancing and notify the Operator.
5. IF the Operator attempts to advance beyond the final configured period and the scores are equal, THEN THE Application SHALL allow the Operator to add an overtime period.
6. IF the Operator attempts to advance beyond the final configured period and the scores are not equal, THEN THE Application SHALL display a confirmation prompt before allowing the advance.
7. THE Scoreboard Display SHALL display "OT" for the first overtime period and "2OT", "3OT", etc. for subsequent overtime periods; each overtime period SHALL use the configured overtime duration.
8. THE Application SHALL not automatically advance periods; the Operator SHALL manually trigger each period transition.

---

### Requirement 7: Team Foul Tracking

**User Story:** As an operator, I want to track team fouls per period for each team, so that players and officials can see when a team is in the bonus.

#### Acceptance Criteria

1. THE Control Panel SHALL provide buttons to increment and decrement the Team Foul count for the Home Team and the Away Team independently.
2. WHEN a team's Team Foul count is 0, THE Control Panel SHALL disable the decrement button for that team so that the count cannot be decremented below 0.
3. WHEN the Operator advances to the next period, THE Application SHALL reset both teams' Team Foul counts to 0.
4. THE Scoreboard Display SHALL show the Team Foul count for each team.
5. WHEN a team's Team Foul count reaches the configured bonus threshold, THE Scoreboard Display SHALL display a "BONUS" label alongside that team's foul count; WHEN the count drops below the threshold, THE "BONUS" label SHALL be removed.
6. THE Control Panel SHALL provide a numeric input to configure the bonus threshold, accepting integer values between 1 and 10 inclusive, with a default value of 5.

---

### Requirement 8: Timeout Tracking

**User Story:** As an operator, I want to track the number of timeouts remaining for each team, so that the scoreboard shows accurate timeout status.

#### Acceptance Criteria

1. THE Control Panel SHALL allow the Operator to configure the number of full timeouts and 20-second timeouts per team per game independently, each accepting integer values between 0 and 10 inclusive, with defaults of 7 full timeouts and 1 twenty-second timeout per team.
2. THE Control Panel SHALL provide separate decrement and increment buttons for full timeouts and 20-second timeouts for the Home Team and the Away Team independently.
3. WHEN a team's remaining count for a timeout type is 0, THE Control Panel SHALL disable the decrement button for that type so that the count cannot be decremented below 0.
4. WHEN a team's remaining count for a timeout type is at the configured maximum, THE Control Panel SHALL disable the increment button for that type so that the count cannot exceed the configured maximum.
5. THE Scoreboard Display SHALL show the remaining full timeout count and 20-second timeout count for each team using filled and unfilled visual indicators corresponding to the configured maximum counts, updating within 200 milliseconds of any change.
6. WHEN a team's remaining count for a timeout type reaches 0, THE Scoreboard Display SHALL render all indicators for that type as unfilled to indicate no timeouts remain.

---

### Requirement 9: Game Configuration and Presets

**User Story:** As an operator, I want to configure game rules before tip-off and save them as presets, so that I can quickly set up recurring game formats without re-entering settings each time.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a game configuration screen accessible before the game starts.
2. THE Application SHALL allow the Operator to configure the following parameters with the stated valid ranges: period duration (1–60 minutes), number of periods (2 or 4), shot clock duration (14–30 seconds), team foul bonus threshold (1–10 fouls), full timeouts per team (0–10), and 20-second timeouts per team (0–10).
3. THE Application SHALL allow the Operator to save the current configuration as a named preset, where the preset name must be between 1 and 30 characters and unique among saved presets; IF the name conflicts with an existing preset, THEN THE Application SHALL prompt the Operator to overwrite or cancel.
4. WHEN the Operator loads a saved preset, THE Application SHALL populate all configuration fields with the preset values.
5. THE Application SHALL ship with at least two built-in presets ("NBA Rules" and "FIBA Rules") that are read-only and cannot be overwritten or deleted by the Operator.
6. IF a saved preset file is corrupted or unreadable, THEN THE Application SHALL remove that preset from the preset list and display an error message in the Control Panel identifying the affected preset by name.
7. WHEN the Operator attempts to save a preset with a name that already exists, THE Application SHALL display a confirmation dialog offering to overwrite the existing preset or cancel without saving.

---

### Requirement 10: Game Reset and New Game

**User Story:** As an operator, I want to reset the scoreboard for a new game, so that scores and stats from a previous game do not carry over.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a "New Game" action that resets all scores to 0, all Team Foul counts to 0, the period counter to 1, all clocks to their configured durations, and all timeout counts to their configured maxima.
2. WHEN the Operator initiates a New Game, THE Application SHALL display a confirmation dialog before performing the reset.
3. IF the Operator cancels the confirmation dialog, THEN THE Application SHALL dismiss the dialog and return to the current game state without making any changes.
4. WHEN a New Game is confirmed, THE Application SHALL preserve the current team names, team colors, team logos, and all game configuration settings (period duration, shot clock duration, bonus threshold, timeout counts).
5. IF the Operator selects the option to clear team names during the New Game setup, THEN THE Application SHALL clear both team name fields after the reset is confirmed.

---

### Requirement 11: Scoreboard Display Visual Design

**User Story:** As a viewer, I want the scoreboard to be visually clear and professional on a large TV screen, so that I can read the game information easily from across the venue.

#### Acceptance Criteria

1. THE Scoreboard Display SHALL render at the native resolution of the Display Monitor using 1:1 pixel mapping without interpolation or scaling artifacts.
2. THE Scoreboard Display SHALL use a dark background color and foreground elements that achieve a contrast ratio of at least 4.5:1 (WCAG AA) to remain legible under venue lighting conditions.
3. THE Scoreboard Display SHALL present the Home Team section on the left half and the Away Team section on the right half of the display, with the Game Clock centered at the horizontal midpoint between the two team sections.
4. THE Scoreboard Display SHALL render each team's score at a minimum height of 10% of the display height, ensuring legibility at a viewing distance of at least 5 meters from a 55-inch display.
5. THE Scoreboard Display SHALL NOT show any control interface elements, buttons, or operator tooling.
6. WHERE a team color is configured by the Operator, THE Scoreboard Display SHALL apply that color as the primary accent color for the corresponding team's section.

---

### Requirement 12: Audible Signals

**User Story:** As an operator, I want audible buzzer sounds for end-of-period and shot clock violations, so that players and spectators receive the standard audio cues.

#### Acceptance Criteria

1. WHEN the Game Clock reaches 00:00, THE Application SHALL play an end-of-period buzzer sound through the PC audio output lasting at least 1.5 seconds.
2. WHEN the Shot Clock reaches 00, THE Application SHALL play a short shot-clock violation buzzer sound through the PC audio output lasting no more than 0.5 seconds, using a tone frequency distinct from the end-of-period buzzer.
3. THE Control Panel SHALL provide a manual buzzer button that plays the end-of-period buzzer sound on demand.
4. THE Control Panel SHALL provide a volume control slider that adjusts the output level of all Application-generated sounds from 0% to 100%.
5. IF the PC audio device is unavailable at the time a sound would be played, THEN THE Application SHALL display a warning message in the Control Panel and continue operating without sound.
