import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, UnderlineType, ShadingType, BorderStyle,
  Table, TableRow, TableCell, WidthType, TableLayoutType
} from 'docx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'TRAINING_DOCUMENTATION.docx')

// Colors
const BRAND_DARK = '1A1A2E'
const BRAND_BLUE = '1A4FD6'
const WHITE = 'FFFFFF'
const GRAY_LIGHT = 'F3F4F6'
const WARNING_RED = 'C0392B'

function heading1(text) {
  return new Paragraph({
    spacing: { before: 400, after: 200 },
    border: { bottom: { color: BRAND_BLUE, space: 1, style: BorderStyle.SINGLE, size: 8 } },
    children: [new TextRun({ text, bold: true, size: 32, color: BRAND_DARK, font: 'Arial' })],
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
    spacing: { before: 200, after: 100 },
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

function numberedItem(num, text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [
      new TextRun({ text: `${num}. `, bold: true, size: 24, color: BRAND_BLUE, font: 'Arial' }),
      new TextRun({ text, size: 22, color: '1a1a1a', font: 'Arial' })
    ],
  })
}

function warning(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 360 },
    shading: { type: ShadingType.SOLID, color: 'FFE6E6', fill: 'FFE6E6' },
    children: [
      new TextRun({ text: '⚠️  WARNING: ', bold: true, size: 22, color: WARNING_RED, font: 'Arial' }),
      new TextRun({ text, size: 20, color: WARNING_RED, font: 'Arial' }),
    ],
  })
}

function note(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 360 },
    shading: { type: ShadingType.SOLID, color: GRAY_LIGHT, fill: GRAY_LIGHT },
    children: [
      new TextRun({ text: '📝 Note: ', bold: true, size: 20, color: BRAND_BLUE, font: 'Arial' }),
      new TextRun({ text, italics: true, size: 20, color: '555555', font: 'Arial' }),
    ],
  })
}

function spacer() {
  return new Paragraph({ text: '', spacing: { before: 80, after: 80 } })
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

// Cover Page
function makeCoverPage() {
  return [
    new Paragraph({ text: '', spacing: { before: 1200 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
      children: [new TextRun({ text: 'LigaControl', bold: true, size: 72, color: WHITE, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 160 },
      children: [new TextRun({ text: 'LED Scoreboard System', size: 36, color: BRAND_BLUE, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 120 },
      children: [new TextRun({ text: 'TRAINING DOCUMENTATION', bold: true, size: 44, color: BRAND_DARK, font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 400 },
      children: [new TextRun({ text: 'LED Panel Setup & System Operation Guide', size: 24, color: '555555', italics: true, font: 'Arial' })],
    }),
    spacer(), spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [new TextRun({ text: 'Prepared by: John Lloyd Florendo', size: 22, color: '555555', font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100 },
      children: [new TextRun({ text: 'System Developer & Trainer', size: 20, color: '888888', font: 'Arial' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [new TextRun({ text: '2026', size: 20, color: '999999', font: 'Arial' })],
    }),
    new Paragraph({ pageBreakBefore: true }),
  ]
}

const doc = new Document({
  sections: [{
    properties: {
      page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }
    },
    children: [
      ...makeCoverPage(),

      // Section 1: LED Panel Setup
      heading1('1. LED PANEL SETUP & CONNECTION'),
      spacer(),
      para('This section covers the physical setup and connection of the LED scoreboard panel.'),
      spacer(),

      heading2('1.1 Unpacking and Inspection'),
      bullet('Carefully unpack the LED panel from its protective packaging'),
      bullet('Inspect for any physical damage during shipping'),
      bullet('Verify all components are included:'),
      bullet('LED Panel Display Unit', 1),
      bullet('Power Supply Cable', 1),
      bullet('Control Cable (connects to computer)', 1),
      bullet('Mounting Brackets (if applicable)', 1),
      bullet('User Documentation', 1),
      warning('Do not power on the LED panel until all connections are properly secured.'),
      spacer(),

      heading2('1.2 LED Panel Parts & Components'),
      spacer(),
      makeTable(
        ['Component', 'Description', 'Connection Point'],
        [
          ['Power Input', 'AC power socket (110V-220V)', 'Connect to power outlet'],
          ['Control Port', 'Data cable connection (USB/Serial)', 'Connect to computer'],
          ['Display Panel', 'LED matrix display', 'No connection needed'],
          ['Mounting Points', 'Brackets for wall/pole mounting', 'Secure to structure'],
        ]
      ),
      spacer(),

      heading2('1.3 How to Connect LED Panel'),
      spacer(),
      numberedItem(1, 'Position the LED panel in the desired location (wall mount or stand)'),
      numberedItem(2, 'Secure the panel using mounting brackets if wall-mounting'),
      numberedItem(3, 'Connect the POWER CABLE to the panel\'s power input port'),
      numberedItem(4, 'Plug the power cable into a grounded AC outlet (220V recommended)'),
      numberedItem(5, 'Connect the CONTROL CABLE from the LED panel to your computer\'s USB port'),
      numberedItem(6, 'Ensure the control cable is firmly connected on both ends'),
      numberedItem(7, 'Verify all connections are secure before powering on'),
      spacer(),
      note('The control cable must be connected to the same computer running the LigaControl software.'),
      spacer(),

      heading2('1.4 How to Turn On LED Panel'),
      spacer(),
      numberedItem(1, 'Locate the POWER SWITCH on the LED panel (usually on the back or side)'),
      numberedItem(2, 'Ensure the power cable is plugged into a working outlet'),
      numberedItem(3, 'Turn the power switch to the ON position'),
      numberedItem(4, 'The LED panel will display a startup sequence (usually a brightness test or logo)'),
      numberedItem(5, 'Wait 5-10 seconds for the panel to fully initialize'),
      numberedItem(6, 'The panel is now ready to receive data from the LigaControl software'),
      spacer(),
      warning('Never disconnect the control cable while the LED panel is powered on. Always turn off the panel first.'),
      spacer(),

      new Paragraph({ pageBreakBefore: true }),

      // Section 2: Software Connection
      heading1('2. CONNECTING SOFTWARE TO LED PANEL'),
      spacer(),
      para('After the LED panel is physically connected and powered on, configure the LigaControl software to communicate with it.'),
      spacer(),

      heading2('2.1 Software Configuration'),
      spacer(),
      numberedItem(1, 'Open the LigaControl application on your computer'),
      numberedItem(2, 'Go to SETTINGS tab'),
      numberedItem(3, 'Find the "LED Panel Connection" section'),
      numberedItem(4, 'Select the correct COM PORT or USB port from the dropdown'),
      numberedItem(5, 'Set the BAUD RATE (usually 9600 or 115200 - check panel manual)'),
      numberedItem(6, 'Click "TEST CONNECTION" to verify communication'),
      numberedItem(7, 'If successful, the LED panel will flash or display a test pattern'),
      numberedItem(8, 'Click "SAVE SETTINGS" to store the configuration'),
      spacer(),
      note('If connection fails, try different COM ports or restart both the software and LED panel.'),
      spacer(),

      heading2('2.2 Display Settings'),
      bullet('Brightness: Adjust LED brightness (0-100%) based on venue lighting'),
      bullet('Refresh Rate: Set refresh rate (default: 60Hz for smooth display)'),
      bullet('Color Mode: RGB or Monochrome (depends on LED panel type)'),
      bullet('Orientation: Horizontal or Vertical display'),
      spacer(),

      new Paragraph({ pageBreakBefore: true }),

      // Section 3: Operating the Scoreboard System
      heading1('3. OPERATING THE SCOREBOARD SYSTEM'),
      spacer(),
      para('This section provides step-by-step instructions on how to operate the LigaControl scoreboard system during games.'),
      spacer(),

      heading2('3.1 Pre-Game Setup'),
      spacer(),
      numberedItem(1, 'Turn on the LED panel and verify it displays correctly'),
      numberedItem(2, 'Launch the LigaControl software'),
      numberedItem(3, 'Login with your credentials (Username: Admin, Password: Admin123!)'),
      numberedItem(4, 'Select the sport (Basketball or Volleyball)'),
      numberedItem(5, 'Create or load the league/tournament'),
      numberedItem(6, 'Add teams and players (ensure rosters are complete)'),
      numberedItem(7, 'Select the teams for the game (Home vs Away)'),
      numberedItem(8, 'Click START GAME'),
      spacer(),

      heading2('3.2 During the Game'),
      spacer(),
      heading3('Starting the Clock (Basketball) / Optional Timer (Volleyball)'),
      bullet('BASKETBALL: Click the START button to begin the game clock. The LED panel will show the time counting down. Click PAUSE to stop the clock.'),
      bullet('VOLLEYBALL: Volleyball does not require a game clock. Scoring is set-based (first to 25 points per set, win by 2). An optional match timer is available to track total game duration — click Start/Stop/Reset as needed.'),
      spacer(),

      heading3('Recording Scores'),
      bullet('Click on a player\'s name from the roster'),
      bullet('Click +1, +2, or +3 to add points'),
      bullet('The score updates immediately on both the software and LED panel'),
      bullet('Use -1 button to correct scoring mistakes'),
      spacer(),

      heading3('Managing Fouls & Timeouts'),
      bullet('Click +FOUL to add a team foul (displays on LED panel)'),
      bullet('Click TIMEOUT to record a team timeout'),
      bullet('The LED panel shows remaining timeouts and team foul count'),
      spacer(),

      heading3('Shot Clock (Basketball)'),
      bullet('Click 24 SEC or 14 SEC to reset shot clock'),
      bullet('Toggle SHOT: ON/OFF to show/hide shot clock on LED panel'),
      spacer(),

      heading2('3.3 Post-Game'),
      bullet('Click END GAME or advance to the final period'),
      bullet('The system automatically saves the game data'),
      bullet('Review box scores and statistics in the HISTORY tab'),
      bullet('Turn off the LED panel after the game'),
      spacer(),

      new Paragraph({ pageBreakBefore: true }),

      // Section 4: Training Staff
      heading1('4. TRAINING STAFF ON SYSTEM OPERATION'),
      spacer(),
      para('Use this checklist to train staff members on operating the scoreboard system.'),
      spacer(),

      heading2('4.1 Staff Training Checklist'),
      spacer(),
      makeTable(
        ['Training Topic', 'Status'],
        [
          ['How to turn on/off LED panel', '☐ Completed'],
          ['How to connect LED panel to computer', '☐ Completed'],
          ['How to launch LigaControl software', '☐ Completed'],
          ['How to login (Admin/Admin123!)', '☐ Completed'],
          ['How to create/load a league', '☐ Completed'],
          ['How to add teams and players', '☐ Completed'],
          ['How to start a game', '☐ Completed'],
          ['How to record scores', '☐ Completed'],
          ['How to manage clock (start/pause)', '☐ Completed'],
          ['How to record fouls and timeouts', '☐ Completed'],
          ['How to end a game and save data', '☐ Completed'],
          ['How to troubleshoot connection issues', '☐ Completed'],
        ]
      ),
      spacer(),

      heading2('4.2 Training Tips'),
      bullet('Practice with a test game before the first live event'),
      bullet('Have staff operate the system under supervision initially'),
      bullet('Keep this training documentation accessible during games'),
      bullet('Assign backup operators in case of emergency'),
      spacer(),

      new Paragraph({ pageBreakBefore: true }),

      // Section 5: Scoreboard Rules & Limitations
      heading1('5. SCOREBOARD RULES & LIMITATIONS'),
      spacer(),
      para('Important rules and limitations to ensure proper display on the LED panel.'),
      spacer(),

      heading2('5.1 Team Name Character Limit'),
      spacer(),
      warning('MAXIMUM 12 CHARACTERS for team names to fit on LED panel display.'),
      spacer(),
      para('The LED panel has limited display space. Team names longer than 12 characters will be truncated or not display correctly.'),
      spacer(),

      heading3('✅ Good Team Name Examples (12 characters or less):'),
      bullet('TIGERS'),
      bullet('WILDCATS'),
      bullet('EAGLES'),
      bullet('CITY BALLERS'),
      bullet('HOOPS SQUAD'),
      spacer(),

      heading3('❌ Bad Team Name Examples (too long):'),
      bullet('METROPOLITAN BASKETBALL CLUB (30 chars) - TOO LONG'),
      bullet('CHAMPIONSHIP WARRIORS (22 chars) - TOO LONG'),
      bullet('PROFESSIONAL STARS (19 chars) - TOO LONG'),
      spacer(),

      note('When creating teams, always verify the name length before saving. The system will warn you if the name is too long.'),
      spacer(),

      heading2('5.2 Other Display Rules'),
      spacer(),
      makeTable(
        ['Item', 'Limitation', 'Recommendation'],
        [
          ['Team Names', '12 characters max', 'Use abbreviations if needed'],
          ['Player Names', '15 characters max', 'Use first initial + last name'],
          ['Jersey Numbers', '0-99', 'No special characters'],
          ['Score Display', '0-999 points', 'LED panel supports 3 digits'],
          ['Clock Format', 'MM:SS', 'Standard time format only'],
        ]
      ),
      spacer(),

      new Paragraph({ pageBreakBefore: true }),

      // Section 6: Troubleshooting
      heading1('6. TROUBLESHOOTING'),
      spacer(),

      heading2('6.1 LED Panel Issues'),
      spacer(),
      heading3('Problem: LED panel not turning on'),
      bullet('Check power cable connection'),
      bullet('Verify power outlet is working'),
      bullet('Check power switch is in ON position'),
      bullet('Try a different power outlet'),
      spacer(),

      heading3('Problem: LED panel shows no data'),
      bullet('Check control cable connection (computer to panel)'),
      bullet('Verify correct COM port is selected in software settings'),
      bullet('Test connection using "TEST CONNECTION" button'),
      bullet('Restart both software and LED panel'),
      spacer(),

      heading3('Problem: Display is dim or flickering'),
      bullet('Adjust brightness in software settings'),
      bullet('Check power supply voltage (should be stable)'),
      bullet('Update refresh rate settings'),
      bullet('Contact technician if problem persists'),
      spacer(),

      heading2('6.2 Software Issues'),
      spacer(),
      heading3('Problem: Cannot connect to LED panel'),
      bullet('Restart the LigaControl software'),
      bullet('Check USB/COM port in Device Manager (Windows)'),
      bullet('Try unplugging and re-plugging the control cable'),
      bullet('Verify LED panel drivers are installed'),
      spacer(),

      heading3('Problem: Scores not updating on LED panel'),
      bullet('Check connection status in SETTINGS'),
      bullet('Verify "Send to LED Panel" option is enabled'),
      bullet('Restart the software'),
      bullet('Test with manual score entry'),
      spacer(),

      new Paragraph({ pageBreakBefore: true }),

      // Section 7: Contact & Support
      heading1('7. CONTACT & SUPPORT'),
      spacer(),
      para('For technical support and additional training:'),
      spacer(),

      new Paragraph({
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({ text: 'Developer & Trainer: ', bold: true, size: 24, font: 'Arial' }),
          new TextRun({ text: 'John Lloyd Florendo', size: 24, color: BRAND_BLUE, font: 'Arial' }),
        ],
      }),

      new Paragraph({
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({ text: 'System: ', bold: true, size: 24, font: 'Arial' }),
          new TextRun({ text: 'LigaControl Basketball Scoreboard System', size: 24, font: 'Arial' }),
        ],
      }),

      spacer(), spacer(),

      para('I commit to providing ongoing technical support and training to ensure successful operation of the scoreboard system for all games and tournaments.'),
      spacer(),

      // Signature section
      new Paragraph({
        spacing: { before: 400, after: 200 },
        children: [
          new TextRun({
            text: 'Respectfully submitted,',
            size: 24,
            font: 'Arial'
          })
        ]
      }),

      new Paragraph({ text: '', spacing: { after: 600 } }),

      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: '_________________________________',
            size: 24,
            font: 'Arial'
          })
        ]
      }),

      new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({
            text: 'John Lloyd Florendo',
            bold: true,
            size: 24,
            font: 'Arial'
          })
        ]
      }),

      new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({
            text: 'System Developer & Trainer',
            size: 22,
            font: 'Arial'
          })
        ]
      }),

      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: 'Date: _____________________',
            size: 24,
            font: 'Arial'
          })
        ]
      })
    ]
  }]
})

const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(OUT, buffer)
console.log(`✅  Created: ${OUT}`)
