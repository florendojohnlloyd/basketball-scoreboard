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
    new Paragraph({ text: '', spacing: { before: 400 } }),
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
      children: [new TextRun({ text: 'Version 1.0  •  2025', size: 20, color: '999999', font: 'Arial' })],
    }),
    new Paragraph({ pageBreakBefore: true }),
  ]
}

// ─── TOC ─────────────────────────────────────────────────────────────────────
function makeTOC() {
  const items = [
    '1.   First Time Setup',
    '2.   Login',
    '3.   Select Sport',
    '4.   Create or Load a League (Liga)',
    '5.   Add Teams and Players',
    '6.   Start a Game',
    '7.   Basketball Scoring',
    '8.   Volleyball Scoring',
    '9.   Tabs and Settings',
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
    heading1('1.  First Time Setup'),
    para('When you open the app for the first time, no accounts exist yet. The system shows the Admin Setup screen instead of the login form.'),
    spacer(),
    heading3('Steps to Create Admin Account'),
    bullet('Enter your desired username.'),
    bullet('Enter a password that meets these rules:'),
    bullet('At least 8 characters', 1),
    bullet('At least 1 uppercase letter (A–Z)', 1),
    bullet('At least 1 digit (0–9)', 1),
    bullet('At least 1 special character (!, @, #, $, etc.)', 1),
    bullet('Confirm your password by entering it again.'),
    bullet('Click Create Admin Account.'),
    spacer(),
    note('Default demo credentials: Username: Admin  |  Password: Admin123!'),
    spacer(),
    para('After setup, you will be logged in automatically.'),
    hr(),
  ]
}

function section2() {
  return [
    heading1('2.  Login'),
    para('After the first setup, every time you open the app you will see the Login screen.'),
    spacer(),
    heading3('How to Log In'),
    bullet('Enter your Username (case-sensitive).'),
    bullet('Enter your Password.'),
    bullet('Click Log In.'),
    spacer(),
    heading3('User Roles'),
    spacer(),
    makeTable(
      ['Role', 'Access'],
      [
        ['Admin', 'Full access to all features, user management, backups, and audit logs'],
        ['Scorekeeper', 'Can score games and view statistics and audit logs'],
      ]
    ),
    spacer(),
    warning('After 5 failed login attempts, the account locks for 5 minutes. A countdown timer will appear on screen.'),
    hr(),
  ]
}

function section3() {
  return [
    heading1('3.  Select Sport'),
    para('After logging in, you choose which sport you want to manage. The system supports Basketball and Volleyball.'),
    spacer(),
    bullet('Click Basketball to manage basketball games.'),
    bullet('Click Volleyball to manage volleyball games.'),
    bullet('Other sports (Badminton, Sepak Takraw, Table Tennis) show "Coming Soon" and are not available yet.'),
    spacer(),
    note('You can return to this screen anytime by clicking SELECT SPORT in the tab bar.'),
    hr(),
  ]
}

function section4() {
  return [
    heading1('4.  Create or Load a League (Liga)'),
    para('After selecting a sport, the League Picker screen appears. All your leagues are listed here.'),
    spacer(),
    heading3('Create a New League'),
    bullet('Type a league name (example: MCBL 2025).'),
    bullet('Click + NEW LIGA.'),
    bullet('You will be taken to the League Management screen to add teams and players.'),
    spacer(),
    heading3('Load an Existing League'),
    bullet('Click on any league from the list.'),
    bullet('The league will load and you can proceed to select teams for a game.'),
    spacer(),
    heading3('Trial Mode'),
    bullet('Click TRIAL MODE (Quick Game) to start a game without a league.'),
    bullet('Game data is NOT saved in Trial Mode — useful for practice or exhibition games.'),
    spacer(),
    heading3('Delete a League'),
    bullet('Click the red X button next to a league name.'),
    bullet('Confirm deletion in the dialog.'),
    spacer(),
    warning('Deleting a league is permanent and cannot be undone. Always create a backup first.'),
    hr(),
  ]
}

function section5() {
  return [
    heading1('5.  Add Teams and Players'),
    para('In the League screen, you can add teams and manage player rosters.'),
    spacer(),
    heading3('Add a Team'),
    bullet('Type the team name in the input field.'),
    bullet('Click + Add Team or press Enter.'),
    bullet('The team appears in the Registered Teams list.'),
    spacer(),
    heading3('Add Players to a Team'),
    bullet('Click on a team name to open the Roster screen.'),
    bullet('Click + Add Player to add a new player.'),
    bullet('Enter the player Jersey Number and Name.'),
    bullet('Optionally upload a player photo (click the photo slot).'),
    bullet('Click SAVE to confirm.'),
    spacer(),
    note('A team needs at least 5 players before you can start a game.'),
    spacer(),
    heading3('Schedule and Staff'),
    bullet('Click the Schedule button (📅) in the league header to manage game schedules.'),
    bullet('Click the Staff button (👥) to add coaching staff and team managers.'),
    hr(),
  ]
}

function section6() {
  return [
    heading1('6.  Start a Game'),
    para('After loading a league, the Matchup Picker screen lets you select which teams will play.'),
    spacer(),
    heading3('Select Teams and Start'),
    bullet('Under Team A (Home), select the home team from the dropdown.'),
    bullet('Under Team B (Away), select the away team from the dropdown.'),
    bullet('Both teams must have at least 5 players each.'),
    bullet('Click START GAME.'),
    spacer(),
    note('You cannot select the same team for both sides. The system will alert you if there is an error.'),
    hr(),
  ]
}

function section7() {
  return [
    heading1('7.  Basketball Scoring'),
    para('The SCORE tab is the main screen where you score basketball games. It has scoring buttons, clock controls, and player stat tracking.'),
    spacer(),
    heading3('Score Buttons'),
    bullet('+3, +2, +1 — add points to the team.'),
    bullet('−1 — subtract a point (to correct a mistake).'),
    spacer(),
    heading3('Player Statistics'),
    bullet('Click a player name in the roster list to select them.'),
    bullet('Stat buttons appear: +1, +2, +3 (points), +REB (rebound), +AST (assist), +FOUL (foul), +STL (steal), +BLK (block).'),
    bullet('Click a stat button to record that action for the selected player.'),
    spacer(),
    heading3('Clock Controls'),
    bullet('Start / Stop / Reset — control the game clock.'),
    bullet('Shot Clock: 24s, 14s, Reset buttons. Toggle ON/OFF to show or hide the shot clock.'),
    spacer(),
    heading3('Fouls and Timeouts'),
    bullet('+FOUL and −FOUL buttons for each team.'),
    bullet('HOME TIMEOUT / AWAY TIMEOUT buttons show how many timeouts are left.'),
    spacer(),
    heading3('Possession'),
    bullet('Click the possession button for the team that has the ball. An arrow appears on the scoreboard.'),
    spacer(),
    heading3('Other Buttons'),
    bullet('NEXT Q — advance to the next quarter.'),
    bullet('SWITCH — swap team sides on screen.'),
    bullet('UNDO — undo the last scoring action.'),
    bullet('SUB — open the substitution screen.'),
    bullet('RESET — reset the game (start a new game).'),
    spacer(),
    heading3('TV Display'),
    bullet('Click the 📺 button in the tab bar to open the full-screen scoreboard display.'),
    bullet('Use this on a second monitor or capture it with OBS for streaming.'),
    hr(),
  ]
}

function section8() {
  return [
    heading1('8.  Volleyball Scoring'),
    para('The SCORE tab for volleyball shows set-based scoring controls. It is designed for fast, touch-friendly scoring.'),
    spacer(),
    para('Volleyball uses set-based scoring — there is no required game clock. Each set is played to 25 points (win by 2). A match is typically best of 3 or best of 5 sets. The optional match timer at the top of the screen can be used to track total match duration if needed, but it does not affect scoring.'),
    spacer(),
    heading3('Add or Remove Points'),
    bullet('Click + POINT HOME or + POINT AWAY to add a point to that team.'),
    bullet('Click the − (minus) button next to the score to remove a point (correct a mistake).'),
    spacer(),
    heading3('Serving Indicator'),
    bullet('Click HOME SERVE to show that the home team is serving (button highlights in gold).'),
    bullet('Click AWAY SERVE to show that the away team is serving.'),
    spacer(),
    heading3('Timeouts'),
    bullet('Each team gets 2 timeouts per set.'),
    bullet('Click HOME TIMEOUT or AWAY TIMEOUT to call a timeout.'),
    bullet('The button shows how many timeouts are left (e.g., "2 LEFT", "1 LEFT", "0 LEFT").'),
    spacer(),
    heading3('Set Management'),
    bullet('NEXT SET — advance to the next set. Scores reset, sets-won counter goes up.'),
    bullet('SWITCH — swap team sides on screen.'),
    bullet('UNDO — reverse the last scoring action.'),
    bullet('RESET — reset the whole game (all sets and scores).'),
    spacer(),
    heading3('Optional Match Timer'),
    bullet('Start / Stop — begin or pause the optional match duration timer.'),
    bullet('Reset — reset the timer back to 00:00.'),
    bullet('This timer is for reference only and does not affect set scores or game outcome.'),
    hr(),
  ]
}

function section9() {
  return [
    heading1('9.  Tabs and Settings'),
    para('The tab bar at the top of the screen gives access to all features of the system.'),
    spacer(),
    heading3('Available Tabs'),
    spacer(),
    makeTable(
      ['Tab', 'Description'],
      [
        ['SCORE', 'Main scoring screen with all game controls'],
        ['ROSTER', 'Edit player names and jersey numbers during the game, toggle active/bench status'],
        ['BRANDING', 'Set team colors, upload team logos, and add up to 5 sponsor logos'],
        ['HISTORY', 'View past games and box scores'],
        ['SEASON', 'Player statistics for the whole season'],
        ['LEADERS', 'Top scorers, rebounders, and assist leaders'],
        ['TOURNAMENT', 'Manage tournament brackets (single/double elimination, round robin)'],
        ['SETTINGS', 'Game rules (NBA/FIBA), volume, shot clock duration, user management, backup/restore'],
        ['AUDIT', 'Chronological log of all actions (Admin/Scorekeeper only)'],
      ]
    ),
    spacer(),
    heading3('Settings Tab'),
    bullet('Volume slider — adjust sound effects volume.'),
    bullet('Game rules presets — choose NBA or FIBA rules.'),
    bullet('Shot clock duration — set the default shot clock time.'),
    bullet('User management — Admins can create, edit, and delete user accounts.'),
    bullet('Backup and Restore — Admins can export and import league data.'),
    spacer(),
    heading3('TV Display (📺)'),
    para('Click the 📺 button in the tab bar to open the full-screen scoreboard on a second monitor or projector. The TV Display shows:'),
    bullet('Team scores and names'),
    bullet('Clock and period/set number'),
    bullet('Fouls and timeouts'),
    bullet('Possession arrow (basketball) or serving indicator (volleyball)'),
    bullet('Sponsor logos in real time'),
    spacer(),
    note('The TV Display updates automatically as you score the game. No manual refresh needed.'),
    hr(),
  ]
}

// ─── Generate Document ───────────────────────────────────────────────────────
const doc = new Document({
  sections: [{
    properties: {},
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
    ],
  }],
})

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUT, buffer)
  console.log(`✅ USER_MANUAL.docx created at:\n   ${OUT}`)
}).catch(err => {
  console.error('❌ Error creating document:', err)
  process.exit(1)
})
