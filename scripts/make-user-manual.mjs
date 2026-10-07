import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, Header,
  TableLayoutType,
} from 'docx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'USER_MANUAL.docx')

// Corporate Colors
const BRAND_DARK  = '1A1A2E'
const BRAND_BLUE  = '1A4FD6'
const BRAND_GOLD  = 'E09010'
const WHITE       = 'FFFFFF'
const GRAY_LIGHT  = 'F3F4F6'
const GRAY_TEXT   = '4B5563'
const ACCENT_RED  = 'C0392B'

// ─── Text helpers ────────────────────────────────────────────────────────────
function heading1(text) {
  return new Paragraph({
    spacing: { before: 440, after: 200 },
    border: { bottom: { color: BRAND_BLUE, space: 1, style: BorderStyle.SINGLE, size: 8 } },
    children: [new TextRun({ text, bold: true, size: 34, color: BRAND_DARK, font: 'Arial' })],
  })
}

function heading2(text) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: BRAND_BLUE, font: 'Arial' })],
  })
}

function heading3(text) {
  return new Paragraph({
    spacing: { before: 220, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, color: '334455', font: 'Arial' })],
  })
}

function para(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: 22, color: '1a1a1a', font: 'Arial' })],
  })
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 22, color: '1a1a1a', font: 'Arial' })],
  })
}

function note(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 360 },
    shading: { type: ShadingType.SOLID, color: 'E8F0FE', fill: 'E8F0FE' },
    children: [
      new TextRun({ text: 'Note: ', bold: true, size: 20, color: BRAND_BLUE, font: 'Arial' }),
      new TextRun({ text, italics: true, size: 20, color: GRAY_TEXT, font: 'Arial' }),
    ],
  })
}

function warning(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 360 },
    shading: { type: ShadingType.SOLID, color: 'FEF3E2', fill: 'FEF3E2' },
    children: [
      new TextRun({ text: 'Warning: ', bold: true, size: 20, color: ACCENT_RED, font: 'Arial' }),
      new TextRun({ text, italics: true, size: 20, color: GRAY_TEXT, font: 'Arial' }),
    ],
  })
}

function spacer() {
  return new Paragraph({ text: '', spacing: { before: 80, after: 80 } })
}

function hr() {
  return new Paragraph({
    text: '',
    border: { bottom: { color: 'CCCCCC', space: 1, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { before: 160, after: 160 },
  })
}

function codeBlock(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 360, right: 360 },
    shading: { type: ShadingType.SOLID, color: '1a1a2e', fill: '1a1a2e' },
    children: [new TextRun({ text, size: 18, color: 'f0a020', font: 'Courier New' })],
  })
}

function makeTable(headers, rows) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h =>
      new TableCell({
        shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
        margins: { top: 100, bottom: 100, left: 140, right: 140 },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: h, bold: true, size: 22, color: WHITE, font: 'Arial' })],
        })],
      })
    ),
  })
  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: ri % 2 === 0 ? WHITE : GRAY_LIGHT, fill: ri % 2 === 0 ? WHITE : GRAY_LIGHT },
          margins: { top: 80, bottom: 80, left: 140, right: 140 },
          children: [new Paragraph({
            children: [new TextRun({ text: cell, size: 20, color: '1a1a1a', font: 'Arial' })],
          })],
        })
      ),
    })
  )
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9000, type: WidthType.DXA },
    rows: [headerRow, ...dataRows],
  })
}

// ─── Cover Page ──────────────────────────────────────────────────────────────
function makeCoverPage() {
  return [
    new Paragraph({ text: '', spacing: { before: 1200 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
      children: [new TextRun({ text: 'LigaControl', bold: true, size: 72, color: 'F0A020', font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80 },
      children: [new TextRun({ text: 'Basketball & Volleyball Scoreboard System', size: 36, color: BRAND_BLUE, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 120 },
      children: [new TextRun({ text: 'USER MANUAL', bold: true, size: 48, color: BRAND_DARK, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 400 },
      children: [new TextRun({ text: 'Professional Game Management for Operators, Scorekeepers & League Administrators', size: 24, color: GRAY_TEXT, italics: true, font: 'Arial' })],
    }),
    spacer(), spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [new TextRun({ text: 'Prepared by: John Lloyd Florendo', size: 22, color: GRAY_TEXT, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80 },
      children: [new TextRun({ text: 'Staff Manager & System Administrator', size: 20, color: '888888', italics: true, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [new TextRun({ text: 'Version 1.0  •  2026', size: 20, color: '999999', font: 'Arial' })],
    }),
    new Paragraph({ pageBreakBefore: true }),
  ]
}

// ─── TOC ─────────────────────────────────────────────────────────────────────
function makeTOC() {
  const items = [
    '1.   First Launch & Admin Account Setup',
    '2.   Logging In',
    '3.   Selecting a Sport',
    '4.   Creating or Loading a League',
    '5.   Managing Teams and Rosters',
    '6.   Starting a Game',
    '7.   Basketball Control Panel',
    '8.   Basketball Scoring & Player Statistics',
    '9.   Basketball Game Clock & Shot Clock',
    '10.  Basketball Timeouts & Fouls',
    '11.  Volleyball Control Panel',
    '12.  Volleyball Scoring Controls',
    '13.  Volleyball Timeouts & Set Management',
    '14.  Scoreboard Overlay / TV Display',
    '15.  Mobile Viewer for Spectators',
    '16.  Tournament Brackets',
    '17.  Box Scores & Statistics',
    '18.  Branding & Sponsor Logos',
    '19.  Backup & Restore',
    '20.  System Settings',
    '21.  Frequently Asked Questions',
    '22.  Quick Start Cheat Sheet',
  ]
  return [
    heading1('Table of Contents'),
    spacer(),
    ...items.map(i => new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [new TextRun({ text: i, size: 22, color: BRAND_BLUE, font: 'Arial' })],
    })),
    new Paragraph({ pageBreakBefore: true }),
  ]
}

// ─── Sections ────────────────────────────────────────────────────────────────

function section1() {
  return [
    heading1('1.  First Launch & Admin Account Setup'),
    para('When you open LigaControl for the very first time, no user accounts exist yet. The system will display an Admin Setup screen instead of the normal login form. You must create the initial Administrator account before you can do anything else.'),
    spacer(),
    heading3('Steps to create the Admin account:'),
    bullet('Double-click the LigaControl shortcut on your desktop to open the application.'),
    bullet('The Admin Setup screen will appear automatically on first launch.'),
    bullet('Enter your desired Admin username in the Username field.'),
    bullet('Enter a strong password that meets the following requirements:'),
    bullet('Minimum 8 characters', 1),
    bullet('At least one uppercase letter (e.g., A–Z)', 1),
    bullet('At least one digit (0–9)', 1),
    bullet('At least one special character (e.g., !, @, #, $)', 1),
    bullet('Re-enter the same password in the Confirm Password field.'),
    bullet('Click Create Admin Account.'),
    bullet('You will be logged in automatically after setup is complete.'),
    spacer(),
    note('Default credentials for the pre-configured demo system: Username: Admin   Password: Admin123!  — Change this password after your first login through Settings → User Management.'),
    spacer(),
    warning('If you forget the Admin password and have no other Admin accounts, you will need to contact technical support. There is no self-service password reset.'),
    hr(),
  ]
}

function section2() {
  return [
    heading1('2.  Logging In'),
    para('After the Admin account is created, every subsequent launch displays the standard Login screen.'),
    spacer(),
    makeTable(
      ['Role', 'Permissions'],
      [
        ['Admin', 'Full access — manage user accounts, delete leagues, view Audit Log, access all Settings'],
        ['Scorekeeper', 'Score games, manage game events, view statistics and Audit Log'],
      ]
    ),
    spacer(),
    heading3('Login steps:'),
    bullet('Enter your Username (case-sensitive).'),
    bullet('Enter your Password.'),
    bullet('Click Log In.'),
    bullet('An error message appears below the button if your credentials are incorrect.'),
    spacer(),
    note('After 5 consecutive failed login attempts, the account is locked for 5 minutes. A countdown timer is displayed on screen. Wait for the timer to reach zero, then try again.'),
    hr(),
  ]
}

function section3() {
  return [
    heading1('3.  Selecting a Sport'),
    para('After logging in, the Sport Selector screen appears. This is where you choose which sport module to manage for the current session.'),
    spacer(),
    makeTable(
      ['Sport', 'Status', 'Description'],
      [
        ['Basketball', 'AVAILABLE', 'Full game management: scoring, stats, shot clock, tournament brackets'],
        ['Volleyball', 'AVAILABLE', 'Full set-based scoring, serving indicator, timeouts, set tracking'],
        ['Badminton', 'Coming Soon', 'Not yet available'],
        ['Sepak Takraw', 'Coming Soon', 'Not yet available'],
        ['Table Tennis', 'Coming Soon', 'Not yet available'],
      ]
    ),
    spacer(),
    bullet('Click Basketball or Volleyball to proceed.'),
    bullet('Disabled sports show a "Coming Soon" badge and cannot be clicked.'),
    bullet('Your sport choice determines which control panel and scoreboard layout are loaded.'),
    note('You can return to this screen at any time by clicking the SELECT SPORT button in the tab bar at the top of the Control Panel.'),
    hr(),
  ]
}

function section4() {
  return [
    heading1('4.  Creating or Loading a League'),
    para('After selecting a sport, the League Picker screen appears. All leagues you have created are stored and listed here.'),
    spacer(),
    heading3('Creating a New League'),
    bullet('Type a unique league name in the input box (example: MCBL 2026).'),
    bullet('Click + NEW LIGA.'),
    bullet('You will be taken to the League Management screen to add teams and players.'),
    spacer(),
    heading3('Loading an Existing League'),
    bullet('Existing leagues are listed below the New League input.'),
    bullet('Each row shows the league name, year, and number of registered teams.'),
    bullet('Click a league row to load it and proceed to the Matchup Picker.'),
    spacer(),
    heading3('Trial Mode (Quick Game)'),
    bullet('Click TRIAL MODE (Quick Game) to start a game immediately without a league.'),
    bullet('Team rosters are kept from the previous session; scores are reset.'),
    bullet('Game data is NOT saved to game history in Trial Mode.'),
    bullet('Useful for practice sessions or exhibition games.'),
    spacer(),
    heading3('Deleting a League'),
    bullet('Click the red ✕ button to the right of a league name.'),
    bullet('A confirmation dialog will appear.'),
    bullet('Click OK to permanently delete the league and all its data.'),
    warning('League deletion is permanent and cannot be undone. Always create a backup before deleting data.'),
    hr(),
  ]
}

function section5() {
  return [
    heading1('5.  Managing Teams and Rosters'),
    para('The League Management screen lets you add teams, manage player rosters, view the schedule, and manage coaching staff.'),
    spacer(),
    heading3('Adding a Team'),
    bullet('Type the team name in the New Team Name input field.'),
    bullet('Press Enter or click + Add Team.'),
    bullet('The team appears in the Registered Teams list.'),
    spacer(),
    heading3('Managing a Player Roster'),
    bullet('Click on any team name in the list to open the Team Roster Modal.'),
    bullet('Click + Add Player to add a new roster entry.'),
    bullet('For each player, fill in: Jersey Number, Player Name, and an optional Photo.'),
    bullet('Click the photo slot to upload a player image (PNG recommended).'),
    bullet('Click SAVE to confirm all changes.'),
    spacer(),
    note('A team must have at least 5 players before it can be selected for a game matchup.'),
    spacer(),
    heading3('Staff Management'),
    bullet('Click the Staff button (👥) in the League Management header.'),
    bullet('Add coaching staff, team managers, and other personnel.'),
    bullet('Staff records are saved per league.'),
    spacer(),
    heading3('Schedule Management'),
    bullet('Click the Schedule button (📅) in the League Management header.'),
    bullet('View and manage the schedule of games for the league.'),
    bullet('Scheduled games can be loaded directly from the schedule view.'),
    hr(),
  ]
}

function section6() {
  return [
    heading1('6.  Starting a Game'),
    para('After loading a league, the Matchup Picker screen allows you to select today\'s teams.'),
    spacer(),
    bullet('Under Team A (Home), select the home team from the dropdown.'),
    bullet('Under Team B (Away), select the away team from the dropdown.'),
    bullet('You cannot select the same team for both sides — an error will appear.'),
    bullet('Each team must have at least 5 players. If not, the system will alert you.'),
    bullet('Click START GAME (🏀).'),
    bullet('The Control Panel will load with both teams ready.'),
    spacer(),
    bullet('To manage teams before starting: click ⚙ Manage Teams to return to League Management.'),
    bullet('To go back to the League list: click ← Back.'),
    hr(),
  ]
}

function section7() {
  return [
    heading1('7.  Basketball Control Panel'),
    para('The Basketball Control Panel is the main scoring interface. It is organized into a tab bar at the top and a full-screen scoring layout.'),
    spacer(),
    heading3('Tab Bar (top of screen)'),
    spacer(),
    makeTable(
      ['Tab', 'Contents'],
      [
        ['SCORE',      'Main basketball scoring and clock controls'],
        ['ROSTER',     'Live player roster — toggle active/bench, edit jersey numbers and names'],
        ['BRANDING',   'Team colors, logos, player cutout images, sponsor logos'],
        ['HISTORY',    'All saved game logs for this league'],
        ['SEASON',     'Cumulative player statistics for the entire season'],
        ['LEADERS',    'Leaderboard — top scorers, rebounders, assist leaders'],
        ['AUDIT',      'Complete chronological log of all scoring and configuration actions (Admin/Scorekeeper only)'],
        ['SETTINGS',   'Game configuration, server controls, user management'],
        ['TOURNAMENT', 'Tournament bracket management'],
      ]
    ),
    spacer(),
    heading3('Top-right Tab Bar Buttons'),
    bullet('✏️ Edit / 🔓 Lock — Toggle layout editing mode. In Edit mode, panels can be rearranged.'),
    bullet('↺ Reset — Reset the layout to the default arrangement.'),
    bullet('💾 Save / Save As — Save the current panel layout as a named template.'),
    bullet('📂 Load — Load a previously saved layout template.'),
    bullet('📺 — Open the full-screen TV Scoreboard display on a second monitor.'),
    bullet('← Liga — Return to the Matchup Picker.'),
    bullet('🏀 SELECT SPORT — Return to the Sport Selector screen.'),
    spacer(),
    heading3('Swipe Navigation'),
    bullet('On a touchscreen, swipe left or right across the screen to switch between tabs.'),
    hr(),
  ]
}

function section8() {
  return [
    heading1('8.  Basketball Scoring & Player Statistics'),
    para('The SCORE tab is where all in-game scoring and stat tracking takes place.'),
    spacer(),
    heading3('Adding Team Points (Quick Score)'),
    bullet('At the bottom of the screen are large score buttons for both teams.'),
    bullet('+3, +2, +1 — add points to the Home team.'),
    bullet('+1, +2, +3 — add points to the Away team.'),
    bullet('-1 — subtract one point from the respective team (score correction).'),
    spacer(),
    heading3('Recording Player Points and Statistics'),
    bullet('In the Player List on the left (Home) or right (Away) side, click a player\'s name.'),
    bullet('Stat buttons appear next to the selected player\'s row.'),
    spacer(),
    makeTable(
      ['Button', 'Action'],
      [
        ['+1',    'Add 1-point free throw to player and team score'],
        ['+2',    'Add 2-point field goal to player and team score'],
        ['+3',    'Add 3-point shot to player and team score'],
        ['+REB',  'Record a rebound'],
        ['+AST',  'Record an assist'],
        ['+FOUL', 'Record a personal foul (also increments Team Fouls)'],
        ['+STL',  'Record a steal'],
        ['+BLK',  'Record a block'],
        ['+TO',   'Record a turnover'],
      ]
    ),
    spacer(),
    heading3('Undoing a Score Change'),
    bullet('Click the UNDO button (↶ UNDO or UNDO SCORE) to reverse the most recent score event.'),
    bullet('The button displays a description of what will be undone before you click.'),
    note('All scoring events are recorded in the game event log. These events are used to generate the Box Score and are stored in Game History.'),
    hr(),
  ]
}

function section9() {
  return [
    heading1('9.  Basketball Game Clock & Shot Clock'),
    spacer(),
    heading3('Game Clock'),
    bullet('The large clock display shows the current time in MM:SS format.'),
    bullet('The quarter/period indicator (Q1, Q2, Q3, Q4, or OT) is shown beside the clock.'),
    bullet('START — begin the countdown clock.'),
    bullet('PAUSE (or Stop) — freeze the clock at the current time.'),
    bullet('To advance to the next quarter: click the NEXT Q button or the current quarter button.'),
    spacer(),
    heading3('Shot Clock'),
    bullet('The shot clock is displayed next to the game clock (default: 24 seconds).'),
    bullet('24 SEC — reset the shot clock to 24 seconds.'),
    bullet('14 SEC — reset the shot clock to 14 seconds (used after offensive rebounds).'),
    bullet('SHOT: ON/OFF — toggle the shot clock display on the scoreboard.'),
    bullet('The shot clock automatically pauses whenever the game clock is paused.'),
    spacer(),
    heading3('Possession Indicator'),
    bullet('◄ POSS / POSS ► — toggle which team has ball possession.'),
    bullet('The possession arrow appears on the scoreboard and TV display.'),
    hr(),
  ]
}

function section10() {
  return [
    heading1('10.  Basketball Timeouts & Fouls'),
    spacer(),
    heading3('Timeouts'),
    bullet('Each team\'s remaining timeouts are shown as colored dots (●●●) or a counter.'),
    bullet('Click the USE TIMEOUT button (or the timeout area) for either team.'),
    bullet('The clock automatically stops when a timeout is called.'),
    bullet('The remaining timeout count decrements by one.'),
    note('Configure the number of timeouts per half/period and timeout duration in the Settings tab.'),
    spacer(),
    heading3('Team Fouls'),
    bullet('The Team Fouls counter is displayed prominently in the center of the screen.'),
    bullet('+FOUL H — add a foul to the Home team.'),
    bullet('-FOUL H — subtract a foul from the Home team (correction).'),
    bullet('+FOUL A / -FOUL A — same controls for the Away team.'),
    bullet('A visual indicator appears when a team reaches the bonus or double-bonus foul threshold.'),
    bullet('Team foul counters reset at the start of each period according to the configured rules.'),
    spacer(),
    heading3('Player Fouls'),
    bullet('Personal fouls are recorded through the player stat buttons (+FOUL).'),
    bullet('A player who accumulates the maximum number of fouls (default: 5) is automatically marked as Fouled Out.'),
    bullet('Fouled-out players are visually distinguished in the roster list.'),
    hr(),
  ]
}

function section11() {
  return [
    heading1('11.  Volleyball Control Panel'),
    para('When Volleyball is selected as the sport, the SCORE tab displays the Volleyball Control Panel. The layout is optimized for fast, touch-friendly set-based scoring.'),
    spacer(),
    heading3('Display Overview'),
    bullet('Top area: Sponsor logo header (Fitness Exclusive).'),
    bullet('Score Banner: Home team name and current set score on the left; Away team name and score on the right; current set number and game clock in the center.'),
    bullet('Scoring Controls: Large + POINT and − (minus) buttons for each team.'),
    bullet('Serving Indicator: A highlighted button shows which team is currently serving.'),
    bullet('Timeout Controls: Timeout buttons for each team with remaining count displayed.'),
    bullet('Action Buttons: NEXT SET, SWITCH, UNDO, RESET at the bottom.'),
    spacer(),
    heading3('Set Tracking'),
    bullet('The current set number (SET 1, SET 2, etc.) is shown in the center banner.'),
    bullet('Each team\'s total sets won is displayed below their set score.'),
    spacer(),
    heading3('Game Clock'),
    bullet('The game clock is integrated into the center banner.'),
    bullet('Start, Stop, and Reset buttons control the clock.'),
    bullet('The clock runs independently of scoring — start and stop it as needed per match rules.'),
    hr(),
  ]
}

function section12() {
  return [
    heading1('12.  Volleyball Scoring Controls'),
    spacer(),
    heading3('Adding a Point'),
    bullet('Click the large + POINT HOME button to add one point to the Home team.'),
    bullet('Click the large + POINT AWAY button to add one point to the Away team.'),
    bullet('Each point addition also automatically transfers the serve to the scoring team if they were not already serving (rally scoring).'),
    spacer(),
    heading3('Subtracting a Point (Correction)'),
    bullet('Click the − (minus) button to the right of the score button to remove one point.'),
    bullet('The minus button is disabled when the team score is already 0.'),
    spacer(),
    heading3('Serving Team Indicator'),
    bullet('Click HOME SERVE to set the Home team as the server. The button highlights in gold.'),
    bullet('Click AWAY SERVE to set the Away team as the server.'),
    bullet('Click a highlighted serve button again ("SERVE ON — TAP TO TOGGLE") to clear the serving indicator if needed.'),
    spacer(),
    heading3('Undo'),
    bullet('Click ↶ UNDO to reverse the last scoring action.'),
    hr(),
  ]
}

function section13() {
  return [
    heading1('13.  Volleyball Timeouts & Set Management'),
    spacer(),
    heading3('Timeouts'),
    bullet('Each team is allowed 2 timeouts per set.'),
    bullet('Click ⏸ HOME TIMEOUT to call a timeout for the Home team.'),
    bullet('Click ⏸ AWAY TIMEOUT to call a timeout for the Away team.'),
    bullet('The remaining count is shown in brackets: (2 LEFT), (1 LEFT), (0 LEFT).'),
    bullet('The button becomes disabled when a team has used all their timeouts for that set.'),
    spacer(),
    heading3('Advancing to the Next Set'),
    bullet('Click ⏭ NEXT SET to end the current set and begin the next one.'),
    bullet('The set scores (points) reset to 0; sets won counters are updated.'),
    bullet('Timeout counts reset for the new set.'),
    spacer(),
    heading3('Switching Sides'),
    bullet('Click ⇄ SWITCH to swap the Home and Away team positions on screen.'),
    bullet('This reflects a physical side-change on the court.'),
    spacer(),
    heading3('Resetting the Game'),
    bullet('Click 🔄 RESET to reset the entire volleyball game (all sets, scores, and timeouts).'),
    bullet('A confirmation prompt does not appear — use this button carefully.'),
    spacer(),
    heading3('Timeout Screen Ads Settings'),
    bullet('At the bottom of the Volleyball panel, click ⚙️ Timeout Screen Ads Settings to expand.'),
    bullet('Configure the sponsor advertisement displayed during timeouts on the TV overlay.'),
    hr(),
  ]
}

function section14() {
  return [
    heading1('14.  Scoreboard Overlay / TV Display'),
    para('The TV Display is a full-screen scoreboard that can be shown on a second monitor, captured by OBS/streaming software, or used as an on-venue display.'),
    spacer(),
    heading3('Opening the TV Display'),
    bullet('Click the 📺 button in the top-right of the tab bar.'),
    bullet('A full-screen scoreboard window opens on the available display.'),
    bullet('The display updates in real time as scores, clock, and game state change.'),
    spacer(),
    heading3('What the TV Display Shows'),
    makeTable(
      ['Element', 'Description'],
      [
        ['Team Names', 'HOME and GUEST team names (or custom names)'],
        ['Scores', 'Large LED-style score digits for both teams'],
        ['Period / Set', 'Current quarter (Q1–Q4 / OT) or set number'],
        ['Game Clock', 'Countdown timer in MM:SS format'],
        ['Shot Clock', 'Shot clock countdown (basketball only)'],
        ['Possession Arrow', 'Indicates which team has ball possession (basketball)'],
        ['Fouls (F:)', 'Team foul count (basketball)'],
        ['Timeouts (T:)', 'Remaining timeouts per team'],
        ['Serving Indicator', 'Highlighted arrow showing serving team (volleyball)'],
        ['Sets Won', 'Sets won counter per team (volleyball)'],
        ['Sponsor Logos', 'Up to 5 sponsor/partner logos uploaded in the BRANDING tab'],
      ]
    ),
    spacer(),
    heading3('Using as an OBS Browser Source'),
    bullet('Go to the SETTINGS tab → Overlay Server section.'),
    bullet('Click START OVERLAY SERVER.'),
    bullet('The URL appears (default: http://localhost:8080).'),
    bullet('In OBS Studio: click + under Sources → Browser → paste the URL → set width to 1920, height to 1080.'),
    bullet('The overlay updates automatically — no manual refresh needed.'),
    warning('Port 8080 is the default overlay port. If another application is using this port, change it in Settings before starting the server.'),
    hr(),
  ]
}

function section15() {
  return [
    heading1('15.  Mobile Viewer for Spectators'),
    para('Spectators can view the live scoreboard on their smartphones or tablets by connecting to the same local Wi-Fi network as the scoring computer.'),
    spacer(),
    heading3('Setting Up the Mobile Viewer'),
    bullet('Go to the SETTINGS tab → Mobile Viewer section.'),
    bullet('Click START MOBILE VIEWER.'),
    bullet('A QR Code and URL are displayed (default: http://[ip-address]:8081).'),
    bullet('Show the QR code to spectators — they scan it with their phone camera.'),
    bullet('The scoreboard opens in their browser and refreshes automatically.'),
    spacer(),
    note('All devices must be on the same Wi-Fi network. The scoring computer and the spectators\' phones must be connected to the same router.'),
    spacer(),
    heading3('Troubleshooting'),
    bullet('If the QR code does not work, type the URL manually in the phone\'s browser.'),
    bullet('Example URL: http://192.168.1.100:8081 (the IP address will vary per network).'),
    bullet('Check that the computer\'s firewall is not blocking port 8081.'),
    hr(),
  ]
}

function section16() {
  return [
    heading1('16.  Tournament Brackets'),
    para('The TOURNAMENT tab manages brackets for single-elimination, double-elimination, or round-robin tournaments within a league.'),
    spacer(),
    heading3('Setting Up a Tournament'),
    bullet('Click the TOURNAMENT tab in the Control Panel tab bar.'),
    bullet('If no league is loaded, a league picker is shown — select or create a league first.'),
    bullet('Choose a tournament format:'),
    bullet('Single Elimination — one loss ends a team\'s run', 1),
    bullet('Double Elimination — teams get a second chance after their first loss', 1),
    bullet('Round Robin — every team plays every other team', 1),
    bullet('Assign the participating teams to the bracket.'),
    spacer(),
    heading3('Running Tournament Games'),
    bullet('Click on any matchup in the bracket to load it into the Control Panel.'),
    bullet('Play and score the game normally.'),
    bullet('The bracket diagram updates automatically as results are recorded.'),
    spacer(),
    heading3('Bracket Viewer'),
    bullet('The visual bracket diagram shows all matchups, results, and advancement in real time.'),
    hr(),
  ]
}

function section17() {
  return [
    heading1('17.  Box Scores & Statistics'),
    spacer(),
    heading3('Available Stat Views'),
    spacer(),
    makeTable(
      ['Tab', 'Contents'],
      [
        ['SCORE',    'Live scoring and control panel'],
        ['HISTORY',  'All saved game logs for this league — click any game to view its Box Score'],
        ['SEASON',   'Cumulative player statistics across all games in the league'],
        ['LEADERS',  'Top players by points, rebounds, and assists'],
        ['AUDIT',    'Full chronological action log — all scoring events, settings changes, and user actions'],
      ]
    ),
    spacer(),
    heading3('Box Score View'),
    bullet('Click on any game in the HISTORY tab to open its Box Score.'),
    bullet('Shows per-player, per-period statistics for both teams.'),
    bullet('Can be exported to Excel (.xlsx) or PDF from the Box Score view.'),
    spacer(),
    heading3('Season Statistics'),
    bullet('The SEASON tab aggregates all saved game logs.'),
    bullet('Stats include: points, rebounds, assists, steals, blocks, fouls, and field goal percentages.'),
    spacer(),
    heading3('Leaderboards'),
    bullet('The LEADERS tab ranks all players in the league by category.'),
    bullet('Categories: Top Scorers, Top Rebounders, Top Assist Leaders.'),
    hr(),
  ]
}

function section18() {
  return [
    heading1('18.  Branding & Sponsor Logos'),
    para('The BRANDING tab lets you customize team visuals and add sponsor logos that appear on the TV Display.'),
    spacer(),
    heading3('Team Branding'),
    bullet('Click the BRANDING tab.'),
    bullet('For each team (Home and Away):'),
    bullet('Name — edit the team name displayed on the scoreboard', 1),
    bullet('Color — click the color picker to choose the team accent color', 1),
    bullet('Logo — click to upload a team logo image (any image format)', 1),
    bullet('Player Image (PNG) — upload a player cutout PNG for the TV display background', 1),
    spacer(),
    heading3('Sponsor / Partner Logos'),
    bullet('Up to 5 sponsor logos can be uploaded.'),
    bullet('Each logo has its own upload slot labeled Sponsor 1 through Sponsor 5.'),
    bullet('Logos appear on the TV Display / scoreboard overlay.'),
    bullet('Click Remove next to any logo to clear it.'),
    note('Logo uploads are stored as part of the game state and are displayed on the next TV view refresh.'),
    hr(),
  ]
}

function section19() {
  return [
    heading1('19.  Backup & Restore'),
    para('The Backup panel (in the SETTINGS tab) allows you to create a full backup of all league data, game logs, and system settings, and to restore from a previous backup.'),
    spacer(),
    heading3('Creating a Manual Backup'),
    bullet('Go to the SETTINGS tab → Backup section.'),
    bullet('Click CREATE BACKUP (or Backup Now).'),
    bullet('A native save dialog opens — choose the destination folder and file name.'),
    bullet('A .zip file is created containing all league data, game logs, and settings.'),
    bullet('The Last Backup timestamp and file path are shown after completion.'),
    spacer(),
    heading3('Automatic Backup Schedule'),
    bullet('Enable the auto-backup toggle in the Backup panel.'),
    bullet('Select a frequency: Daily, Weekly, or Monthly.'),
    bullet('Set the destination folder for automatic backups.'),
    bullet('Click Save Schedule. The system will back up automatically at the configured interval.'),
    spacer(),
    heading3('Restoring from a Backup'),
    bullet('Click RESTORE FROM BACKUP (or Restore).'),
    bullet('A file picker opens — select the .zip backup file.'),
    bullet('Confirm the restore operation.'),
    warning('Restoring from a backup replaces ALL current data with the backup contents. Always create a current backup before performing a restore.'),
    hr(),
  ]
}

function section20() {
  return [
    heading1('20.  System Settings'),
    para('Click the SETTINGS tab in the Control Panel to access all system configuration options.'),
    spacer(),
    makeTable(
      ['Setting / Section', 'Description'],
      [
        ['Sport / Game Type',   'Choose sport mode (Basketball, Volleyball). Affects scoring rules and display.'],
        ['Period Configuration','Set the number of quarters/periods and the duration of each period.'],
        ['Shot Clock',         'Configure the shot clock duration (24s, 14s, or custom). Basketball only.'],
        ['Overtime Rules',     'Set overtime period duration and number of allowed overtime periods.'],
        ['Team Fouls Limit',   'Configure how many team fouls trigger bonus / double-bonus situations.'],
        ['Timeout Settings',   'Set the number of timeouts per half/period and timeout duration in seconds.'],
        ['Audio / Volume',     'Adjust the volume for the buzzer sound and other game audio.'],
        ['Overlay Server',     'Start/stop the HTTP overlay server for OBS integration. Default port: 8080.'],
        ['Mobile Viewer',      'Start/stop the mobile scoreboard server for spectators. Default port: 8081.'],
        ['REST API',           'Enable/disable the REST API for third-party integrations. Port: 3000.'],
        ['Live Streaming',     'Configure RTMP streaming to Facebook Live, YouTube, or other platforms (requires FFmpeg).'],
        ['User Management',    '(Admin only) Add, edit, and delete user accounts. Reset passwords.'],
        ['Cloud Sync',         'Sync league data to the cloud (requires OAuth login with a cloud provider).'],
        ['Audit Log',          'Searchable, filterable log of all actions in the system.'],
        ['Backup',             'Manual and scheduled backup/restore. See Section 19.'],
        ['Language',           'Choose the display language for the interface.'],
      ]
    ),
    spacer(),
    note('Only Admin-role accounts can access User Management and some advanced settings. Scorekeeper accounts see a limited Settings view.'),
    hr(),
  ]
}

function section21() {
  return [
    heading1('21.  Frequently Asked Questions'),
    spacer(),
    heading3('Q: The application will not open.'),
    para('A: Verify the application is installed correctly. Try right-clicking the shortcut and selecting "Run as Administrator". Check for any error messages in the Windows Event Viewer or the application terminal.'),
    spacer(),
    heading3('Q: I entered the wrong score. How do I fix it?'),
    para('A: Click the UNDO (↶ UNDO) button in the Score tab to reverse the most recent scoring event. For team score adjustments, use the -1 button next to the team score. You can also review and audit all events in the AUDIT tab.'),
    spacer(),
    heading3('Q: The TV overlay is not showing in OBS.'),
    para('A: Ensure the Overlay Server is started in Settings (port 8080). Test the URL (http://localhost:8080) in a regular browser first to confirm it is working. Check that your firewall or antivirus is not blocking the port. If port 8080 is occupied, change it in Settings.'),
    spacer(),
    heading3('Q: Phones cannot access the Mobile Viewer.'),
    para('A: All devices must be on the same Wi-Fi network. On the scoring computer, find the local IP address (run "ipconfig" in Command Prompt and look for the IPv4 Address). Enter that IP manually in the phone\'s browser followed by :8081 (example: http://192.168.1.100:8081).'),
    spacer(),
    heading3('Q: I forgot my password.'),
    para('A: Only an Admin can reset passwords. Go to Settings → User Management, find the account, and use the Reset Password option. If the only Admin account is locked, contact technical support.'),
    spacer(),
    heading3('Q: Data is gone after restarting the application.'),
    para('A: If you used Trial Mode, games are not saved to history. To retain all game data, always create a League and use the full league workflow. Trial Mode is for practice only.'),
    spacer(),
    heading3('Q: I see a "Port already in use" error.'),
    para('A: Another application is occupying port 3000, 8080, or 8081. Close that application or change the port number in the relevant Settings section (Overlay Server, Mobile Viewer, or REST API).'),
    spacer(),
    heading3('Q: How do I stream to Facebook Live or YouTube?'),
    para('A: You need FFmpeg installed on your computer. Download it from ffmpeg.org and add it to your system PATH. Then enter your RTMP streaming URL and stream key in the Live Streaming panel in Settings.'),
    spacer(),
    heading3('Q: How do I advance the quarter in basketball?'),
    para('A: Click the NEXT Q button at the top of the Control Panel, or click the current quarter button (Q1, Q2, etc.) to advance to the next quarter. Overtime is added automatically after the fourth quarter if the score is tied.'),
    spacer(),
    heading3('Q: How do I switch to volleyball mode after I already started in basketball?'),
    para('A: Click the 🏀 SELECT SPORT button in the top-right of the tab bar. Confirm the prompt. You will be returned to the Sport Selector screen. Your game progress is preserved in the background.'),
    hr(),
  ]
}

function section22() {
  return [
    heading1('22.  Quick Start Cheat Sheet'),
    heading2('Basketball Quick Start'),
    codeBlock('1.  Open LigaControl and log in.'),
    codeBlock('2.  Select Basketball on the Sport Selector screen.'),
    codeBlock('3.  Create or load a League.'),
    codeBlock('4.  Select Home Team and Away Team → click START GAME.'),
    codeBlock('5.  Press START to begin the game clock.'),
    codeBlock('6.  Click +2 or +3 at the bottom to add team points.'),
    codeBlock('7.  Click a player name → click a stat button (+2, +REB, +AST, etc.).'),
    codeBlock('8.  Press NEXT Q at the end of each quarter.'),
    codeBlock('9.  Click UNDO to correct any mistake.'),
    codeBlock('10. After the game, save the game log when prompted.'),
    codeBlock('11. View stats in HISTORY / SEASON / LEADERS tabs.'),
    spacer(),
    heading2('Volleyball Quick Start'),
    codeBlock('1.  Open LigaControl and log in.'),
    codeBlock('2.  Select Volleyball on the Sport Selector screen.'),
    codeBlock('3.  Create or load a League (or use Trial Mode).'),
    codeBlock('4.  Select Home Team and Away Team → click START GAME.'),
    codeBlock('5.  Click HOME SERVE or AWAY SERVE to set the first server.'),
    codeBlock('6.  Click + POINT HOME or + POINT AWAY for each rally won.'),
    codeBlock('7.  Use ⏸ TIMEOUT buttons when teams call timeouts.'),
    codeBlock('8.  Click ⏭ NEXT SET at the end of each set.'),
    codeBlock('9.  Click ↶ UNDO to correct scoring errors.'),
    codeBlock('10. Click ⇄ SWITCH to swap sides between sets as needed.'),
    spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 320, after: 120 },
      children: [new TextRun({ text: 'LigaControl — Basketball & Volleyball Scoreboard System', bold: true, size: 24, color: BRAND_BLUE, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80 },
      children: [new TextRun({ text: 'Prepared by John Lloyd Florendo — Staff Manager', size: 20, color: GRAY_TEXT, italics: true, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80 },
      children: [new TextRun({ text: 'For questions or technical issues, contact your system administrator.', size: 18, color: '999999', font: 'Arial' })],
    }),
  ]
}

// ─── Build Document ───────────────────────────────────────────────────────────
const doc = new Document({
  sections: [
    {
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { color: BRAND_BLUE, space: 1, style: BorderStyle.SINGLE, size: 4 } },
              children: [
                new TextRun({ text: 'LigaControl User Manual', bold: true, size: 18, color: BRAND_BLUE, font: 'Arial' }),
                new TextRun({ text: '  |  Basketball & Volleyball Scoreboard System', size: 16, color: GRAY_TEXT, font: 'Arial' }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...makeCoverPage(),
        ...makeTOC(),
        ...section1(),
        ...section2(),
        ...section3(),
        ...section4(),
        ...section5(),
        ...section6(),
        ...section7(),
        ...section8(),
        ...section9(),
        ...section10(),
        ...section11(),
        ...section12(),
        ...section13(),
        ...section14(),
        ...section15(),
        ...section16(),
        ...section17(),
        ...section18(),
        ...section19(),
        ...section20(),
        ...section21(),
        ...section22(),
      ],
    },
  ],
})

const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(OUT, buffer)
console.log(`✅  Created: ${OUT}`)
