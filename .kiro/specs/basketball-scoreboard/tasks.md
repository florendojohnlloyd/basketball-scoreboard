# Implementation Plan: Basketball Scoreboard

## Overview

90 tasks implementing the Basketball Scoreboard Electron application. Tasks 1–39 cover the original core features (Requirements 1–12) and are already implemented. Tasks 40–90 cover the extended features (Requirements 13–36): player/team stats, box score, data analytics, management tools, RBAC, backup/recovery, offline sync, audit logs, cloud sync, live streaming, REST API, social sharing, and mobile viewer.

## Tasks

- [x] 1. Project scaffold and build configuration
- [x] 2. Core TypeScript types and data models
- [x] 3. GameStore — pure reducer and state management
- [x] 4. ClockEngine — drift-compensated timer
- [x] 5. WindowManager — dual-window and monitor management
- [x] 6. PresetStore — persistence and built-in presets
- [x] 7. IPC wiring — command router and state broadcast
- [x] 8. Control Panel renderer shell and Zustand store
- [x] 9. ScorePanel component
- [x] 10. GameClockControl component
- [x] 11. ShotClockControl component
- [x] 12. PeriodControl component
- [x] 13. FoulPanel component
- [x] 14. TimeoutPanel component
- [x] 15. TeamConfigPanel component
- [x] 16. MonitorSelector component
- [x] 17. GameConfigPanel and preset UI
- [x] 18. ManualBuzzerButton and VolumeControl components
- [x] 19. StatusBar component
- [x] 20. AudioEngine (Web Audio API)
- [x] 21. Scoreboard Display renderer shell and Zustand store
- [x] 22. ScoreboardLayout and TeamSection components
- [x] 23. ClockDisplay component (game clock)
- [x] 24. ShotClockDisplay component
- [x] 25. PeriodDisplay component
- [x] 26. Property-based tests — validation.test.ts (Properties 1, 8, 14, 15, 23)
- [x] 27. Property-based tests — gameReducer.test.ts (Properties 2–5, 7, 10, 12–13, 16, 20–22)
- [x] 28. Property-based tests — clockDisplay.test.ts (Properties 6, 9)
- [x] 29. Property-based tests — periodLabel.test.ts (Property 11)
- [x] 30. Property-based tests — TimeoutIndicator.test.tsx (Property 17)
- [x] 31. Property-based tests — presetStore.test.ts (Properties 18, 19)
- [x] 32. Property-based tests — AudioEngine.test.ts (Property 24)
- [x] 33. Example-based unit tests — GameStore behaviors
- [x] 34. Example-based unit tests — ClockEngine behaviors
- [x] 35. Example-based unit tests — PresetStore behaviors
- [x] 36. Example-based unit tests — Control Panel component behaviors
- [x] 37. Example-based unit tests — Scoreboard Display component behaviors
- [x] 38. E2E tests — Playwright test suite
- [x] 39. Packaging and production build configuration
- [x] 40. Install extended-feature npm packages
- [x] 41. Extend core TypeScript types for Requirements 13–36
- [x] 42. Extended player stats — GameStore reducer extensions (Req 13)
- [x] 43. Team-level derived statistics (Req 14)
- [x] 44. Player jersey numbers on Scoreboard Display (Req 15)
- [x] 45. Player photos — upload, storage, and display (Req 16)
- [x] 46. Box score generation — period snapshots and view (Req 17)
- [x] 47. LigaStore and game log persistence (Req 18)
- [x] 48. Season averages view (Req 19)
- [x] 49. Statistical leaderboards view (Req 20)
- [x] 50. Advanced player metrics — PEI, plus/minus, efficiency (Req 21)
- [x] 51. Export reports — PDF and Excel (Req 22)
- [x] 52. Team roster management UI (Req 23)
- [x] 53. Schedule management UI (Req 24)
- [x] 54. Venue and court assignment (Req 25)
- [x] 55. Referee and staff assignment (Req 26)
- [x] 56. Attendance tracking (Req 27)
- [x] 57. RoleStore — user accounts and RBAC (Req 28)
- [x] 58. Login screen and session management (Req 28)
- [x] 59. IPC role enforcement middleware (Req 28)
- [x] 60. User management UI (Req 28)
- [x] 61. AuditStore — append-only SQLite audit log (Req 31)
- [x] 62. Audit log view and CSV export UI (Req 31)
- [x] 63. BackupService — manual and scheduled zip backup (Req 29)
- [x] 64. Restore flow and manifest validation (Req 29)
- [x] 65. Backup/restore UI (Req 29)
- [x] 66. OfflineSyncService — connectivity monitoring and pending-changes queue (Req 30)
- [x] 67. Sync conflict resolution UI (Req 30)
- [x] 68. CloudSyncService — incremental TLS sync (Req 32)
- [x] 69. Cloud sync settings and status UI (Req 32)
- [x] 70. OverlayServer — HTTP + WebSocket browser-source overlay (Req 33)
- [x] 71. RTMP streaming via ffmpeg (Req 33)
- [x] 72. Live streaming settings and status UI (Req 33)
- [x] 73. ApiServer — local REST API with authentication (Req 34)
- [x] 74. API key management UI (Req 34)
- [x] 75. SocialShareService — OAuth 2.0 and post dispatch (Req 35)
- [x] 76. Social sharing UI (Req 35)
- [x] 77. MobileViewerServer — responsive web page and WebSocket (Req 36)
- [x] 78. Mobile viewer QR code display in Control Panel (Req 36)
- [x] 79. PBT — roleStore.test.ts (Properties 25–28)
- [x] 80. PBT — backupService.test.ts (Properties 29–30)
- [x] 81. PBT — offlineSyncService.test.ts (Property 31)
- [x] 82. PBT — auditStore.test.ts (Properties 32–34)
- [x] 83. PBT — cloudSyncService.test.ts (Property 35)
- [-] 84. PBT — apiServer.test.ts (Properties 36–37)
- [-] 85. PBT — socialShareService.test.ts (Property 38)
- [-] 86. PBT — mobileViewerServer.test.ts (Property 39)
- [-] 87. Example-based unit tests — extended features
- [-] 88. Integration tests — servers and WebSocket push
- [x] 89. E2E tests — extended features (Playwright)
- [x] 90. Final packaging update for extended features


## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1,  "tasks": ["1"] },
    { "wave": 2,  "tasks": ["2"] },
    { "wave": 3,  "tasks": ["3","5","6"] },
    { "wave": 4,  "tasks": ["4","7"] },
    { "wave": 5,  "tasks": ["8","21"] },
    { "wave": 6,  "tasks": ["9","10","11","12","13","14","15","16","17","18","19","20"] },
    { "wave": 7,  "tasks": ["22","23","24","25"] },
    { "wave": 8,  "tasks": ["26","27","28","29","30","31","32","33","34","35","36","37"] },
    { "wave": 9,  "tasks": ["38"] },
    { "wave": 10, "tasks": ["39"] },
    { "wave": 11, "tasks": ["40","41"] },
    { "wave": 12, "tasks": ["42","43","61"] },
    { "wave": 13, "tasks": ["44","45","46","47","57"] },
    { "wave": 14, "tasks": ["48","49","50","51","52","53","58","63"] },
    { "wave": 15, "tasks": ["54","55","56","59","62","64","66","68","70","73","75","77"] },
    { "wave": 16, "tasks": ["60","65","67","69","71","72","74","76","78"] },
    { "wave": 17, "tasks": ["79","80","81","82","83","84","85","86","87","88"] },
    { "wave": 18, "tasks": ["89"] },
    { "wave": 19, "tasks": ["90"] }
  ]
}
```

## Task Details

### 40. Install extended-feature npm packages

Install all new runtime and dev dependencies required by Requirements 13–36.

- Install runtime: `bcrypt`, `archiver`, `unzipper`, `node-cron`, `better-sqlite3`, `express`, `ws`, `fluent-ffmpeg`, `express-rate-limit`, `swagger-ui-express`, `uuid`, `qrcode`, `form-data`
- Install dev types: `@types/bcrypt`, `@types/archiver`, `@types/node-cron`, `@types/better-sqlite3`, `@types/express`, `@types/ws`, `@types/fluent-ffmpeg`, `@types/swagger-ui-express`, `@types/uuid`, `@types/qrcode`, `@types/form-data`
- Pin all packages to exact versions (no `^` or `~`) in `package.json`
- Add `fast-check` to devDependencies if not already present
- Verify `npm install` completes without peer dependency errors
- Verify `npm run build` still succeeds after installation

**Requires:** Task 1

### 41. Extend core TypeScript types for Requirements 13–36

Add all new interfaces and types to `src/shared/types.ts` required by extended features.

- Add `PlayerStats`: `{ points, rebounds, assists, steals, blocks, fga, fgm, fouls, active, jerseyNumber, photoPath, minutesPlayed, substitutions }`
- Add `TeamStats`: `{ turnovers }` (FG% and total rebounds are derived)
- Add `PeriodSnapshot`: `{ period, teamId, playerSnapshots: PlayerStats[] }`
- Add `GameLogRecord`: `{ id, ligaId, date, homeTeam, awayTeam, finalScores, playerStats, events, periodSnapshots, scheduledGameId?, attendance? }`
- Add `ScheduledGame`: `{ id, ligaId, date, homeTeamId, awayTeamId, venueId?, courtId?, assignedStaff, status, gameLogId?, attendance? }`
- Add `Venue`: `{ id, name, address? }`
- Add `StaffMember`: `{ id, name, role }`
- Add `UserAccount`: `{ id, username, passwordHash, role, createdAt, failedAttempts, lockedUntil? }`
- Add `AuditEntry`: `{ id, timestamp, username, role, actionType, entityId, previousValue, newValue }`
- Add `BackupManifest`: `{ createdAt, appVersion, files }`
- Add `BackupScheduleConfig`: `{ enabled, frequency, destinationFolder }`
- Add `PendingChange`: `{ id, timestamp, entityType, entityId, changeType, payload }`
- Add `CloudSyncConfig`: `{ enabled, endpointUrl, apiKey }`
- Add `OverlayConfig`: `{ visibleElements, fontScaleFactor, backgroundAlpha }`
- Add `RtmpConfig`: `{ destinationUrl, streamKey }`
- Add `ApiKey`: `{ id, label, keyHash, createdAt, active }`
- Add `Role` type union and `ActionCategory` type union
- Extend `CommandType` with all new command variants for extended features
- Verify zero TypeScript errors across all files

**Requires:** Task 2

### 42. Extended player stats — GameStore reducer extensions (Req 13)

Extend `gameReducer` to handle per-player stat tracking commands.

- Add commands: `ADD_PLAYER_STAT`, `SUBTRACT_PLAYER_STAT` for `steals`, `blocks`, `fga`, `fgm`, `rebounds`, `assists`, `points`, `fouls`
- When `fgm` is incremented, also increment `fga` for the same player atomically
- When `fgm` is decremented, also decrement `fga`, ensuring `fgm` never exceeds `fga`
- All per-player stat counters are floored at 0 — no negative values
- Add `TOGGLE_PLAYER_ACTIVE` command: toggles `active` flag and records a `SubstitutionEntry { clockMs, period, active }` in `player.substitutions`
- Extend `NEW_GAME` to reset all per-player stats (`steals`, `blocks`, `fga`, `fgm`) to 0
- Extend the undo stack to include new stat-change commands
- Write example-based tests: FGM increment also increments FGA; decrement FGM also decrements FGA; FGM never exceeds FGA after arbitrary increments/decrements

**Requires:** Tasks 3, 41
**Validates:** Requirement 13

### 43. Team-level derived statistics (Req 14)

Implement team FG%, total rebounds, and turnover counter in the Control Panel.

- Add `ADD_TURNOVER` / `SUBTRACT_TURNOVER` commands to the reducer; turnover counter is floored at 0; reset to 0 on `NEW_GAME`
- Add derived selectors in the Control Panel Zustand store: `teamFgPct(team)` = sum(FGM) / sum(FGA) × 100, returning `null` when FGA = 0; `teamRebounds(team)` = sum of all player rebound counts
- Create `src/renderer/controlPanel/components/TeamStatsPanel.tsx`: displays FG% ("—" when FGA = 0), total rebounds, and turnover count with +/− buttons; updates within 200 ms of any player stat change
- Wire turnover commands through IPC and integrate into the Control Panel layout
- Write example-based test: FGA = 0 shows "—" for FG%; FGA > 0 shows correct percentage rounded to one decimal

**Requires:** Tasks 42, 8
**Validates:** Requirement 14

### 44. Player jersey numbers on Scoreboard Display (Req 15)

Display each active player's jersey number on the Scoreboard Display.

- Extend `TeamSection` component to render a player list: jersey number + name + current points per active player
- Jersey number font size: at least 50% of the player name font size (use CSS relative units)
- When `jerseyNumber` is null or empty, render an empty string in that position without disrupting layout
- Wire `SET_TEAM_CONFIG` player updates through IPC so the scoreboard updates within 200 ms
- Write example-based test: player with `jerseyNumber: null` renders without visible number but layout is unchanged

**Requires:** Tasks 22, 42
**Validates:** Requirement 15

### 45. Player photos — upload, storage, and display (Req 16)

Implement player photo assignment, validation, storage, and rendering.

- Add `ASSIGN_PLAYER_PHOTO` command: accepts a file path; validates JPEG/PNG by reading magic bytes in the main process; rejects files > 5 MB; stores path relative to user-data directory
- On validation failure, send an IPC error event with the file name and reason; do not modify the player record
- In the Control Panel `PlayerList`, render a photo thumbnail (40×40 px) when `photoPath` is set; show a placeholder silhouette SVG when `photoPath` is null
- WHERE `settings.showPhotosOnScoreboard` is true, render each active player's photo thumbnail on the Scoreboard Display alongside their stats row; use a fallback silhouette when the photo file is missing or unreadable at display time, and log a warning to the Control Panel status area
- Add `TOGGLE_SHOW_PHOTOS_ON_SCOREBOARD` command to settings
- Write example-based tests: file > 5 MB is rejected; non-JPEG/PNG is rejected; valid file path is stored; missing file at display time shows silhouette

**Requires:** Tasks 44, 41
**Validates:** Requirement 16

### 46. Box score generation — period snapshots and view (Req 17)

Implement automatic period-end snapshots and a post-game box score view.

- Add `CAPTURE_PERIOD_SNAPSHOT` command: copies each player's cumulative stats at period end into `GameState.periodSnapshots`; triggered automatically when `ADVANCE_PERIOD` is dispatched
- Compute per-period increments as: snapshot[period] - snapshot[period-1] (or 0 for period 1)
- Create `src/renderer/controlPanel/components/BoxScoreView.tsx`: read-only table, one row per player per team; columns: #, Name, PTS, REB, AST, STL, BLK, FGA, FGM, FGA%, PF; totals row per team; per-period columns collapsed by default, expandable
- Show "View Box Score" action in the Control Panel when `gamePhase === 'post-game'`
- No cells in the box score view are editable
- Write example-based tests: period 2 increments equal cumulative totals at end of Q2 minus totals at end of Q1; totals row sums correctly

**Requires:** Tasks 42, 43, 8
**Validates:** Requirement 17

### 47. LigaStore and game log persistence (Req 18)

Implement automatic game log saving and the Game History view.

- Extend `LigaStore` (already exists at `src/main/ligaStore.ts`) to write `GameLogRecord` JSON files to `userData/gameLogs/<ligaId>/` on save
- Prompt the operator to save when `NEW_GAME` is triggered and `gamePhase` is `in-game` or `post-game`; show a save/discard/cancel dialog
- `GameLogRecord` fields: id, ligaId, date (ISO 8601), homeTeam, awayTeam, finalScores, playerStats totals, GameEvent log entries, periodSnapshots
- Create `src/renderer/controlPanel/components/GameHistoryView.tsx`: lists all saved logs for the current Liga sorted by date descending; shows date, teams, final score; clicking an entry opens a read-only detail view with box score + event log
- Delete game log: confirm dialog → remove JSON file from disk
- Handle corrupted/unreadable log files: exclude from list, show warning with filename
- Write example-based tests: saved record loads identically; corrupted file excluded from list; delete removes file

**Requires:** Tasks 46, 41
**Validates:** Requirement 18

### 48. Season averages view (Req 19)

Implement per-player and per-team season average computation and display.

- Create `computeSeasonAverages(gameLogs: GameLogRecord[]): SeasonStats` in `src/main/analytics.ts`
- Per-player: sum each stat across games where the player appeared (any stat > 0) ÷ games played; include points, rebounds, assists, steals, blocks, FG%
- Per-team: points per game, FG%, rebounds per game, assists per game, turnovers per game
- Averages are recomputed each time the view is opened (no cached aggregate)
- Create `SeasonStatsView` component: shows player averages table and team averages section; displays "No games recorded for this season" when no logs exist
- Add navigation to the Season Stats view from the main Control Panel

**Requires:** Task 47
**Validates:** Requirement 19

### 49. Statistical leaderboards view (Req 20)

Implement ranked leaderboards for key statistical categories.

- Extend `src/main/analytics.ts` with `computeLeaderboards(gameLogs: GameLogRecord[]): Leaderboards`
- Categories: points per game, rebounds per game, assists per game, steals per game, blocks per game
- Top 10 per category, descending order; only players with ≥ 1 game appearance
- Each entry: rank, player name, team name, value rounded to 1 decimal
- Create `LeaderboardsView` component: tabbed or sectioned display per category; refreshes when Liga switches
- Wire Liga switch event to trigger leaderboard data reload

**Requires:** Task 47
**Validates:** Requirement 20

### 50. Advanced player metrics — PEI, plus/minus, efficiency (Req 21)

Implement Player Efficiency Index, plus/minus, and efficiency tracking.

- Track minutes played per player using substitution entries: each `TOGGLE_PLAYER_ACTIVE` records `{ clockMs, period }` in `player.substitutions`; compute elapsed game-clock time between active start/stop pairs
- Compute PEI = (PTS + REB + AST + STL + BLK − (FGA − FGM) − PF) ÷ minutesPlayed; display "—" when minutesPlayed = 0
- Compute plus/minus: track score delta (team − opponent) during all intervals the player was active; updated on every score change
- Compute efficiency = PTS + REB + AST + STL + BLK − (FGA − FGM) − PF (no division)
- Create `AdvancedMetricsPanel` component: shows PEI, +/−, and Efficiency per player; updates within 200 ms of any relevant stat change
- Add to the Control Panel layout alongside the player list

**Requires:** Task 42
**Validates:** Requirement 21

### 51. Export reports — PDF and Excel (Req 22)

Implement PDF and Excel export for box score and season stats views.

- Add `jspdf` and `exceljs` (or equivalent well-maintained packages) for document generation
- Create `src/main/exportService.ts` with `exportPdf(data, destinationPath)` and `exportExcel(data, destinationPath)`
- PDF: include Liga name, game date, both team names, all stat rows visible in the source view
- Excel: one worksheet per team (box score) or one worksheet per category (season stats); numeric cells formatted as numbers, not text; column headers match UI stat labels
- Add "Export" action to `BoxScoreView` and `SeasonStatsView`; open native save-file dialog (main process `dialog.showSaveDialog`); show confirmation with file path on success
- If the destination is not writable: show error message; do not leave a partial file on disk
- Write example-based tests: exported Excel file has correct worksheet count; PDF file is non-zero bytes; write-permission failure shows error without partial file

**Requires:** Tasks 46, 48
**Validates:** Requirement 22

### 52. Team roster management UI (Req 23)

Implement the Roster Management view for adding, editing, and removing players per Liga team.

- Create `src/renderer/controlPanel/components/RosterManagementView.tsx`
- Display all players for a Liga team: name, jersey number (1–99, unique within team), photo thumbnail
- Add player: name (1–50 chars) + jersey number; show validation error and prevent save on duplicate jersey number
- Edit player in place: same validation rules; persist to Liga JSON via IPC
- Remove player: confirm dialog → delete record from Liga JSON
- Assign/replace photo: same constraints as Requirement 16 (JPEG/PNG, max 5 MB)
- When the Liga team is loaded into the active game via `LOAD_LIGA_TEAMS`, the Control Panel reflects the updated roster
- Write example-based tests: duplicate jersey number blocked; valid add persists; delete removes record

**Requires:** Tasks 45, 47
**Validates:** Requirement 23

### 53. Schedule management UI (Req 24)

Implement the Schedule Management view for creating and tracking scheduled games.

- Create `src/renderer/controlPanel/components/ScheduleManagementView.tsx`
- Create scheduled game: date (validated calendar date), home team, away team (must differ); validation errors prevent save
- List all scheduled games sorted by date ascending: date, home/away team, venue, status (Scheduled / In Progress / Completed)
- Mark game "Completed" by linking to a saved game log; store `scheduledGameId` in the log record
- Delete scheduled game: confirm dialog; does not delete the associated game log
- Persist all entries in Liga JSON under `schedule` array
- Write example-based tests: same team for both sides rejected; invalid date rejected; delete does not remove linked game log

**Requires:** Task 47
**Validates:** Requirement 24

### 54. Venue and court assignment (Req 25)

Implement venue records and assignment to scheduled games.

- Add Venue Management section to `ScheduleManagementView`: create venue with name (1–80 chars) and optional address (≤ 200 chars)
- When creating/editing a scheduled game: optionally assign a venue from the saved list; court field (1–20 chars) is only available when a venue is assigned
- Display venue name and court in the schedule list
- Persist venues under `venues` array in the Liga JSON; store venue ID and court in each scheduled game entry
- When a venue is deleted: clear venue/court from all affected scheduled game entries; show warning for each affected entry
- Write example-based tests: court field unavailable without venue; venue deletion clears affected entries

**Requires:** Task 53
**Validates:** Requirement 25

### 55. Referee and staff assignment (Req 26)

Implement staff records and assignment to scheduled games.

- Add Staff Management section to the Liga management area: create staff with name (1–50 chars) and role (Referee, Scorekeeper, Shot Clock Operator, or custom ≤ 30 chars)
- When creating/editing a scheduled game: assign one or more staff members; same staff member cannot be assigned twice to the same game
- Schedule list shows assigned staff count; detail view lists all assigned staff with names and roles
- Persist staff under `staff` array in Liga JSON; store IDs under `assignedStaff` in each scheduled game
- When a staff record is deleted: remove from all game entries; display notification with count of affected entries
- Write example-based tests: duplicate assignment blocked; staff deletion removes from all games

**Requires:** Task 53
**Validates:** Requirement 26

### 56. Attendance tracking (Req 27)

Implement attendance recording and display.

- Add attendance input field to the scheduled game detail view: integer 0–99 999; show validation error for non-integer or out-of-range values; persist to Liga JSON on save
- Game History detail view shows the attendance figure, or "—" if not recorded
- Season Stats view shows total season attendance and average attendance per game (total ÷ games with recorded attendance)
- When a game log is saved and a scheduled game entry exists for the same matchup and date, automatically associate them (set `gameLogId` on the scheduled entry)
- Write example-based tests: non-integer rejected; value out of range rejected; auto-association matches correctly

**Requires:** Tasks 47, 53
**Validates:** Requirement 27

### 57. RoleStore — user accounts and RBAC (Req 28)

Implement the `RoleStore` service in the main process.

- Create `src/main/roleStore.ts`
- Store user accounts as a dedicated `electron-store` instance (`users.json`); passwords hashed with `bcrypt` at `saltRounds: 12`
- Implement `createUser`, `updateUser`, `changePassword`, `deleteUser` (rejects if sole Admin), `authenticate`, `canPerform`, `validatePassword`
- `canPerform(role, action)` implements the full permission matrix from the design (10 ActionCategories × 4 Roles)
- `validatePassword(p)`: returns `{ valid: true }` when length ≥ 8 with ≥ 1 uppercase, ≥ 1 digit, ≥ 1 special char; otherwise `{ valid: false, reason }`
- Account lockout: after 3 consecutive failed `authenticate` calls, set `lockedUntil = now + 5 min`; reset `failedAttempts` to 0 when lockout expires
- On first launch (no accounts exist), bootstrap creates no account — the login screen handles initial setup
- Write example-based tests: sole Admin deletion rejected; lockout triggers at attempt 3; lockout clears after expiry; bcrypt hash is not plain text

**Requires:** Task 41, Task 40
**Validates:** Requirement 28

### 58. Login screen and session management (Req 28)

Implement the login screen and in-memory session for the Control Panel.

- Create `src/renderer/controlPanel/components/LoginScreen.tsx`: username + password fields, submit button, error message on invalid credentials, lockout message with remaining time when account is locked
- On first launch (no accounts exist), show an Admin setup screen requiring username + password satisfying `validatePassword` rules; confirm before granting access
- After successful login, send `AUTH_STATE` IPC event with `{ user: { id, username, role } }` to the renderer; store in Zustand
- The main `App.tsx` renders `<LoginScreen>` when `session === null`, and the full Control Panel when `session !== null`
- Implement logout: clears session, returns to login screen; `AUTH_STATE` event with `user: null`
- Write example-based tests: wrong password shows error; 3 failed attempts shows lockout message; successful login shows Control Panel; logout shows login screen

**Requires:** Task 57
**Validates:** Requirement 28

### 59. IPC role enforcement middleware (Req 28)

Wrap every IPC command handler with RBAC permission checks.

- In `src/main/ipcRouter.ts`, maintain an in-memory session map: `Map<webContentsId, { userId, role }>`
- Before dispatching any `scoreboard:command`, call `roleStore.canPerform(session.role, requiredCategory(command.type))`
- If permission is denied: send `{ type: 'ACCESS_DENIED', required: category }` event back to the sender; do not dispatch to GameStore; do not write an audit entry for the blocked command
- Implement `requiredCategory(commandType): ActionCategory` — a static mapping from every command type to its action category
- Add IPC handlers for `AUTH_LOGIN`, `AUTH_LOGOUT`, `USER_LIST`, `USER_CREATE`, `USER_UPDATE`, `USER_DELETE`, `USER_CHANGE_PASSWORD`
- Write example-based tests: Viewer role blocked from `ADD_SCORE`; Admin passes all categories; Scorekeeper blocked from `LIGA_CONFIG` commands

**Requires:** Tasks 57, 7
**Validates:** Requirement 28

### 60. User management UI (Req 28)

Implement the user management screen for Admin users.

- Create `src/renderer/controlPanel/components/UserManagementView.tsx` — only rendered when `session.role === 'Admin'`
- List all user accounts: username, role, created date; Admin accounts marked with a badge
- Create user: username + password (with strength indicator) + role selector; inline validation errors
- Edit user: change username and/or role; change password (opens a separate password-change modal)
- Delete user: confirm dialog; disabled if the account is the sole Admin (show tooltip explaining why)
- Show inline error when attempted actions exceed permissions

**Requires:** Tasks 58, 59
**Validates:** Requirement 28

### 61. AuditStore — append-only SQLite audit log (Req 31)

Implement the `AuditStore` service backed by `better-sqlite3`.

- Create `src/main/auditStore.ts`
- Open/create `userData/audit.db` with the schema: `audit_log` table (id, timestamp, username, role, action_type, entity_id, previous_value, new_value); indexes on timestamp, username, action_type
- `append(entry: AuditEntry): void` — synchronous INSERT; if the INSERT throws, emit `AUDIT_WRITE_FAILED` event to Control Panel but do not throw (non-blocking)
- `query(filter: AuditFilter): AuditEntry[]` — SELECT with optional date range, username, actionType filters
- `exportCsv(filter, destinationPath)` — write filtered results as CSV with headers matching `AuditEntry` field names
- `purgeOldEntries()` — DELETE WHERE timestamp < 12 months ago; call at app launch
- If `audit.db` is unreadable at launch: create a new empty database, send `AUDIT_DB_RESET` warning to Control Panel
- Wire `auditStore.append(...)` call into `ipcRouter.ts` after every successful state-changing dispatch; pass the active session's username and role

**Requires:** Tasks 41, 40, 7
**Validates:** Requirement 31

### 62. Audit log view and CSV export UI (Req 31)

Implement the Audit Log view accessible to Admin and Scorekeeper roles.

- Create `src/renderer/controlPanel/components/AuditLogView.tsx`
- Display entries sorted by timestamp descending; columns: timestamp, user, role, action type, entity, change description (derived from previous/new value)
- Filter controls: date range (from/to), username dropdown, action type dropdown; list updates within 500 ms of filter change
- "Export CSV" button: opens native save-file dialog via IPC, writes filtered entries, shows confirmation with file path
- Only visible when `session.role === 'Admin' || session.role === 'Scorekeeper'`
- Entries are read-only — no edit or delete controls

**Requires:** Tasks 61, 59
**Validates:** Requirement 31

### 63. BackupService — manual and scheduled zip backup (Req 29)

Implement `BackupService` using `archiver` and `node-cron`.

- Create `src/main/backupService.ts`
- `createBackup(destinationPath)`: collect all files from `userData/` (ligas, gameLogs, presets, photos, users.json, audit.db); write `manifest.json` first (createdAt, appVersion, files list); zip everything with `archiver`; throw on write failure without leaving a partial file
- `validateArchive(archivePath)`: read the zip, verify `manifest.json` present and all listed files exist in the archive; return `{ valid, error? }`
- `scheduleAutoBackup(config)`: register a `node-cron` job with the configured frequency; on trigger, call `createBackup(destinationFolder/backup_<timestamp>.zip)`; on folder-inaccessible error, emit `BACKUP_DESTINATION_INACCESSIBLE` to Control Panel; dismiss warning only when next backup succeeds to that folder
- `cancelAutoBackup()`: stop the cron job
- Wire `createBackup` call through IPC (`BACKUP_CREATE` opens `dialog.showSaveDialog` in main process first)

**Requires:** Tasks 41, 40, 61
**Validates:** Requirement 29

### 64. Restore flow and manifest validation (Req 29)

Implement the restore path including validation, confirmation, and app relaunch.

- `restoreFromArchive(archivePath)`: call `validateArchive`; if invalid, throw with a descriptive error (do not modify existing data); on valid, show confirmation dialog (`dialog.showMessageBox`) stating that current data will be overwritten; on confirm, extract archive contents to `userData/` using `unzipper`, then call `app.relaunch()` + `app.exit(0)`
- Any unsaved in-progress game changes are discarded before extraction begins (document this in the confirmation dialog text)
- If extraction fails mid-way: catch error, restore original files from a temporary copy, and show an error message
- Add IPC handler `BACKUP_RESTORE`: opens `dialog.showOpenDialog` (filter: `.zip`), then calls `restoreFromArchive`

**Requires:** Task 63
**Validates:** Requirement 29

### 65. Backup/restore UI (Req 29)

Implement the backup and restore controls in the Admin settings area.

- Add Backup section to `SettingsPanel` (Admin only): "Backup Now" button (triggers `BACKUP_CREATE` IPC), "Restore" button (triggers `BACKUP_RESTORE` IPC)
- Add auto-backup schedule configuration: frequency selector (daily / weekly / monthly), destination folder picker; "Save Schedule" button; "Disable Auto-Backup" toggle
- Show last backup timestamp and status in the settings panel
- Render persistent `BACKUP_DESTINATION_INACCESSIBLE` warning in the status bar when auto-backup fails; dismiss automatically when next backup succeeds
- Show success confirmation with file path after a completed backup

**Requires:** Tasks 63, 64, 19
**Validates:** Requirement 29

### 66. OfflineSyncService — connectivity monitoring and pending-changes queue (Req 30)

Implement connectivity detection and the pending-changes queue backed by SQLite.

- Create `src/main/offlineSyncService.ts`
- Poll connectivity every 10 seconds using `dns.resolve('8.8.8.8')`; on status change, emit `CONNECTIVITY_CHANGED` IPC event to Control Panel
- On every successful `gameStore.dispatch()`, call `enqueueChange(entry)` which INSERTs to `sync.db` (`pending_changes` table) when Cloud Sync is enabled
- `replayPending()`: SELECT all entries ordered by timestamp; transmit to `CloudSyncService`; on success, DELETE those IDs; on failure, retry up to 3 times at 60-second intervals; after 3 failures, emit `SYNC_FAILED` with attempt count
- When connectivity is restored, call `replayPending()` within 30 seconds
- `CONNECTIVITY_CHANGED` with `online: true` triggers replay; `online: false` shows "Offline" indicator in status bar
- All local features remain fully functional regardless of connectivity state

**Requires:** Tasks 41, 40, 61
**Validates:** Requirement 30

### 67. Sync conflict resolution UI (Req 30)

Implement the conflict resolution dialog for offline sync.

- When `SYNC_CONFLICT` IPC event is received (local and remote versions differ), show a modal dialog in the Control Panel
- Dialog shows both versions side-by-side: field name, local value, remote value, timestamps
- Operator chooses "Keep Local" or "Use Remote"; on cancel, local version is retained
- Send `SYNC_CONFLICT_RESOLVED` command with the operator's choice back to main process
- While conflict dialog is open, sync continues for non-conflicting records
- Write example-based test: cancel defaults to keeping local version

**Requires:** Task 66
**Validates:** Requirement 30

### 68. CloudSyncService — incremental TLS sync (Req 32)

Implement `CloudSyncService` for incremental synchronization to a configurable HTTPS endpoint.

- Create `src/main/cloudSyncService.ts`
- `configure(config: CloudSyncConfig)`: validate endpoint URL starts with `https://`; store API Key encrypted via `safeStorage`
- `testConnection()`: POST to endpoint with a 10-second timeout; return `{ ok, error? }` with error description on failure
- `syncNow()`: query `sync.db` for records newer than `lastSyncAt`; batch-transmit as `SyncEnvelope[]` to the endpoint with `Authorization: Bearer <apiKey>` header; update `lastSyncAt` on success; log result to `AuditStore`
- Start a 5-minute poll interval when enabled; debounce individual-change triggers to 30 seconds
- On auth error (HTTP 401/403): stop automatic sync, emit `CLOUD_SYNC_AUTH_ERROR` to Control Panel
- On disable: stop all sync operations within 5 seconds; retain local data unchanged
- All transmissions use Node's built-in TLS (HTTPS); reject HTTP endpoints at configuration time

**Requires:** Tasks 66, 61, 40
**Validates:** Requirement 32

### 69. Cloud sync settings and status UI (Req 32)

Implement the Cloud Sync configuration panel in the Admin settings area.

- Add Cloud Sync section to `SettingsPanel` (Admin only): endpoint URL field, API Key field (masked), "Test Connection" button showing success/failure with error description, enable/disable toggle
- Show last-sync timestamp and "Syncing…" indicator during active sync (driven by `CLOUD_SYNC_STATUS` IPC events)
- Show persistent `CLOUD_SYNC_AUTH_ERROR` banner with "Re-enter credentials" prompt when auth fails
- "Sync Now" button for manual trigger
- Write example-based test: HTTP URL rejected at save; test connection success shows green indicator

**Requires:** Tasks 68, 65
**Validates:** Requirement 32

### 70. OverlayServer — HTTP + WebSocket browser-source overlay (Req 33)

Implement the `OverlayServer` serving an OBS-compatible browser-source overlay page.

- Create `src/main/overlayServer.ts`
- Spin up an `express` HTTP server + `ws` WebSocket server on the same `http.Server` instance
- Serve `resources/overlay/index.html` (transparent background, absolute-positioned scoreboard elements) from the express static middleware
- `broadcast(state)`: serialize score, period, game clock, team names, fouls, timeouts from `GameState` and push to all connected WebSocket clients; subscribers receive updates within 500 ms of state change
- `updateConfig(config: OverlayConfig)`: push config update to all connected clients; clients re-render within 1 second
- Port validation: range 1024–65535; if port in use at startup, emit `OVERLAY_PORT_CONFLICT` to Control Panel and do not bind
- Create `resources/overlay/index.html`: minimal HTML+CSS+JS; connects to `ws://localhost:<port>/ws`; renders elements based on received state and config; transparent background (suitable for OBS chroma-key or CSS background removal)

**Requires:** Tasks 41, 40, 7
**Validates:** Requirement 33

### 71. RTMP streaming via ffmpeg (Req 33)

Implement RTMP output by spawning an `ffmpeg` child process via `fluent-ffmpeg`.

- In `overlayServer.ts`, add `startRtmp(config: RtmpConfig)` and `stopRtmp()`
- Validate `config.destinationUrl` starts with `rtmp://` or `rtmps://`; reject and emit an error event otherwise
- Use `fluent-ffmpeg` to capture the scoreboard window (via screen capture input or the overlay webpage) and push to the RTMP endpoint with the configured stream key
- Track elapsed stream seconds in a `setInterval`; emit `RTMP_STATUS_UPDATE` every second to Control Panel
- On connection loss: auto-reconnect up to 3 times at 10-second intervals; emit `RTMP_RECONNECT_ATTEMPT` after each failure; after all 3 fail, emit `RTMP_FAILED` and mark stream as stopped
- Write example-based tests: invalid URL rejected; reconnect attempts capped at 3; stop clears interval

**Requires:** Task 70
**Validates:** Requirement 33

### 72. Live streaming settings and status UI (Req 33)

Implement the Live Streaming configuration panel in the Admin settings area.

- Add Live Streaming section to `SettingsPanel` (Admin only)
- Overlay server: port input (1024–65535, default 8080), enable/disable toggle; show port-conflict error when applicable
- Overlay config: checkboxes for visible elements (score, clock, period, fouls, timeouts), font scale slider (0.5–2.0×), transparency slider (0–100%)
- RTMP section: URL input, stream key input (masked), "Start Stream" / "Stop Stream" button
- Status bar integration: show "Streaming" badge with elapsed duration when RTMP is active; show reconnect warnings; show "Stream Failed" persistent alert after all retries exhausted

**Requires:** Tasks 70, 71, 19
**Validates:** Requirement 33

### 73. ApiServer — local REST API with authentication (Req 34)

Implement the `ApiServer` Express application in the main process.

- Create `src/main/apiServer.ts`
- Start Express on a configurable port in range 1024–65535 (default 3000); if port in use at startup, emit `API_PORT_CONFLICT` to Control Panel and do not bind
- Bearer token middleware: extract `Authorization: Bearer <key>` header; SHA-256 hash the key and compare to active key hashes loaded from `electron-store`; return HTTP 401 with `{ success: false }` on missing or invalid key
- Register read-only routes:
  - `GET /api/v1/game/state` — current `GameState` (scores, clocks, period, fouls, timeouts)
  - `GET /api/v1/game/players` — active player stats for current game
  - `GET /api/v1/gamelogs?page=1` — paginated game logs (20/page); return empty results array for out-of-range page
  - `GET /api/v1/season/averages` — season averages for current Liga
  - `GET /docs` — `swagger-ui-express` serving bundled OpenAPI 3.0 spec
- All responses: `Content-Type: application/json`, camelCase fields, `{ success, data, pagination? }` envelope
- Rate limiter: `express-rate-limit` keyed by API key value; 60 req/min; HTTP 429 with `Retry-After` header on excess
- After each request, call `auditStore.append(...)` with timestamp, endpoint, HTTP status, and API key label

**Requires:** Tasks 41, 40, 61, 47
**Validates:** Requirement 34

### 74. API key management UI (Req 34)

Implement API key CRUD controls in the Admin settings area.

- Add API Keys section to `SettingsPanel` (Admin only)
- List active keys: label, creation timestamp, partial key preview (first 8 chars + `…`)
- "Generate Key" button: opens a modal with a label input (1–50 chars); on confirm, calls `API_KEY_GENERATE` IPC; shows the full key once in a copy-to-clipboard field (never shown again)
- "Revoke" button per key: confirm dialog; calls `API_KEY_REVOKE` IPC; key is rejected by the server within 5 seconds
- Maximum 20 active keys enforced — "Generate Key" button disabled when limit reached with tooltip explaining why
- Show current API server port and running/stopped status

**Requires:** Tasks 73, 65
**Validates:** Requirement 34

### 75. SocialShareService — OAuth 2.0 and post dispatch (Req 35)

Implement `SocialShareService` for Twitter/X and Facebook sharing.

- Create `src/main/socialShareService.ts`
- Register custom URL scheme `ligacontrol://` using `app.setAsDefaultProtocolClient` at startup; handle `open-url` event to capture OAuth callback and complete PKCE code exchange
- `initiateOAuth(platform)`: generate PKCE verifier/challenge; open platform OAuth URL in system browser via `shell.openExternal`
- `handleOAuthCallback(url)`: extract `code` param, POST token exchange to platform API; store tokens using `safeStorage.encryptString` (NOT plain text on disk)
- `getTokenStatus(platform)`: return `'valid'` / `'expired'` / `'missing'`
- `sharePost(platform, text, imagePng?)`: attempt silent token refresh if expired; if refresh fails, emit `SHARE_OAUTH_NEEDED` event for renderer to show re-auth prompt; POST to platform API with text and optional multipart image attachment using `form-data`; log result to `AuditStore`
- `generateShareText(state)`: format `"[LigaName] | [Date]\n[Home] [HomeScore] – [AwayScore] [Away]\n[Period or 'Final']"`
- `captureScreenshot()`: call `scoreboardWindow.capturePage()` → PNG Buffer (works even when Display Monitor is disconnected)
- WHERE platform API does not support image attachment: post text-only; emit `SHARE_IMAGE_UNSUPPORTED` notification to renderer

**Requires:** Tasks 41, 40, 61
**Validates:** Requirement 35

### 76. Social sharing UI (Req 35)

Implement the Share action panel in the Control Panel.

- Add "Share" button to the active game view and Game History detail view; visible to Admin and Scorekeeper roles only
- On click, call `SHARE_GENERATE_TEXT` IPC; display result in an editable preview textarea
- Platform selector: Twitter/X and Facebook toggle buttons
- "Attach Screenshot" checkbox: calls `SHARE_CAPTURE_SCREENSHOT` IPC and shows a thumbnail preview
- "Post" button: calls `SHARE_POST` IPC with platform, edited text, and screenshot flag
- Handle `SHARE_OAUTH_NEEDED`: show "Connect [Platform]" prompt that triggers `SHARE_OAUTH_INITIATE`; after `SHARE_OAUTH_COMPLETE` event, auto-retry the post
- Handle `SHARE_IMAGE_UNSUPPORTED`: show non-blocking notification "Image sharing not available for [platform]"
- Show success or failure notification after `SHARE_POST_COMPLETE`

**Requires:** Tasks 75, 59
**Validates:** Requirement 35

### 77. MobileViewerServer — responsive web page and WebSocket (Req 36)

Implement `MobileViewerServer` serving a responsive live-scores page on the local network.

- Create `src/main/mobileViewerServer.ts`
- Start `express` + `ws` on a configurable port 1024–65535 (default 8081); if port in use, emit `MOBILE_VIEWER_PORT_CONFLICT` to Control Panel
- Serve `resources/viewer/index.html` — self-contained responsive HTML page that connects to `ws://[host]:[port]/ws`
- `broadcast(state)`: push full `GameState` to all connected WebSocket clients; clients update within 500 ms
- When disabled by Admin: stop the server; any browser hitting the port receives a "Server disabled" HTTP 503 page
- When server is not running (app not open): the Express catch-all returns a static "Scoreboard Offline" HTML page (not a browser error)
- `getLocalUrl()`: resolve local IPv4 via `os.networkInterfaces()`, return `http://<ip>:<port>`
- `generateQrCode()`: use `qrcode` package to encode `getLocalUrl()` as a base64 PNG data URI
- Create `resources/viewer/index.html`: responsive layout, single-column below 600 px, two-column ≥ 600 px; scores, period, game clock, shot clock, team fouls, timeouts; read-only box score tab; WCAG AA contrast ≥ 4.5:1; "Scoreboard Offline" state when WebSocket disconnects

**Requires:** Tasks 41, 40, 7
**Validates:** Requirement 36

### 78. Mobile viewer QR code display in Control Panel (Req 36)

Display the mobile viewer URL and QR code in the Control Panel status area.

- Extend `StatusBar` to show mobile viewer section when server is running: local URL as a clickable link (opens in system browser), QR code `<img>` rendered from the base64 data URI returned by `MOBILE_VIEWER_GET_QR` IPC call
- QR code size: 120×120 px in the status bar; alt text: "Scan to open mobile viewer"
- When server is stopped or disabled, hide the QR code section entirely
- Subscribe to `MOBILE_VIEWER_STATUS_CHANGED` events to update the display automatically
- Enable/disable toggle in the Admin settings area (`SettingsPanel`)

**Requires:** Tasks 77, 19, 65
**Validates:** Requirement 36

### 79. PBT — roleStore.test.ts (Properties 25–28)

Write property-based tests for the `RoleStore` module.

- Create `src/main/__tests__/roleStore.test.ts`
- **Property 25** — RBAC permission matrix complete and consistent: for `fc.constantFrom('Admin','Coach','Scorekeeper','Viewer')` × `fc.constantFrom(...ActionCategories)`, `canPerform(role, action)` matches the permission matrix table exactly; Admin is authorized for all actions; Viewer only for `VIEW_SCOREBOARD` — **Validates: Req 28.2–28.5**
- **Property 26** — Sole Admin deletion always rejected: generate user lists where exactly one account has Admin role; `deleteUser(adminId)` always returns a failure and leaves the list unchanged — **Validates: Req 28.7**
- **Property 27** — Password validation accepts strong and rejects weak: for `fc.string({ minLength: 0, maxLength: 50 })`, `validatePassword(p)` returns `valid: true` iff length ≥ 8, ≥ 1 uppercase, ≥ 1 digit, ≥ 1 special char — **Validates: Req 28.8**
- **Property 28** — User account round-trip preserves all fields: for `fc.array(fc.record({...}))` of valid accounts, save and reload; deeply equal — **Validates: Req 28.10**
- `numRuns: 100` for all properties

**Requires:** Task 57

### 80. PBT — backupService.test.ts (Properties 29–30)

Write property-based tests for the `BackupService` module.

- Create `src/main/__tests__/backupService.test.ts`; use a temp directory for archive I/O
- **Property 29** — Backup manifest lists every file: for `fc.array(fc.string())` file paths F, after `createBackup()` the manifest's `files` array contains every path in F with no omissions or phantom entries — **Validates: Req 29.1, 29.10**
- **Property 30** — Restore rejects invalid archives: for `fc.record({ hasManifest: fc.boolean(), missingFiles: fc.array(fc.string()) })`, `validateArchive()` returns `valid: false` when manifest is absent or any listed file is missing; `valid: true` only when all conditions met — **Validates: Req 29.6, 29.9**
- `numRuns: 100` for both properties

**Requires:** Tasks 63, 64

### 81. PBT — offlineSyncService.test.ts (Property 31)

Write a property-based test for the `OfflineSyncService` pending-changes ordering guarantee.

- Create `src/main/__tests__/offlineSyncService.test.ts`; mock the HTTP transport layer
- **Property 31** — Pending-changes replay preserves insertion order: for `fc.array(fc.record({ timestamp: fc.date(), payload: fc.jsonValue() }))`, enqueue entries in the generated order; call `replayPending()`; assert the HTTP calls were made in ascending timestamp order (E₁ before E₂ before … Eₙ) — **Validates: Req 30.7, 30.8**
- `numRuns: 100`

**Requires:** Task 66

### 82. PBT — auditStore.test.ts (Properties 32–34)

Write property-based tests for the `AuditStore` module.

- Create `src/main/__tests__/auditStore.test.ts`; use an in-memory SQLite database (`:memory:`)
- **Property 32** — Every state-changing dispatch produces a complete audit entry: for `fc.record({ actionType: fc.string(), entityId: fc.string(), previousValue: fc.jsonValue(), newValue: fc.jsonValue() })`, after `append(entry)` the stored entry contains all required fields (non-empty id, valid ISO 8601 timestamp, non-empty username, valid role, non-empty actionType, non-empty entityId, string previousValue, string newValue) — **Validates: Req 31.1, 31.2**
- **Property 33** — Purge removes only entries older than 12 months: for `fc.array(fc.record({ timestamp: fc.date() }))` with some timestamps > 12 months ago and some ≤ 12 months, after `purgeOldEntries()` every entry older than 12 months is absent and every entry within 12 months is present and unchanged — **Validates: Req 31.5**
- **Property 34** — CSV export row count matches filtered entry count: for `fc.array(fc.record({...}))` of N entries with a given filter, the generated CSV has exactly N data rows (plus 1 header row) with the correct field names — **Validates: Req 31.7**
- `numRuns: 100` for all properties

**Requires:** Task 61

### 83. PBT — cloudSyncService.test.ts (Property 35)

Write a property-based test for `CloudSyncService` incremental filtering.

- Create `src/main/__tests__/cloudSyncService.test.ts`; mock the HTTPS transport
- **Property 35** — Incremental sync transmits only records newer than the last checkpoint: for `fc.array(fc.record({ lastModified: fc.date() }))` and `fc.date()` checkpoint T, the sync payload contains exactly those records where `lastModified > T` and excludes all others — **Validates: Req 32.6**
- `numRuns: 100`

**Requires:** Task 68

### 84. PBT — apiServer.test.ts (Properties 36–37)

Write property-based tests for the `ApiServer` authentication and rate-limiting middleware.

- Create `src/main/__tests__/apiServer.test.ts`; use `supertest` for HTTP assertions against a test Express app instance
- **Property 36** — HTTP 401 for any missing or invalid API key: for `fc.string()` (random key values, none matching an active key) and `fc.constantFrom(...endpoints)`, every request with a missing, malformed, or non-matching Authorization header returns HTTP 401 with `{ success: false }` — **Validates: Req 34.3**
- **Property 37** — HTTP 429 with Retry-After after rate limit exceeded: for `fc.integer(61, 200)` request count N with a single valid key, after the 61st request within a 60-second window all further requests return HTTP 429 with a positive integer `Retry-After` header value — **Validates: Req 34.8**
- `numRuns: 100` for both properties

**Requires:** Task 73

### 85. PBT — socialShareService.test.ts (Property 38)

Write a property-based test for the `SocialShareService` text generation.

- Create `src/main/__tests__/socialShareService.test.ts`
- **Property 38** — Share text contains all required fields for any game state: for arbitrary `GameState` values (random team names, scores, periods, Liga names, any `gamePhase`), `generateShareText(state)` returns a string that contains: the Liga name, both team names, both scores as integers, and either the current period label or "Final" when `gamePhase === 'post-game'` — **Validates: Req 35.2**
- Use `fc.record` to generate arbitrary `GameState` with `fc.string()` team names and Liga names, `fc.nat()` scores, `fc.constantFrom('pre-game','in-game','post-game')` phase
- `numRuns: 100`

**Requires:** Task 75

### 86. PBT — mobileViewerServer.test.ts (Property 39)

Write a property-based test for the `MobileViewerServer` QR code URL encoding.

- Create `src/main/__tests__/mobileViewerServer.test.ts`
- **Property 39** — QR code encodes the correct mobile viewer URL: for `fc.ipV4()` IPv4 addresses and `fc.integer(1024, 65535)` port numbers, `generateQrCode()` produces a data URI whose decoded QR content exactly matches `http://<ipv4>:<port>` — decode the QR PNG using a test QR reader library (e.g., `jsqr`) to verify — **Validates: Req 36.8**
- `numRuns: 100`

**Requires:** Task 77

### 87. Example-based unit tests — extended features

Write example-based tests for all extended-feature modules not covered by property-based tests.

- `roleStore.test.ts` additions:
  - Account lockout triggers at exactly 3 failed attempts; lockout clears after 5 minutes (mocked timer via `vi.useFakeTimers`)
  - `changePassword` stores a bcrypt hash, never plain text
  - Viewer role blocked from `GAME_CONTROL`; Coach blocked from `USER_MANAGEMENT`
- `backupService.test.ts` additions:
  - Scheduled backup next-run computed correctly for daily / weekly / monthly frequency
  - Failed backup to inaccessible folder emits `BACKUP_DESTINATION_INACCESSIBLE` and retries on next launch
  - Successful backup after prior failure dismisses the persistent warning
- `offlineSyncService.test.ts` additions:
  - Conflict resolution: cancel retains local version
  - Retry capped at 3 attempts with 60-second intervals (mocked timer)
  - `CONNECTIVITY_CHANGED` with `online: false` emits "Offline" status to Control Panel
- `overlayServer.test.ts`:
  - WebSocket client receives state update after `broadcast()` call
  - Port conflict emits `OVERLAY_PORT_CONFLICT` and does not bind the server
  - Overlay config update pushed to connected clients within 1 second
- `apiServer.test.ts`:
  - `GET /api/v1/game/state` returns current game state with `Content-Type: application/json`
  - Revoked API key rejected in-memory immediately (synchronous set removal)
  - Page beyond total count returns empty `data` array with correct `pagination` metadata
  - `GET /docs` returns HTTP 200 with HTML body (swagger-ui)
- `socialShareService.test.ts`:
  - OAuth token stored via `safeStorage`, confirmed not written as plain text to disk
  - Expired token triggers silent refresh before post; failed refresh emits `SHARE_OAUTH_NEEDED`
  - Screenshot captured via `capturePage()` even when scoreboard window is off-screen
- `mobileViewerServer.test.ts`:
  - "Scoreboard Offline" HTML served when server is stopped (no browser error page)
  - "Server disabled" 503 response served when admin disables the mobile viewer
  - `getLocalUrl()` returns a valid `http://` URL containing the machine's IPv4 address

**Requires:** Tasks 57, 63, 64, 66, 70, 73, 75, 77

### 88. Integration tests — servers and WebSocket push

Write integration tests for live server instances requiring real network I/O.

- Use `supertest` for `ApiServer` HTTP integration; use the `ws` npm client for WebSocket integration
- **OverlayServer WebSocket push**: start `OverlayServer` on a random available port; connect a `ws` client; call `broadcast(state)`; assert the client receives the message within 500 ms
- **MobileViewerServer WebSocket push**: same pattern — start server, connect client, broadcast state, assert update arrives within 500 ms
- **CloudSyncService test-connection**: mock an HTTPS server using `nock` or `msw`; configure `CloudSyncService` to point at the mock; assert `testConnection()` returns `{ ok: true }` for a 200 response and `{ ok: false, error }` for a 401 or timeout
- **ApiServer pagination**: seed game log files; `GET /api/v1/gamelogs?page=1` returns 20 records with correct `totalPages`; `GET /api/v1/gamelogs?page=999` returns empty `data` array and correct `pagination` metadata
- **AuditStore + IpcRouter integration**: dispatch a `scoreboard:command` through the full router stack; assert an `AuditEntry` is written to the in-memory SQLite DB with the correct `actionType` and `entityId`

**Requires:** Tasks 61, 68, 70, 73, 77

### 89. E2E tests — extended features (Playwright)

Add Playwright E2E test scenarios covering the extended features.

- Add to `e2e/scoreboard.spec.ts` (or create `e2e/extended.spec.ts`):
- **Login & RBAC flow**: launch app (fresh userData); Admin setup screen appears; create Admin account; log in; verify Control Panel is visible; log out; verify login screen returns
- **Scorekeeper restriction**: create a Scorekeeper account as Admin; log in as Scorekeeper; verify Liga config menu is absent; verify score buttons are present
- **Backup round-trip**: trigger "Backup Now" via Admin settings; verify a `.zip` file is created at the chosen path and contains `manifest.json`; restore the backup; verify app relaunches
- **REST API live state**: start the app; generate an API key; use `fetch` in the Playwright test to call `GET /api/v1/game/state`; assert HTTP 200 with valid JSON; change score in Control Panel; re-call the endpoint; assert the score in the response has updated
- **Mobile viewer accessibility**: start mobile viewer server; use Playwright to open the local URL in a Chromium page; assert the score and period are visible; change score in Control Panel; assert the mobile viewer page updates within 500 ms
- **Audit log written on score change**: change score; open Audit Log view; assert an entry with `actionType: 'ADD_SCORE'` is present in the list
- **Box score after game**: play a game (add stats, advance periods); end game; open box score; assert per-period columns and totals row are present

**Requires:** Tasks 46, 47, 58, 63, 64, 65, 73, 77, 62, 38

### 90. Final packaging update for extended features

Update the production build configuration to include all new resources and dependencies.

- Add `resources/overlay/` and `resources/viewer/` to `electron-builder` `extraResources` so overlay and viewer HTML files are bundled in the production app
- Ensure `better-sqlite3` native bindings are rebuilt for the target Electron version using `electron-rebuild` in the `postinstall` script; verify the sqlite3 module loads correctly in the packaged app
- Add `ffmpeg` binary path configuration for `fluent-ffmpeg` to locate `ffmpeg.exe` bundled with the app or installed on the system; document the ffmpeg requirement in `README.md`
- Exclude test files, spec documents, and `__tests__` directories from the production bundle
- Verify `npm run build:win` completes without errors with all new packages
- Run the full test suite (`npm test`) and confirm all 90 tasks' tests pass before tagging a release build
- Update `README.md` with: new feature summary, required ports (3000 API, 8080 overlay, 8081 mobile viewer), OAuth URL scheme registration note, ffmpeg installation instructions

**Requires:** Tasks 39, 70, 71, 73, 77, 87, 88, 89

## Notes

- Tasks 1–39 are fully implemented covering the original core features.
- Tasks marked with `[~]` are stub/skeleton implementations that need full completion.
- Tasks marked with `[-]` are not yet started.
- Extended features (Tasks 40–90) depend on the core being stable and passing all tests.
