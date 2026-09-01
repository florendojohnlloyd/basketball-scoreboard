# Implementation Plan: Tournament Bracketing

## Overview

This plan implements the tournament bracketing feature for LigaControl, adding bracket creation, seeding, match progression, visual display, real-time updates, and export capabilities. The implementation follows an incremental approach: data models first, then the core engine, IPC integration, UI components, and finally export/real-time features.

## Tasks

- [x] 1. Define data models and shared types
  - [x] 1.1 Add tournament-related types to `src/shared/types.ts`
    - Add `BracketFormat`, `TournamentStatus`, `MatchNodeStatus` type unions
    - Add `Tournament`, `TournamentSummary`, `TournamentSeed`, `MatchNode`, `Round`, `RoundRobinStanding`, `BracketOptions` interfaces
    - Add `BracketPayload`, `BracketUpdatePayload` WebSocket message types
    - Add `'TOURNAMENT'` to the `ActionCategory` union type
    - _Requirements: 1.5, 3.4, 9.2, 10.1_

  - [x] 1.2 Add tournament IPC query types to `src/shared/types.ts`
    - Add all `TOURNAMENT_*` query type entries to the existing query message union or a new tournament-specific type
    - Include: `TOURNAMENT_CREATE`, `TOURNAMENT_DELETE`, `TOURNAMENT_RESET`, `TOURNAMENT_LIST`, `TOURNAMENT_LOAD`, `TOURNAMENT_AUTO_SEED`, `TOURNAMENT_MANUAL_SEED`, `TOURNAMENT_GENERATE_BRACKET`, `TOURNAMENT_RECORD_RESULT`, `TOURNAMENT_REVERT_RESULT`, `TOURNAMENT_EXPORT_PDF`, `TOURNAMENT_PRINT`
    - _Requirements: 1.1, 2.1, 2.2, 3.1, 4.1, 8.1_

- [x] 2. Implement bracket generation algorithms (pure functions)
  - [x] 2.1 Create `src/main/bracketAlgorithms.ts` with single-elimination bracket generation
    - Implement `generateSingleElimBracket(seeds: TournamentSeed[], options: BracketOptions): { rounds: Round[]; matchNodes: MatchNode[] }`
    - Determine number of rounds via `ceil(log2(teamCount))`
    - Calculate BYEs needed: `nextPowerOfTwo(teamCount) - teamCount`
    - Place seeds using fold pattern (seed 1 vs seed N in different halves)
    - Assign BYEs to highest seeds (lowest seed numbers)
    - Create MatchNode for each contest; mark BYE matches as completed
    - Wire `homeSourceMatchId` / `awaySourceMatchId` for subsequent rounds
    - Support consolation match option (3rd place match between semifinal losers)
    - _Requirements: 2.6, 3.1, 3.5_

  - [x] 2.2 Add double-elimination bracket generation to `src/main/bracketAlgorithms.ts`
    - Implement `generateDoubleElimBracket(seeds: TournamentSeed[]): { winnersBracket: Round[]; losersBracket: Round[]; grandFinal: MatchNode; matchNodes: MatchNode[] }`
    - Generate Winners_Bracket using same seeded placement as single-elimination
    - Generate Losers_Bracket rounds with drop-down logic from Winners_Bracket
    - Create Grand Final MatchNode (Winners champion vs Losers champion)
    - Wire source matches with `homeSourceIsLoser` / `awaySourceIsLoser` flags
    - _Requirements: 3.2_

  - [x] 2.3 Add round-robin schedule generation to `src/main/bracketAlgorithms.ts`
    - Implement `generateRoundRobinSchedule(seeds: TournamentSeed[]): { rounds: Round[]; matchNodes: MatchNode[] }`
    - Use the "circle method": fix team 1, rotate remaining teams
    - For N teams: N-1 rounds (if N even) or N rounds (if N odd, add BYE)
    - Each round has floor(N/2) matches
    - Ensure every team plays every other team exactly once and no team plays twice per round
    - _Requirements: 3.3_

  - [x]* 2.4 Write property test: Bracket structure preserves team count (Property 1)
    - **Property 1: Bracket structure preserves team count**
    - For any valid set of N teams (2 ≤ N ≤ 64), the generated bracket contains exactly N teams distributed across first-round MatchNodes
    - **Validates: Requirements 2.6, 3.1, 3.2**

  - [x]* 2.5 Write property test: Seeded placement ensures highest vs lowest (Property 2)
    - **Property 2: Seeded placement ensures highest vs lowest**
    - For any single-elim or double-elim bracket, seed 1 and seed 2 are in different halves and only meet in the final if both win all matches
    - **Validates: Requirements 3.1, 3.2**

  - [x]* 2.6 Write property test: BYE assignment favors higher seeds (Property 3)
    - **Property 3: BYE assignment favors higher seeds**
    - For any non-power-of-two team count, BYEs are assigned to lowest seed numbers only
    - **Validates: Requirements 2.6**

  - [x]* 2.7 Write property test: Round-robin schedule completeness (Property 5)
    - **Property 5: Round-robin schedule completeness**
    - For N teams, exactly N*(N-1)/2 unique matchups, every team plays every other exactly once, no team plays twice per round
    - **Validates: Requirements 3.3**

  - [x]* 2.8 Write property test: Unique MatchNode identifiers (Property 9)
    - **Property 9: Unique MatchNode identifiers**
    - For any generated bracket regardless of format or team count, all MatchNode IDs are unique
    - **Validates: Requirements 3.4**

- [x] 3. Implement bracketEngine core module
  - [x] 3.1 Create `src/main/bracketEngine.ts` with tournament lifecycle methods
    - Implement `createTournament(ligaId, name, format)` with validation (name 1-100 chars, valid format, Liga exists)
    - Implement `deleteTournament(tournamentId)` — removes JSON file
    - Implement `resetTournament(tournamentId)` — reverts to post-seeding state, clears results
    - Implement persistence: read/write JSON files at `{userData}/tournaments/{ligaId}/{tournamentId}.json`
    - Implement `getTournament(tournamentId)`, `listTournaments(ligaId)`, `getActiveTournament(ligaId)`
    - Handle corrupted JSON files gracefully (exclude from listing, log warning)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 3.2 Implement seeding methods in `src/main/bracketEngine.ts`
    - Implement `autoSeed(tournamentId)` — ranks teams by win-loss record from game logs, tiebreaker by point differential, then alphabetical
    - Implement `manualSeed(tournamentId, teamIds)` — accepts ordered list of team IDs
    - Validate: team IDs exist in Liga, no duplicates, 2-64 teams, no fewer than 2
    - Update tournament status to "seeding" after successful seed
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8_

  - [x] 3.3 Implement bracket generation in `src/main/bracketEngine.ts`
    - Implement `generateBracket(tournamentId, options?)` — calls appropriate algorithm from bracketAlgorithms.ts
    - Update tournament status to "in-progress" after successful generation
    - Create ScheduledGame entries in ligaStore for each MatchNode with both teams determined
    - Store bidirectional links between ScheduledGame and MatchNode
    - Handle generation failure without persisting partial state
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.1, 5.2, 5.6_

  - [x] 3.4 Implement match progression and auto-advance in `src/main/bracketEngine.ts`
    - Implement `recordResult(tournamentId, matchNodeId, homeScore, awayScore)` — advances winner
    - Implement `onGameLogSaved(record)` — finds linked MatchNode, auto-advances bracket
    - Implement `onGameLogDeleted(ligaId, logId)` — reverts affected MatchNode and clears downstream
    - Handle double-elim routing: loser to Losers_Bracket, loser in Losers_Bracket = eliminated
    - Handle round-robin: record result in standings without advancement
    - Handle tied scores: emit event, do not advance
    - Detect tournament completion (all matches resolved) → set status "completed", record champion
    - Create new ScheduledGame when next-round MatchNode has both teams determined
    - Implement `revertResult(tournamentId, matchNodeId)` — clear downstream Match_Nodes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.3, 5.4, 5.5_

  - [x]* 3.5 Write property test: Match advancement preserves bracket integrity (Property 6)
    - **Property 6: Match advancement preserves bracket integrity**
    - For any completed match in single-elimination, the winner appears exactly once in the next round, the loser does not appear in any subsequent round
    - **Validates: Requirements 4.1, 4.3**

  - [x]* 3.6 Write property test: Result reversion clears downstream (Property 7)
    - **Property 7: Result reversion clears downstream**
    - For any reverted match node, all downstream MatchNodes that received a team from it have status reset and team assignments cleared
    - **Validates: Requirements 4.5**

  - [x]* 3.7 Write property test: Tournament persistence round-trip (Property 8)
    - **Property 8: Tournament persistence round-trip**
    - For any valid Tournament state, serializing to JSON and deserializing produces an equivalent object
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 3.8 Write property test: Double-elimination loser routing (Property 10)
    - **Property 10: Double-elimination loser routing**
    - Any team losing in Winners_Bracket appears exactly once in Losers_Bracket; only after losing in Losers_Bracket is the team eliminated
    - **Validates: Requirements 4.2, 4.3**

  - [x]* 3.9 Write property test: Auto-seed ordering is deterministic and total (Property 4)
    - **Property 4: Auto-seed ordering is deterministic and total**
    - For any set of teams with game log records, auto-seeding produces the same total ordering regardless of input iteration order
    - **Validates: Requirements 2.1, 2.7**

  - [x]* 3.10 Write property test: Validation rejects invalid inputs (Property 12)
    - **Property 12: Validation rejects invalid inputs**
    - Empty/overlong names rejected; seed lists with <2 teams, duplicates, or invalid IDs rejected without state change
    - **Validates: Requirements 1.6, 1.7, 2.3, 2.4, 2.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrate with RBAC and IPC layer
  - [x] 5.1 Add `TOURNAMENT` action category to roleStore permission matrix in `src/main/roleStore.ts`
    - Add `'TOURNAMENT'` to the `PERMISSIONS` map: Admin and Scorekeeper have access; Coach and Viewer are read-only (handled at IPC level by allowing list/load without TOURNAMENT category check)
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 5.2 Add tournament command classification to `requiredCategory()` in `src/main/ipcRouter.ts`
    - Map `TOURNAMENT_CREATE`, `TOURNAMENT_DELETE`, `TOURNAMENT_RESET`, `TOURNAMENT_AUTO_SEED`, `TOURNAMENT_MANUAL_SEED`, `TOURNAMENT_GENERATE_BRACKET`, `TOURNAMENT_RECORD_RESULT`, `TOURNAMENT_REVERT_RESULT`, `TOURNAMENT_EXPORT_PDF` to `'TOURNAMENT'` action category
    - Map read-only queries (`TOURNAMENT_LIST`, `TOURNAMENT_LOAD`) to `'VIEWER'` so all roles can access them
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 5.3 Wire tournament query handlers in `src/main/ipcRouter.ts`
    - Add all `TOURNAMENT_*` cases to the query handler switch
    - Call bracketEngine methods for each query type
    - Return standardized `{ success, data?, error? }` response format
    - Pass bracketEngine as dependency to `createIpcRouter`
    - Hook into `GAME_LOG_SAVE` to call `bracketEngine.onGameLogSaved(record)`
    - Hook into `GAME_LOG_DELETE` to call `bracketEngine.onGameLogDeleted(ligaId, logId)`
    - _Requirements: 1.1, 2.1, 2.2, 3.1, 4.1, 4.5, 8.1_

  - [x]* 5.4 Write unit tests for RBAC enforcement on tournament commands
    - Test that Admin can create/delete/reset tournaments
    - Test that Scorekeeper can seed and record results
    - Test that Coach/Viewer can only list and load
    - Test that unauthenticated requests are rejected
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x]* 5.5 Write property test: ScheduledGame bidirectional linking (Property 11)
    - **Property 11: ScheduledGame bidirectional linking**
    - For any MatchNode with both teams determined, the created ScheduledGame references the MatchNode ID and vice versa
    - **Validates: Requirements 5.2**

- [x] 6. Implement WebSocket real-time bracket updates
  - [x] 6.1 Extend `src/main/overlayServer.ts` with bracket broadcast support
    - Add `broadcastBracket(payload: BracketPayload | BracketUpdatePayload): void` method to the OverlayServer interface and implementation
    - Serialize payload with distinct `type: 'bracket'` or `type: 'bracket-update'` message types
    - Handle WebSocket send failures per client without interrupting broadcast to others
    - _Requirements: 9.1, 9.2, 9.5_

  - [x] 6.2 Add initial bracket state delivery on client connection in `src/main/overlayServer.ts`
    - When a new WebSocket client connects, if there is an in-progress tournament, send the full bracket state as initial payload
    - If no in-progress tournament exists, skip bracket payload
    - Accept a callback/getter to retrieve current active tournament state
    - _Requirements: 9.3, 9.4_

  - [x] 6.3 Wire bracketEngine to overlayServer broadcast in `src/main/bracketEngine.ts`
    - After any bracket state change (recordResult, onGameLogSaved, revertResult), call `overlayServer.broadcastBracket()` with a `BracketUpdatePayload` containing only updated nodes
    - Implement `broadcastBracketState(tournamentId)` for full broadcast
    - Implement `getFullBracketPayload(tournamentId)` for initial client connection
    - _Requirements: 9.1, 9.2, 9.3_

  - [x]* 6.4 Write unit tests for WebSocket bracket broadcast
    - Test that bracket updates are broadcast to connected clients
    - Test that full state is sent on new client connection
    - Test that failed sends skip the client without crashing
    - _Requirements: 9.1, 9.3, 9.5_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement BracketViewer renderer component
  - [x] 8.1 Create `src/renderer/controlPanel/components/BracketViewer.tsx` container component
    - Accept `tournamentId` and `ligaId` props
    - Fetch tournament state via IPC query on mount
    - Subscribe to bracket update events to refresh state
    - Render loading, error, and empty states appropriately
    - Delegate to format-specific sub-components based on `format` field
    - _Requirements: 6.1, 6.6, 6.8_

  - [x] 8.2 Create `src/renderer/controlPanel/components/SingleElimTree.tsx` sub-component
    - Render single-elimination bracket as left-to-right tree with SVG connecting lines between rounds
    - Display MatchCard for each match node
    - Handle BYE rendering (show "BYE" text for absent opponent)
    - Visually distinguish pending/in-progress/completed matches with distinct background colors
    - _Requirements: 6.1, 6.4, 6.5, 6.7_

  - [x] 8.3 Create `src/renderer/controlPanel/components/DoubleElimView.tsx` sub-component
    - Render Winners_Bracket, Losers_Bracket, and Grand Final in visually separated sections with labeled headers
    - Use same MatchCard and connecting-line pattern as SingleElimTree
    - _Requirements: 6.2, 6.4, 6.5_

  - [x] 8.4 Create `src/renderer/controlPanel/components/RoundRobinGrid.tsx` sub-component
    - Render as a matrix grid with team names on row and column headers
    - Display score in each cell for completed matches, "—" for pending matches
    - Include standings table below/beside the grid
    - _Requirements: 6.3, 6.4_

  - [x] 8.5 Create `src/renderer/controlPanel/components/MatchCard.tsx` sub-component
    - Display team names, seed numbers, and scores for each Match_Node
    - Show "TBD" for pending team slots
    - Show "BYE" styling for BYE matchups
    - Apply background color based on match status (pending, in-progress, completed)
    - _Requirements: 6.4, 6.5, 6.7_

  - [x] 8.6 Create `src/renderer/controlPanel/components/BracketViewer.css` stylesheet
    - Style the bracket tree layout, connecting lines, match cards, and color coding
    - Support responsive layout for different bracket sizes
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [x] 9. Implement TournamentManager renderer component
  - [x] 9.1 Create `src/renderer/controlPanel/components/TournamentManager.tsx`
    - Implement tournament list view (create, delete, open tournaments)
    - Implement seeding panel with auto/manual seed options and drag-reorder for manual seeding
    - Wire to IPC queries for all tournament actions
    - Show active bracket view (delegate to BracketViewer)
    - Include export panel with PDF export and print buttons
    - _Requirements: 1.1, 2.1, 2.2, 8.1, 8.2_

  - [x] 9.2 Create `src/renderer/controlPanel/components/TournamentManager.css` stylesheet
    - Style tournament list, seeding panel, and export controls
    - _Requirements: 6.1_

  - [x] 9.3 Integrate TournamentManager into existing App.tsx navigation
    - Add a "Tournaments" tab/section to the control panel navigation in `src/renderer/controlPanel/App.tsx`
    - Pass the active `ligaId` to TournamentManager
    - _Requirements: 1.1_

- [x] 10. Implement PDF export and print support
  - [x] 10.1 Add bracket PDF generation in `src/main/exportService.ts`
    - Add new export data type `BracketExportData` with tournament metadata and matchNodes
    - Implement bracket layout engine: recursive function to compute x/y positions for MatchNodes
    - Render match cards (rectangles, text) and connecting lines using jsPDF drawing primitives
    - Handle ≤16 teams on single landscape page; >16 teams paginated across multiple pages
    - Include tournament name, creation date, team names, seeds, scores (or "TBD" for pending)
    - Round-robin format: render as table/matrix
    - Clean up partial file on failure
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6_

  - [x] 10.2 Wire PDF export through IPC in `src/main/ipcRouter.ts`
    - Handle `TOURNAMENT_EXPORT_PDF` query: show save dialog, call bracketEngine.exportBracketPdf(), return result
    - _Requirements: 8.1, 8.5_

  - [x] 10.3 Implement print support in BracketViewer renderer component
    - On `TOURNAMENT_PRINT` action, open system print dialog via `window.print()` with bracket rendered in landscape orientation
    - Apply print-specific CSS media query for proper layout
    - Scale to fit single page for ≤16 teams, paginate for larger brackets
    - _Requirements: 8.2_

  - [x]* 10.4 Write unit tests for PDF export
    - Test that PDF generation produces a non-empty buffer
    - Test that tournament metadata appears in the PDF
    - Test that partial file is cleaned up on failure
    - Test ≤16 teams fits single page vs >16 teams paginates
    - _Requirements: 8.1, 8.5, 8.6_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Integration and wiring
  - [x] 12.1 Wire bracketEngine into main process startup in `src/main/index.ts`
    - Create bracketEngine instance with dependencies (ligaStore, overlayServer)
    - Pass bracketEngine to createIpcRouter
    - Initialize bracketEngine on app ready (scan and load existing tournament files)
    - _Requirements: 7.2_

  - [x] 12.2 Update overlay HTML/JS to handle bracket WebSocket messages in `resources/overlay/index.html`
    - Parse incoming `type: 'bracket'` and `type: 'bracket-update'` messages
    - Render bracket visualization in the overlay page (or display as a simplified bracket summary)
    - Update on incremental bracket-update messages
    - _Requirements: 9.1, 9.2, 9.3_

  - [x]* 12.3 Write integration tests for tournament lifecycle
    - Test full flow: create tournament → seed → generate → record results → completion
    - Test game log save triggers auto-advance
    - Test game log delete triggers revert
    - Test persistence survives simulated restart
    - _Requirements: 4.1, 4.5, 7.1, 7.2_

  - [x]* 12.4 Write E2E tests with Playwright
    - Test BracketViewer renders correct structure for each format
    - Test TournamentManager flow: create, seed, view bracket
    - Test real-time updates appear in overlay
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 9.1_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check` (already in devDependencies)
- Unit tests validate specific examples and edge cases using Vitest
- The implementation language is TypeScript throughout, matching the existing codebase
- The bracket generation algorithms are extracted as pure functions (bracketAlgorithms.ts) for isolated testability
- The bracketEngine module follows the same factory/interface pattern as existing modules (ligaStore, roleStore, etc.)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "2.6", "2.7", "2.8", "3.1"] },
    { "id": 3, "tasks": ["3.2", "5.1"] },
    { "id": 4, "tasks": ["3.3", "3.9", "3.10", "5.2"] },
    { "id": 5, "tasks": ["3.4", "5.3"] },
    { "id": 6, "tasks": ["3.5", "3.6", "3.7", "3.8", "5.4", "5.5"] },
    { "id": 7, "tasks": ["6.1", "6.2"] },
    { "id": 8, "tasks": ["6.3", "6.4"] },
    { "id": 9, "tasks": ["8.1", "8.5", "8.6"] },
    { "id": 10, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 11, "tasks": ["9.1", "9.2"] },
    { "id": 12, "tasks": ["9.3", "10.1"] },
    { "id": 13, "tasks": ["10.2", "10.3"] },
    { "id": 14, "tasks": ["10.4", "12.1"] },
    { "id": 15, "tasks": ["12.2", "12.3"] },
    { "id": 16, "tasks": ["12.4"] }
  ]
}
```
