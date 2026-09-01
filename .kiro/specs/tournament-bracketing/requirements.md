# Requirements Document

## Introduction

Tournament Bracketing feature for the LigaControl Basketball Scoreboard application. This feature enables organizers to create, manage, and display tournament brackets within a Liga. It supports common tournament formats (single-elimination, double-elimination, round-robin), integrates with the existing team/player/game-log system, and provides visual bracket displays with real-time progression as games complete.

## Glossary

- **Bracket_Engine**: The main-process module responsible for creating, persisting, and advancing tournament bracket state.
- **Bracket_Viewer**: The renderer-process component that displays the visual bracket tree/grid to the user.
- **Tournament**: A competitive event within a Liga consisting of multiple rounds of games leading to a champion.
- **Bracket_Format**: The structural pattern of match progression — single-elimination, double-elimination, or round-robin.
- **Seed**: A ranking number assigned to a team that determines its initial placement in the bracket.
- **Round**: A set of matches within the bracket that must complete before the next set begins.
- **Match_Node**: A single scheduled contest between two teams (or a BYE) within the bracket structure.
- **BYE**: A placeholder in the bracket where a team advances without playing, used when the team count is not a power of two.
- **Winners_Bracket**: In double-elimination, the path for teams that have not yet lost.
- **Losers_Bracket**: In double-elimination, the path for teams that have lost exactly one game.
- **Consolation_Match**: An optional match to determine 3rd place between the losers of both semifinals.
- **Liga**: The existing league management entity containing teams, players, schedules, and game logs.

## Requirements

### Requirement 1: Tournament Creation

**User Story:** As a Liga administrator, I want to create a tournament within a Liga, so that I can organize playoff or cup competitions for my teams.

#### Acceptance Criteria

1. WHEN the administrator provides a tournament name (1 to 100 characters, trimmed of leading/trailing whitespace), a valid Bracket_Format, and a Liga ID, THE Bracket_Engine SHALL create a new Tournament and persist it within the Liga data.
2. THE Bracket_Engine SHALL support the following Bracket_Format values: "single-elimination", "double-elimination", and "round-robin".
3. WHEN a tournament is created, THE Bracket_Engine SHALL generate a unique identifier for the Tournament and set the tournament status to "pending".
4. IF a Liga ID does not exist or is corrupted, THEN THE Bracket_Engine SHALL reject the creation and return an error message indicating the Liga is not found.
5. THE Bracket_Engine SHALL store tournament metadata including name, format, creation date, status (one of "pending", "seeding", "in-progress", "completed"), and associated Liga ID.
6. IF the tournament name is empty, blank after trimming, or exceeds 100 characters, THEN THE Bracket_Engine SHALL reject the creation and return an error message indicating the name is invalid.
7. IF the provided Bracket_Format is not one of the supported values, THEN THE Bracket_Engine SHALL reject the creation and return an error message indicating the format is unsupported.

### Requirement 2: Team Seeding

**User Story:** As a Liga administrator, I want to seed teams into a tournament bracket, so that matchups reflect team strength or standings.

#### Acceptance Criteria

1. WHEN the administrator selects "auto-seed" mode, THE Bracket_Engine SHALL rank teams by their win-loss record from the Liga game logs in descending order, where teams with no game logs are assigned a 0-0 record and placed at the bottom of the seed order.
2. WHEN the administrator selects "manual-seed" mode, THE Bracket_Engine SHALL accept an ordered list of team IDs as the seeding, where the list position (1-based) determines the seed number.
3. IF any provided team ID does not exist in the specified Liga, THEN THE Bracket_Engine SHALL reject the seeding request and return an error indicating which team IDs are invalid.
4. IF fewer than 2 teams are seeded into a tournament, THEN THE Bracket_Engine SHALL return an error indicating a minimum of 2 teams is required.
5. IF the manual-seed list contains duplicate team IDs, THEN THE Bracket_Engine SHALL reject the seeding request and return an error indicating duplicates are not allowed.
6. WHEN the team count is not a power of two in single-elimination or double-elimination format, THE Bracket_Engine SHALL assign BYE entries so that higher-seeded teams (lowest seed numbers) receive the BYEs.
7. WHEN auto-seeding and two or more teams have identical win-loss records, THE Bracket_Engine SHALL use total point differential as the primary tiebreaker; IF point differential is also identical, THEN THE Bracket_Engine SHALL seed those teams in alphabetical order by team name.
8. THE Bracket_Engine SHALL accept a maximum of 64 teams per tournament seeding request.

### Requirement 3: Bracket Structure Generation

**User Story:** As a Liga administrator, I want the bracket structure to be generated automatically after seeding, so that all rounds and matchups are laid out correctly.

#### Acceptance Criteria

1. WHEN seeding is finalized for a single-elimination tournament, THE Bracket_Engine SHALL generate a complete bracket tree where each Round halves the remaining teams until one champion remains, placing seeds so that the highest seed faces the lowest seed in each half of the draw (e.g., seed 1 vs seed N, seed 2 vs seed N-1).
2. WHEN seeding is finalized for a double-elimination tournament, THE Bracket_Engine SHALL generate a Winners_Bracket following the same seeded placement as single-elimination, a Losers_Bracket where each Winners_Bracket loser feeds into the corresponding Losers_Bracket round, and a grand final Match_Node between the Winners_Bracket champion and the Losers_Bracket champion.
3. WHEN seeding is finalized for a round-robin tournament, THE Bracket_Engine SHALL generate a schedule where every team plays every other team exactly once, organized into rounds of concurrent matches such that no team plays more than once per round.
4. THE Bracket_Engine SHALL assign a unique Match_Node identifier to each contest within a Tournament, ensuring no two Match_Nodes in the same Tournament share an identifier.
5. WHEN a Consolation_Match is enabled for single-elimination, THE Bracket_Engine SHALL add a 3rd-place Match_Node between the two semifinal losers.
6. IF seeding is finalized and the bracket structure cannot be generated due to inconsistent data, THEN THE Bracket_Engine SHALL return an error message indicating the generation failure reason without persisting a partial bracket.

### Requirement 4: Match Progression and Auto-Advance

**User Story:** As a scorekeeper, I want the bracket to update automatically when a game finishes, so that winners advance to the next round without manual intervention.

#### Acceptance Criteria

1. WHEN a game log is saved and its associated Match_Node is identified, THE Bracket_Engine SHALL advance the winning team (the team with the higher final score) to the next Round in the bracket.
2. WHEN a team loses in the Winners_Bracket of a double-elimination tournament, THE Bracket_Engine SHALL move that team to the corresponding Losers_Bracket Match_Node.
3. WHEN a team loses in the Losers_Bracket, THE Bracket_Engine SHALL mark that team as eliminated.
4. WHEN all Match_Nodes in the bracket are resolved (each has a recorded result or a BYE assignment), THE Bracket_Engine SHALL mark the Tournament status as "completed" and record the champion team ID.
5. IF a game log result is deleted or modified after advancement, THEN THE Bracket_Engine SHALL revert the affected Match_Node to "pending" status and clear all downstream advancements that depended on that result.
6. IF a game log is saved with a tied score for the associated Match_Node, THEN THE Bracket_Engine SHALL not advance either team and SHALL emit an event indicating that overtime or a tiebreaker is required.
7. WHEN a game log is saved for a round-robin Match_Node, THE Bracket_Engine SHALL record the result in the round-robin standings table without advancement logic.

### Requirement 5: Game Scheduling Integration

**User Story:** As a Liga administrator, I want tournament bracket games to appear in the existing schedule, so that venues and staff can be assigned as usual.

#### Acceptance Criteria

1. WHEN a bracket is generated, THE Bracket_Engine SHALL create a ScheduledGame entry with status "Scheduled" in the Liga for each Match_Node that has both teams determined, setting homeTeamId and awayTeamId from the Match_Node participants.
2. THE Bracket_Engine SHALL store a bidirectional link between each ScheduledGame and its corresponding Match_Node ID, such that a ScheduledGame references its Match_Node ID and the Match_Node references its ScheduledGame ID.
3. WHEN a team advances and a new Match_Node has both teams known, THE Bracket_Engine SHALL create the ScheduledGame entry for that match only if no ScheduledGame is already linked to that Match_Node.
4. WHEN a ScheduledGame linked to a Match_Node is removed from the schedule, THE Bracket_Engine SHALL retain the Match_Node in "pending" status, clear the ScheduledGame reference from the Match_Node, and preserve all other bracket relationships.
5. IF a Match_Node reverts to "pending" status due to a game log deletion or modification, THEN THE Bracket_Engine SHALL reset the linked ScheduledGame status to "Scheduled" and clear its gameLogId reference.
6. IF the specified Liga ID does not exist when creating ScheduledGame entries for a bracket, THEN THE Bracket_Engine SHALL return an error indicating the Liga is not found and create no ScheduledGame entries.

### Requirement 6: Visual Bracket Display

**User Story:** As a user, I want to see the bracket displayed as a visual tree, so that I can quickly understand the tournament progression.

#### Acceptance Criteria

1. THE Bracket_Viewer SHALL render single-elimination brackets as a left-to-right tree with connecting lines between rounds.
2. THE Bracket_Viewer SHALL render double-elimination brackets showing Winners_Bracket, Losers_Bracket, and grand final in visually separated sections each with a labeled header.
3. THE Bracket_Viewer SHALL render round-robin brackets as a matrix grid where each cell displays the score of the row-team vs. the column-team for completed games, or "—" for games not yet played.
4. THE Bracket_Viewer SHALL display team names and seeds in every Match_Node, and additionally display scores for completed matches.
5. THE Bracket_Viewer SHALL visually distinguish between pending, in-progress, and completed Match_Nodes using three distinct background colors.
6. WHEN the bracket state changes, THE Bracket_Viewer SHALL update the display within 2 seconds without requiring a page reload.
7. THE Bracket_Viewer SHALL render BYE entries in the bracket by displaying the text "BYE" in place of the absent opponent and showing the advancing team as pre-determined winner.
8. IF bracket data fails to load or is unavailable, THEN THE Bracket_Viewer SHALL display an error message indicating the bracket cannot be loaded and provide a retry action.

### Requirement 7: Bracket Persistence and History

**User Story:** As a Liga administrator, I want tournament brackets to be saved and retrievable, so that I can review past tournaments.

#### Acceptance Criteria

1. WHEN Tournament data is created or modified, THE Bracket_Engine SHALL persist the complete Tournament state (metadata, bracket structure, match results, and seeding) as a JSON file in the Liga data directory within 1 second of the change.
2. WHEN the application restarts, THE Bracket_Engine SHALL restore the tournament state from persisted files such that all metadata, bracket structure, match results, and seeding match the last persisted state.
3. THE Bracket_Engine SHALL support listing all tournaments for a given Liga, sorted by creation date descending, returning a maximum of 200 tournament entries per request.
4. WHEN a user requests loading a specific tournament by its unique identifier, THE Bracket_Engine SHALL return the full Tournament state within 2 seconds.
5. IF a tournament JSON file fails to parse as valid JSON or is missing required fields (tournament ID, name, format, status, creation date, Liga ID), THEN THE Bracket_Engine SHALL exclude it from the tournament list and log a warning containing the file name without crashing.
6. IF a tournament unique identifier does not match any persisted tournament file, THEN THE Bracket_Engine SHALL return an error message indicating the tournament was not found.

### Requirement 8: Bracket Export

**User Story:** As a Liga administrator, I want to export or print the bracket, so that I can share it with participants and display it at the venue.

#### Acceptance Criteria

1. WHEN the administrator requests a PDF export, THE Bracket_Engine SHALL generate a PDF document containing the bracket layout matching the structure rendered by the Bracket_Viewer for the applicable Bracket_Format (single-elimination tree, double-elimination dual-bracket, or round-robin matrix).
2. WHEN the administrator requests a print action, THE Bracket_Viewer SHALL open the system print dialog with the bracket rendered in landscape orientation, scaled to fit a single page for brackets of 16 teams or fewer, or paginated across multiple pages for brackets exceeding 16 teams, for A4 or Letter paper size.
3. THE Bracket_Engine SHALL include tournament name, tournament creation date, team names, seed numbers, and match scores for completed matches in the exported document.
4. WHEN exporting a bracket in progress, THE Bracket_Engine SHALL display the text "TBD" in place of team names and scores for all unresolved Match_Nodes in the output.
5. IF PDF generation fails, THEN THE Bracket_Engine SHALL return an error message indicating the export could not be completed and SHALL NOT produce a partial or corrupted file.
6. WHEN the administrator requests a PDF export, THE Bracket_Engine SHALL complete the PDF generation within 10 seconds for brackets containing up to 64 teams.

### Requirement 9: Real-Time Bracket Updates

**User Story:** As a viewer watching via the overlay or mobile viewer, I want to see bracket updates in real time, so that I know who advanced without refreshing.

#### Acceptance Criteria

1. WHEN a Match_Node result is recorded, THE Bracket_Engine SHALL broadcast the bracket update through the existing WebSocket overlay channel within 2 seconds of the result being persisted.
2. THE Bracket_Engine SHALL include the updated Match_Node data (team IDs, scores, winner, and match status) and next-round assignments in the broadcast payload, using a distinct message type separable from game-state and config messages.
3. WHEN a client connects to the overlay while a tournament has a status of "in-progress", THE Bracket_Engine SHALL send the full current bracket state (all Match_Nodes, rounds, seeds, and results recorded so far) as the initial payload.
4. IF a client connects to the overlay and no tournament has a status of "in-progress", THEN THE Bracket_Engine SHALL not send a bracket payload.
5. IF the WebSocket send to a specific client fails, THEN THE Bracket_Engine SHALL skip that client without interrupting broadcast delivery to other connected clients.

### Requirement 10: Role-Based Access for Tournament Management

**User Story:** As a system administrator, I want tournament management actions restricted by role, so that only authorized users can modify brackets.

#### Acceptance Criteria

1. THE Bracket_Engine SHALL require the "Admin" role for creating, deleting, and resetting tournaments, where resetting means reverting the bracket to its post-seeding state and clearing all match results.
2. THE Bracket_Engine SHALL require the "Admin" or "Scorekeeper" role for finalizing seeding, manually advancing matches, and recording or modifying Match_Node results.
3. THE Bracket_Engine SHALL allow the "Viewer" and "Coach" roles to list tournaments, load bracket state, and view Match_Node data without modification.
4. IF a user without the required role attempts a tournament management action, THEN THE Bracket_Engine SHALL reject the request with an error indicating access is denied, and SHALL NOT modify any tournament or bracket state.
5. IF a request is received without an authenticated session, THEN THE Bracket_Engine SHALL reject the request with an error indicating authentication is required, and SHALL NOT modify any tournament or bracket state.
