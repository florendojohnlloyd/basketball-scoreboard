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
- **Liga**: A league or competition entity within the Application grouping teams, rosters, schedules, and game logs under a single named organization.
- **Admin**: The user role with full access to all application features, including user management and system configuration.
- **Coach**: The user role with read-only access to in-game statistics, season stats, leaderboards, and box score views.
- **Scorekeeper**: The user role authorized to perform all in-game control actions (score, clock, fouls, timeouts, player stats) but not Liga configuration or user management.
- **Viewer**: The user role with read-only access to the Scoreboard Display and box score views only.
- **API Key**: A secret token issued by the Application to authenticate external systems accessing the REST API.
- **Audit Log**: An append-only record of all state-changing operations performed within the Application, each entry carrying a UTC timestamp and the identity of the user who performed the action.
- **Cloud Sync**: The feature that replicates Application data (Liga files, game logs, rosters, audit logs) to a remote cloud endpoint for multi-device access.
- **Cloud Sync Endpoint**: The remote server URL to which the Application transmits data when Cloud Sync is enabled.
- **Backup Archive**: A compressed .zip file containing all Application data files and a manifest, created by the Backup feature for disaster recovery purposes.
- **Pending-Changes Log**: A local queue of data modifications accumulated while the Application is offline, replayed in order when connectivity is restored.
- **Overlay Webpage**: A locally hosted browser-source page rendered by the Live Streaming Integration feature, displaying live scoreboard data for capture by streaming software.
- **RTMP Endpoint**: A Real-Time Messaging Protocol server URL to which the Application streams video output when Live Streaming Integration is active.
- **OAuth Token**: An authorization credential obtained via an OAuth 2.0 flow, used by the Social Media Sharing feature to post content on behalf of the user.
- **Mobile Viewer**: The mobile-optimized web page served by the Application on the local network for coaches and players to view live scores and stats on their own devices.

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


---

## Area 1 — Player & Team Stats + Box Score

### Requirement 13: Extended Per-Player In-Game Statistics

**User Story:** As an operator, I want to record steals, blocks, and field goal attempts and makes for each player during a game, so that a complete statistical picture is available alongside the existing points, rebounds, assists, and fouls.

#### Acceptance Criteria

1. THE Control Panel SHALL provide controls to increment and decrement steals and blocks per player independently for the Home Team and the Away Team.
2. THE Control Panel SHALL provide controls to record a field goal attempt (FGA) and a field goal make (FGM) per player, where recording a FGM SHALL also increment FGA by 1 for the same player in the same action.
3. WHEN a player's FGM count is decremented, THE Application SHALL also decrement that player's FGA count by 1, ensuring FGM never exceeds FGA.
4. WHEN a player stat (steal, block, FGA, FGM) is modified, THE Application SHALL update the in-memory game state within 200 milliseconds.
5. THE Application SHALL prevent any per-player integer stat counter from being decremented below 0.
6. WHEN a New Game is confirmed, THE Application SHALL reset all per-player extended stats (steals, blocks, FGA, FGM) to 0 for all players, consistent with the reset behavior of existing stats.
7. WHEN the Operator undoes a stat change, THE Application SHALL restore the affected player's stat to its value before that change, using the existing undo stack mechanism.

---

### Requirement 14: Team-Level Derived Statistics

**User Story:** As an operator, I want to see team-level aggregated stats — field goal percentage, total turnovers, and total rebounds — so that I can communicate team performance to coaches and commentators at a glance.

#### Acceptance Criteria

1. THE Control Panel SHALL display the team field goal percentage (FGM ÷ FGA × 100) for the Home Team and the Away Team, calculated from the sum of all active players' FGM and FGA values, updating within 200 milliseconds of any relevant player stat change.
2. WHEN FGA for a team is 0, THE Control Panel SHALL display "—" for that team's field goal percentage to avoid a division-by-zero display.
3. THE Control Panel SHALL provide buttons to increment and decrement a team-level turnover counter for the Home Team and the Away Team independently, with the counter floored at 0.
4. THE Application SHALL compute total team rebounds as the sum of all players' individual rebound counts for that team and SHALL display this derived total in the Control Panel.
5. WHEN a New Game is confirmed, THE Application SHALL reset all team-level turnover counters to 0.

---

### Requirement 15: Player Jersey Numbers on Scoreboard Display

**User Story:** As a viewer, I want to see each active player's jersey number on the Scoreboard Display alongside their stats, so that I can identify players without needing a printed program.

#### Acceptance Criteria

1. WHEN a player is active, THE Scoreboard Display SHALL render that player's jersey number alongside their name and current point total.
2. THE Scoreboard Display SHALL render jersey numbers in a font size at least 50% of the player name font size, ensuring legibility at a viewing distance of at least 5 meters from a 55-inch display.
3. WHEN a player's jersey number is updated via the Control Panel, THE Scoreboard Display SHALL reflect the updated number within 200 milliseconds.
4. IF a player has no jersey number assigned, THE Scoreboard Display SHALL render an empty string in the jersey number position without layout disruption.

---

### Requirement 16: Player Photos in Control Panel and Scoreboard Display

**User Story:** As an operator, I want to display player photos in the Control Panel and optionally on the Scoreboard Display, so that the audience and staff can visually identify players.

#### Acceptance Criteria

1. THE Control Panel SHALL allow the Operator to assign a photo image file (JPEG or PNG, maximum 5 MB) to each player in the roster.
2. WHEN a valid player photo is assigned, THE Control Panel SHALL display a thumbnail of that photo alongside the player's name and number in the player list.
3. IF the assigned image file exceeds 5 MB or is not a JPEG or PNG, THEN THE Application SHALL display an error message in the Control Panel identifying the file and reject the assignment without modifying the player record.
4. WHERE the Operator has enabled "Show Player Photos on Scoreboard" in the settings, THE Scoreboard Display SHALL render each active player's photo thumbnail alongside their stats row.
5. IF a player photo file is missing or unreadable at display time, THEN THE Application SHALL render a placeholder silhouette image in its place and log a warning in the Control Panel status area.
6. THE Application SHALL store player photo file paths relative to the application user-data directory so that photo references remain valid after the application is reinstalled or moved.

---

### Requirement 17: Box Score Generation

**User Story:** As a statistician or coach, I want a per-period box score showing each player's statistics broken down by quarter or half and totals, so that I have a complete match summary for review.

#### Acceptance Criteria

1. THE Application SHALL record a snapshot of each player's cumulative stats (points, rebounds, assists, steals, blocks, FGA, FGM, fouls) at the end of each period, identified by period number and team.
2. WHEN the game enters post-game phase, THE Control Panel SHALL provide a "View Box Score" action that opens a box score view displaying each player's per-period stats and final totals.
3. THE Box Score view SHALL present one row per player per team, with columns for jersey number, name, and each stat category, plus a totals row per team.
4. THE Application SHALL compute period stat increments for the box score as the difference between the player's cumulative stat snapshot at the end of a period and the snapshot at the end of the prior period (or 0 for the first period).
5. WHEN a period ends (Operator advances period), THE Application SHALL capture period snapshots automatically without requiring Operator action.
6. THE Box Score view SHALL be read-only; the Operator SHALL NOT be able to edit individual cells within the view.

---

## Area 2 — Data & Analytics

### Requirement 18: Historical Game Logs

**User Story:** As a league administrator, I want completed games to be saved automatically with full statistics, so that I have a persistent record of all games played.

#### Acceptance Criteria

1. WHEN the Operator confirms a New Game action after a game has been played (gamePhase is "in-game" or "post-game"), THE Application SHALL prompt the Operator with the option to save the completed game log before resetting.
2. IF the Operator chooses to save, THE Application SHALL write a game log record to the local file system under the application user-data directory containing: game date and time, both team names, final scores, all player stats totals, all GameEvent log entries, and period snapshots.
3. THE Game Log record SHALL be stored in a structured JSON format that can be read by the Application on subsequent launches.
4. THE Control Panel SHALL provide a "Game History" view listing all saved game logs sorted by date descending, displaying the date, both team names, and the final score for each entry.
5. WHEN the Operator selects a game log entry from the Game History view, THE Application SHALL display the full box score and event log for that game in a read-only detail view.
6. IF a game log file is corrupted or unreadable on load, THEN THE Application SHALL exclude that entry from the Game History list and display a warning in the Control Panel identifying the affected file by date and teams if metadata is recoverable, or by file name otherwise.
7. THE Application SHALL allow the Operator to delete a game log entry from the Game History view after confirming a deletion prompt; deletion SHALL remove the corresponding file from the file system.

---

### Requirement 19: Season Averages

**User Story:** As a coach, I want to see per-player and per-team season averages computed across all saved game logs for a given league and year, so that I can track performance trends over a season.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a "Season Stats" view accessible from the main navigation, displaying per-player averages for points, rebounds, assists, steals, blocks, and field goal percentage aggregated across all saved game logs associated with the currently loaded Liga.
2. THE Application SHALL compute per-player averages as the sum of each stat across all qualifying game logs divided by the number of games in which that player appeared (games played > 0 for that player).
3. THE Control Panel SHALL display per-team season averages for points per game, field goal percentage, rebounds per game, assists per game, and turnovers per game, aggregated across all saved game logs for the current Liga.
4. WHEN no game logs are available for the current Liga, THE Season Stats view SHALL display a message stating "No games recorded for this season" rather than empty tables.
5. THE Application SHALL recompute season averages each time the Season Stats view is opened, reading from saved game log files rather than keeping a cached aggregate.

---

### Requirement 20: Statistical Leaderboards

**User Story:** As a league administrator, I want leaderboards showing the top performers in key statistical categories, so that I can quickly identify standout players in the season.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a "Leaderboards" view displaying ranked lists for the following categories: points per game, rebounds per game, assists per game, steals per game, and blocks per game.
2. THE Leaderboards view SHALL display the top 10 players per category, sorted in descending order, showing rank, player name, team name, and the statistical value rounded to one decimal place.
3. IF fewer than 10 players have appeared in qualifying game logs for a category, THE Leaderboards view SHALL display only the available entries without padding.
4. THE Application SHALL include only players who have appeared in at least 1 recorded game when computing leaderboard rankings.
5. WHEN the Operator switches the active Liga, THE Leaderboards view SHALL refresh its data to reflect only game logs associated with the newly selected Liga.

---

### Requirement 21: Advanced Player Metrics

**User Story:** As a coach or analyst, I want advanced per-player metrics — Player Efficiency Rating, plus/minus, and overall efficiency — so that I have a deeper measure of individual contribution.

#### Acceptance Criteria

1. THE Application SHALL compute a Player Efficiency Index (PEI) for each player using the formula: (Points + Rebounds + Assists + Steals + Blocks − (FGA − FGM) − Fouls) ÷ Minutes Played, where Minutes Played is tracked as the total game-clock time elapsed while that player was active.
2. WHEN a player's active status changes via TOGGLE_PLAYER_ACTIVE, THE Application SHALL record a timestamped substitution entry (clock value and period) enabling accurate minutes-played computation.
3. THE Application SHALL compute a plus/minus rating per player as the net change in the player's team score minus the opponent's score during all intervals the player was marked active within the current game.
4. THE Application SHALL compute a per-game Efficiency value per player using the formula: Points + Rebounds + Assists + Steals + Blocks − (FGA − FGM) − Fouls.
5. THE Control Panel SHALL display PEI, plus/minus, and Efficiency for each player in the active game in a dedicated stats panel, updated within 200 milliseconds of any relevant stat change.
6. IF a player's Minutes Played is 0, THE Control Panel SHALL display "—" for that player's PEI to avoid division-by-zero display.

---

### Requirement 22: Export Reports

**User Story:** As a league administrator, I want to export game summaries and season statistics to PDF and Excel formats, so that I can share reports with coaches, sponsors, and governing bodies.

#### Acceptance Criteria

1. THE Control Panel SHALL provide an "Export" action available from both the Box Score view and the Season Stats view.
2. WHEN the Operator selects "Export to PDF", THE Application SHALL open a native save-file dialog for the Operator to choose a destination path and file name, then generate and save a PDF document containing the active view's data.
3. WHEN the Operator selects "Export to Excel", THE Application SHALL open a native save-file dialog, then generate and save an XLSX file containing the active view's data with one worksheet per team for box score exports, or one worksheet per category for season stats exports.
4. THE generated PDF SHALL include the Liga name, game date, both team names, and all statistical rows visible in the source view at the time of export.
5. THE generated XLSX file SHALL use column headers matching the stat category names displayed in the application and SHALL format numeric cells as numbers (not text) to allow spreadsheet calculations.
6. IF the destination path is not writable or the file cannot be created, THEN THE Application SHALL display an error message in the Control Panel identifying the reason and SHALL NOT leave a partially written file at the destination.
7. WHEN an export completes successfully, THE Application SHALL display a confirmation message in the Control Panel stating the file path where the export was saved.

---

## Area 3 — Management Tools

### Requirement 23: Team Roster Management

**User Story:** As a league administrator, I want to add, remove, and edit players in a team roster — including jersey numbers and photos — so that rosters accurately reflect the current squad for each Liga.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a Roster Management view per Liga team, accessible from the Liga management section, displaying all players for that team with their name, jersey number, and photo thumbnail.
2. THE Roster Management view SHALL allow the Operator to add a new player by entering a name (1–50 characters) and jersey number (1–99, unique within the team); IF a duplicate jersey number is entered, THEN THE Application SHALL display a validation error and prevent saving.
3. THE Roster Management view SHALL allow the Operator to edit any player's name and jersey number in place; WHEN the Operator saves the edit, THE Application SHALL validate the updated values using the same rules as creation and persist the change to the Liga JSON file.
4. THE Roster Management view SHALL allow the Operator to remove a player after confirming a deletion prompt; removal SHALL delete the player record from the Liga JSON file.
5. THE Application SHALL allow the Operator to assign or replace a player photo from the Roster Management view using the same file constraints defined in Requirement 16 (JPEG or PNG, maximum 5 MB).
6. WHEN a Liga team with updated roster data is loaded into the active game via LOAD_LIGA_TEAMS, THE Control Panel SHALL reflect the current roster including all names, numbers, and photo paths.

---

### Requirement 24: Schedule Management

**User Story:** As a league administrator, I want to create and manage a schedule of games, tournaments, and leagues with dates and opponents, so that all participants know when and against whom they play.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a Schedule Management view, accessible from the Liga management section, where the Operator can create scheduled game entries.
2. WHEN creating a scheduled game, THE Operator SHALL be required to specify a date (validated as a valid calendar date), a home team (selected from existing Liga teams), and an away team (selected from existing Liga teams, distinct from the home team); IF either team field is unset or the same team is selected for both, THEN THE Application SHALL display a validation error and prevent saving.
3. THE Schedule Management view SHALL display all scheduled games for the current Liga sorted by date ascending, showing date, home team name, away team name, venue (if assigned), and status (Scheduled, In Progress, Completed).
4. THE Application SHALL allow the Operator to mark a scheduled game as "Completed" after linking it to a saved game log; the game log association SHALL store the scheduled game ID alongside the game log record.
5. THE Application SHALL allow the Operator to delete a scheduled game entry after confirming a deletion prompt; deletion SHALL remove only the scheduled entry and SHALL NOT delete any associated game log.
6. THE Application SHALL persist all scheduled game entries in the Liga JSON file under a "schedule" array, enabling retrieval on subsequent application launches.

---

### Requirement 25: Venue and Court Assignment

**User Story:** As a league administrator, I want to assign a venue and specific court to each scheduled game, so that players and officials know exactly where the game will take place.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a Venue Management section within the Schedule Management view, where the Operator can create venue records with a name (1–80 characters) and an optional address (up to 200 characters).
2. WHEN creating or editing a scheduled game, THE Operator SHALL be able to assign a venue from the list of saved venue records; the assignment SHALL be optional.
3. WHEN creating or editing a scheduled game, THE Operator SHALL be able to specify a court identifier (free text, 1–20 characters) within the assigned venue; the court field SHALL be available only when a venue is assigned.
4. THE Schedule Management view SHALL display the assigned venue name and court identifier for each scheduled game where assigned.
5. THE Application SHALL persist venue records in the Liga JSON file under a "venues" array and SHALL store the venue ID and court identifier in each scheduled game entry.
6. IF a venue referenced by a scheduled game is deleted from the venues list, THEN THE Application SHALL display a warning in the Schedule Management view for each affected game entry and clear the venue and court fields for those entries.

---

### Requirement 26: Referee and Staff Assignment

**User Story:** As a league administrator, I want to assign referees and support staff to scheduled games, so that all officials know their assignments in advance.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a Staff Management section within the Liga management area, where the Operator can create staff records with a name (1–50 characters) and a role (selected from a configurable list: Referee, Scorekeeper, Shot Clock Operator, or a custom role up to 30 characters).
2. WHEN creating or editing a scheduled game, THE Operator SHALL be able to assign one or more staff members from the saved staff records to that game; the same staff member SHALL NOT be assignable to the same game twice.
3. THE Schedule Management view SHALL display the count of assigned staff for each scheduled game entry.
4. WHEN the Operator opens the detail view for a scheduled game, THE Application SHALL list all assigned staff members with their names and roles.
5. THE Application SHALL persist staff records in the Liga JSON file under a "staff" array and SHALL store staff IDs in each scheduled game entry under an "assignedStaff" array.
6. IF a staff record is deleted from the staff list, THEN THE Application SHALL remove that staff member from all scheduled game entries that reference them and display a notification indicating how many game entries were affected.

---

### Requirement 27: Attendance Tracking

**User Story:** As a league administrator, I want to record and review attendance figures for each game, so that I can report audience size to sponsors and governing bodies.

#### Acceptance Criteria

1. THE Control Panel SHALL provide an attendance input field on the scheduled game detail view, accepting an integer value between 0 and 99 999 inclusive.
2. WHEN the Operator saves an attendance value, THE Application SHALL persist the value in the associated scheduled game entry in the Liga JSON file.
3. IF the Operator enters a non-integer value or a value outside the range 0–99 999, THEN THE Application SHALL display a validation error and prevent saving.
4. THE Game History detail view SHALL display the attendance figure for games where attendance has been recorded; IF no attendance figure has been recorded, THE Application SHALL display "—" in the attendance field.
5. THE Season Stats view SHALL display the total season attendance (sum of all recorded attendance values across completed games in the current Liga) and the average attendance per game (total attendance ÷ number of games with a recorded attendance value).
6. WHEN a game log is saved after a completed game and a scheduled game entry exists for the same matchup and date, THE Application SHALL automatically associate the game log with that scheduled entry to avoid the Operator having to link them manually.

---

## Area 4 — Connectivity, Security & Reliability

### Requirement 28: User Roles and Role-Based Access Control

**User Story:** As an admin, I want to assign roles to users of the application, so that only authorized personnel can perform sensitive actions such as editing game data or managing league configuration.

#### Acceptance Criteria

1. THE Application SHALL support exactly four user roles: Admin, Coach, Scorekeeper, and Viewer.
2. THE Admin role SHALL have unrestricted access to all application features including user management, Liga configuration, roster editing, and data export.
3. THE Scorekeeper role SHALL have access to all in-game control actions (score, clock, fouls, timeouts, player stats) but SHALL NOT have access to user management or Liga configuration screens.
4. THE Coach role SHALL have read access to all in-game statistics, season stats, leaderboards, and box score views but SHALL NOT be permitted to modify game state or configuration.
5. THE Viewer role SHALL have read-only access to the Scoreboard Display and box score views only, with no access to the Control Panel actions.
6. WHEN a user attempts to perform an action outside their assigned role's permissions, THE Application SHALL immediately display an access-denied message identifying which permission is required and prevent the action from completing.
7. THE Admin SHALL be able to create, edit, and delete user accounts, including assigning or changing a user's role; IF deleting an account would remove the sole remaining Admin, THEN THE Application SHALL reject the deletion and display an error message stating that at least one Admin account must exist.
8. WHEN no user accounts exist in the system, THE Application SHALL create a default Admin account setup screen before granting access to any other feature, requiring the Admin to set a password of at least 8 characters containing at least one uppercase letter, one digit, and one special character.
9. IF a user enters incorrect credentials three consecutive times, THEN THE Application SHALL lock that account for 5 minutes, display a lockout message indicating the remaining duration, and reset the failed-attempt counter to zero when the lockout expires.
10. THE Application SHALL persist user accounts and role assignments so that accounts and roles present in one application session are present and unchanged at the start of the next session.

---

### Requirement 29: Data Backup and Recovery

**User Story:** As a league administrator, I want to back up all application data and restore it if needed, so that game records, rosters, and configuration are protected against data loss.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a "Backup" action in the Admin settings area that creates a timestamped backup archive containing all Liga JSON files, game log files, player photos, presets, and user credential store.
2. WHEN the Operator triggers a manual backup, THE Application SHALL open a native save-file dialog so the Operator can choose the destination path, then write a single compressed archive file (.zip) to that path.
3. THE Application SHALL support automatic backup by allowing the Admin to configure a backup schedule with a frequency of daily, weekly, or monthly, and a destination folder path.
4. WHEN a scheduled automatic backup is due and the destination folder is accessible, THE Application SHALL create the backup archive without requiring Operator intervention and log the backup event to the Audit Log.
5. IF the destination folder for an automatic backup is inaccessible when the backup is due, THEN THE Application SHALL display a persistent warning in the Control Panel, retry the backup at the next application launch, and dismiss the warning only when a backup to that destination succeeds.
6. THE Control Panel SHALL provide a "Restore" action that opens a file-picker dialog restricted to .zip files; a valid backup archive is one that contains the manifest file defined in criterion 9 and all files listed in that manifest.
7. WHEN the Operator selects a valid backup archive via the Restore action, THE Application SHALL display a confirmation dialog stating that the restore will overwrite all current data before proceeding.
8. WHEN a restore is confirmed, THE Application SHALL discard any unsaved in-progress changes, replace all current application data with the contents of the selected archive, and restart the application automatically.
9. IF a selected restore archive is unreadable, fails manifest validation, or is missing files listed in the manifest, THEN THE Application SHALL abort the restore, display a descriptive error message identifying the specific failure, and leave the existing data unchanged.
10. THE Backup archive SHALL include a manifest file listing the archive creation timestamp, application version, and the names of all included files; the Restore action SHALL verify the manifest is present and all listed files are present in the archive before applying the restore.

---

### Requirement 30: Offline Mode with Sync

**User Story:** As an operator, I want the application to work fully without an internet connection, so that games can be managed in venues without reliable network access, with data synced to the cloud when connectivity is restored.

#### Acceptance Criteria

1. WHILE the Application has no internet connectivity, ALL local game management, statistics, roster, and scheduling features SHALL remain fully operational with no controls disabled or views hidden.
2. WHEN the Application detects that internet connectivity is unavailable, THE Control Panel SHALL display a persistent "Offline" status indicator in the status bar.
3. WHEN the Application detects that internet connectivity has been restored after an offline period, THE Application SHALL initiate a sync operation automatically within 30 seconds.
4. WHILE a sync operation is in progress, THE Control Panel SHALL display a "Syncing" status indicator and SHALL NOT block the Operator from performing local game actions.
5. WHEN a sync operation completes successfully, THE Application SHALL update the status indicator to reflect the connected and synced state and log the sync event to the Audit Log.
6. IF a sync conflict is detected (the same record has been modified both locally and remotely since the last sync), THEN THE Application SHALL present the Operator with a conflict resolution dialog showing both versions; WHEN the Operator selects a version or cancels the dialog, THE Application SHALL apply the selection (or retain the local version on cancel) and continue syncing remaining records.
7. WHEN the Application is online and Cloud Sync is enabled, THE Application SHALL queue each local data change to the Pending-Changes Log within 200 milliseconds of the change occurring.
8. WHEN connectivity is restored, THE Application SHALL replay all queued entries from the Pending-Changes Log in chronological order before processing any incoming remote changes.
9. IF a sync operation fails due to a transient network error, THEN THE Application SHALL retry the sync up to 3 times at 60-second intervals before displaying a persistent sync-failure warning in the Control Panel status bar.
10. THE Application SHALL retain all locally stored data indefinitely regardless of sync state; loss of connectivity SHALL NOT result in local data deletion.

---

### Requirement 31: Audit Logs

**User Story:** As a league administrator, I want every data modification to be recorded with a timestamp and the identity of the user who made the change, so that I can review the history of edits for accountability and dispute resolution.

#### Acceptance Criteria

1. THE Application SHALL record an Audit Log entry for every state-changing operation in the following categories: score changes; clock adjustments (start, stop, reset, manual set); foul increments and decrements; timeout increments and decrements; player stat changes; roster edits (add, edit, remove player); Liga configuration changes; preset saves and deletions; user account changes (create, edit, delete, role change); backup events; restore events; sync events; export events; and share events.
2. THE Application SHALL write each Audit Log entry as a JSON object containing: a UTC timestamp in ISO 8601 format, the username and role of the acting user, a string action type identifier, the ID or name of the affected entity, the previous value serialized as a string, and the new value serialized as a string.
3. THE Control Panel SHALL provide an "Audit Log" view accessible to Admin and Scorekeeper roles, displaying all log entries sorted by timestamp descending, with columns for timestamp, user, action type, entity, and a change description derived from the previous and new value fields.
4. THE Audit Log view SHALL support filtering entries by date range, user, and action type, updating the displayed list within 500 milliseconds of a filter change.
5. THE Application SHALL retain Audit Log entries for a minimum of 12 months from the date of the entry and SHALL automatically purge entries older than 12 months at application launch.
6. THE Audit Log SHALL be append-only; no user role SHALL be permitted to delete or modify individual Audit Log entries through any application interface.
7. WHEN the Operator exports the Audit Log from the Audit Log view, THE Application SHALL generate a CSV file containing all currently filtered entries with one row per entry and column headers matching the field names in criterion 2, opening a native save-file dialog for the destination path.
8. IF the Audit Log file is corrupted or unreadable at launch, THEN THE Application SHALL create a new empty log file, display a warning to the Admin, and continue operating without data loss to other application data.
9. IF an Audit Log write fails during a state-changing operation, THEN THE Application SHALL display a non-blocking warning in the Control Panel status area and continue processing the state change so that game operations are never blocked by a log failure.

---

### Requirement 32: Cloud Sync

**User Story:** As a league administrator, I want game data, rosters, and audit logs to be synchronized to a cloud backend, so that authorized users on multiple devices can access up-to-date information.

#### Acceptance Criteria

1. WHERE Cloud Sync is enabled by the Admin, THE Application SHALL synchronize all Liga JSON files, game log files, roster data, and Audit Log entries to the configured Cloud Sync endpoint.
2. THE Admin SHALL be able to configure the Cloud Sync endpoint URL and API Key from the Admin settings area.
3. WHEN the Admin saves Cloud Sync credentials, THE Application SHALL perform a test connection to the endpoint with a timeout of 10 seconds and display either a success confirmation or a failure message with the error description.
4. WHEN the Application starts and Cloud Sync is enabled, THE Application SHALL perform an initial pull sync to retrieve any remote changes before displaying application data to the user, completing within 60 seconds or displaying a sync-timeout warning if the endpoint does not respond.
5. IF the initial pull sync fails, THE Application SHALL display a non-blocking warning in the Control Panel and continue launching with local data.
6. THE Application SHALL sync data incrementally within 30 seconds of any local data change and SHALL perform a full sync poll no less frequently than every 5 minutes while the Application is running, transmitting only records whose last-modified timestamp is newer than the last successful sync timestamp.
7. WHEN Cloud Sync is disabled by the Admin, THE Application SHALL stop all outbound sync operations within 5 seconds and retain all local data without modification.
8. ALL data transmitted to the Cloud Sync endpoint SHALL be encrypted in transit using TLS 1.2 or higher.
9. IF a Cloud Sync operation fails due to an authentication error, THEN THE Application SHALL disable automatic sync, display a persistent error message in the Control Panel, and prompt the Admin to re-enter credentials.
10. WHEN a Cloud Sync attempt completes, THE Application SHALL write an Audit Log entry containing the start time, end time, count of records transmitted, and success or failure description.

---

### Requirement 33: Live Streaming Integration

**User Story:** As a league administrator, I want to overlay scoreboard data on a live stream, so that remote viewers see the current score, clock, and period alongside the video feed.

#### Acceptance Criteria

1. WHERE Live Streaming Integration is enabled by the Admin, THE Application SHALL expose a locally hosted overlay webpage at a configurable port in the range 1024–65535 (default: 8080) that serves an HTML page with a transparent background and absolute-positioned scoreboard elements suitable for browser-source capture in OBS Studio or equivalent streaming software.
2. WHERE the overlay server is running, THE overlay webpage SHALL update all displayed values via WebSocket push from the Application within 500 milliseconds of any score, clock, foul, or timeout state change.
3. WHERE the overlay server is running, THE Admin SHALL be able to configure which elements are visible (score, clock, period, team fouls, timeouts), the font size scale factor (0.5×–2.0× relative to a 1080p baseline), and the background transparency (0%–100%), with changes reflected on the overlay page within 1 second of saving.
4. THE Admin SHALL be able to configure an RTMP destination URL (validated as starting with "rtmp://" or "rtmps://") and a stream key in the Admin settings area, and SHALL be able to start and stop the RTMP stream from the Control Panel.
5. WHILE the RTMP stream is active, THE Control Panel SHALL display a "Streaming" status indicator showing the elapsed stream duration updated every second.
6. IF the RTMP connection is lost during an active stream, THEN THE Application SHALL attempt to reconnect automatically up to 3 times at 10-second intervals; after each failed attempt THE Application SHALL display a warning in the Control Panel; after all 3 attempts fail THE Application SHALL mark the stream as stopped and display a persistent error.
7. IF the configured overlay port is already in use when the overlay server is started, THEN THE Application SHALL display an error message in the Control Panel identifying the port conflict and SHALL NOT start the server until the conflict is resolved.
8. THE streaming overlay and RTMP output SHALL be independent of the Scoreboard Display window; disabling the overlay server SHALL NOT affect the Scoreboard Display.

---

### Requirement 34: External API Support

**User Story:** As an integration developer, I want the application to expose a documented REST API, so that external stats platforms can read live and historical game data programmatically.

#### Acceptance Criteria

1. THE Application SHALL expose a local REST API server on a configurable port in the range 1024–65535 (default: 3000), active whenever the Application is running; IF the configured port is already in use at launch, THEN THE Application SHALL display a persistent error in the Control Panel and SHALL NOT start the API server until the conflict is resolved.
2. THE REST API SHALL provide read endpoints for the following resources: current game state (scores, clocks, period, team fouls, timeouts), player stats for the active game, all saved game logs (paginated, 20 records per page by default, with HTTP 200 and an empty results array for page numbers beyond the total count), and season averages for the current Liga.
3. ALL REST API endpoints SHALL require a valid API Key supplied as a Bearer token in the Authorization header (format: `Authorization: Bearer <key>`); requests missing the header or supplying an invalid key SHALL receive an HTTP 401 response.
4. THE Admin SHALL be able to generate, view, and revoke up to 20 active API Keys from the Admin settings area; each API Key SHALL be associated with a label (1–50 characters) and a creation timestamp.
5. WHEN an API Key is revoked, THE Application SHALL reject all subsequent requests using that key within 5 seconds of revocation.
6. THE REST API SHALL return all responses in JSON format using camelCase field names and SHALL include a `Content-Type: application/json` header on every response.
7. WHEN the Application receives an API request, THE Application SHALL write an Audit Log entry containing the UTC timestamp, endpoint path, HTTP status code returned, and the label of the API Key used.
8. THE REST API server SHALL impose a rate limit of 60 requests per minute per API Key; IF the limit is exceeded, THEN THE Application SHALL return an HTTP 429 response with a `Retry-After` header indicating the number of seconds until the next request is permitted.
9. THE Application SHALL provide an OpenAPI 3.0 specification document accessible at the `/docs` endpoint of the local API server, describing all available endpoints, request parameters, and response schemas.

---

### Requirement 35: Social Media Sharing

**User Story:** As a league administrator, I want to share game scores and highlights to social media directly from the application, so that fans can follow the action on their preferred platforms.

#### Acceptance Criteria

1. THE Control Panel SHALL provide a "Share" action available from the active game view and the Game History detail view, accessible to Admin and Scorekeeper roles.
2. WHEN the Operator selects "Share Score", THE Application SHALL generate a pre-formatted text summary containing the game date, both team names and scores, current period (or "Final" if the game is complete), and the Liga name, and display it in an editable preview field before posting.
3. THE Application SHALL support sharing to at least the following platforms: Twitter/X and Facebook, using each platform's official OAuth 2.0 authentication flow.
4. WHEN sharing to a platform for the first time or after the stored token has been revoked, THE Application SHALL open the platform's OAuth authorization URL in the system default browser and await the authorization callback before completing the share action.
5. THE Application SHALL securely store platform OAuth tokens using the OS credential store (e.g., Windows Credential Manager); tokens SHALL NOT be stored in plain text on the file system.
6. WHEN a stored OAuth token has expired, THE Application SHALL attempt a silent token refresh automatically before the share action; IF the refresh fails, THEN THE Application SHALL prompt the user to re-authorize the platform before proceeding.
7. THE Operator SHALL be able to attach a static scoreboard screenshot (PNG export of the current Scoreboard Display frame rendered off-screen) to the share post; the screenshot SHALL be generated without requiring the Display Monitor to be connected.
8. WHERE a platform's API does not support image attachments, THE Application SHALL post text-only content and display a non-blocking notification to the Operator stating that image sharing is unavailable for that platform.
9. WHEN a share attempt completes, THE Application SHALL write an Audit Log entry containing the UTC timestamp, platform name, and whether the attempt succeeded or failed with the failure reason.

---

### Requirement 36: Mobile-Friendly Viewer Interface

**User Story:** As a coach or player, I want to view live scores and statistics on my mobile device, so that I can follow the game without needing to be near the scoreboard display.

#### Acceptance Criteria

1. THE Application SHALL serve a mobile-optimized viewer web page on the local network at a configurable port in the range 1024–65535 (default: 8081), accessible to any device on the same network via a standard web browser without requiring application installation.
2. THE mobile viewer page SHALL display the current score, period, game clock, shot clock, team fouls, and timeout indicators for both teams, updating in real time via WebSocket push within 500 milliseconds of a state change.
3. THE mobile viewer page SHALL be responsive and render correctly on screen widths between 320 px and 1024 px, using a single-column stacked layout on widths below 600 px and a two-column team layout (one team per column) on widths of 600 px and above.
4. THE mobile viewer page SHALL achieve a minimum contrast ratio of 4.5:1 (WCAG AA) for all text and icon elements against their background to ensure legibility on mobile screens under varying lighting conditions.
5. THE mobile viewer page SHALL include a read-only box score tab displaying per-player stats (jersey number, name, points, rebounds, assists, steals, blocks, fouls) for both teams for the current game.
6. WHEN the Application is not running or the mobile viewer server is stopped, any browser loading the viewer URL SHALL display a "Scoreboard Offline" message rather than a browser error page or blank page.
7. THE Admin SHALL be able to enable or disable the mobile viewer server from the Admin settings area; WHEN disabled, THE Application SHALL refuse all incoming connections to the viewer port and display a "Server disabled" message to any browser attempting to connect.
8. THE Application SHALL display the local network IPv4 URL and a scannable QR code encoding that URL in the Control Panel status area whenever the mobile viewer server is active, enabling the Operator to share access with coaches and players quickly.
