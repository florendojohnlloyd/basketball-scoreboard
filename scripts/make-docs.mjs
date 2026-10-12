import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, Header, ImageRun,
  TableLayoutType,
} from 'docx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS = path.join(__dirname, 'screenshots')
const OUT = path.join(__dirname, '..', 'LigaControl_Paano_Gamitin.docx')

// ─── Colors ─────────────────────────────────────────────────────────────────
const BRAND_DARK  = '1A1A2E'
const BRAND_GOLD  = 'F0A020'
const BRAND_BLUE  = '1A4FD6'
const WHITE       = 'FFFFFF'
const ROW_ALT     = 'F5F7FA'

// ─── Image helper ────────────────────────────────────────────────────────────
// transformation takes WIDTH and HEIGHT in pixels (not EMU)
function imgBlock(filename, widthPx, heightPx, caption) {
  const filePath = path.join(SCREENSHOTS, filename)
  if (!fs.existsSync(filePath)) return []
  const data = fs.readFileSync(filePath)

  // Max usable width in a standard A4 doc with 1080 EMU margins ≈ 580px at 96dpi
  const maxW = 580
  const scale = Math.min(1, maxW / widthPx)
  const w = Math.round(widthPx * scale)
  const h = Math.round(heightPx * scale)

  const image = new ImageRun({
    data,
    transformation: { width: w, height: h },
    type: 'png',
  })

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 60 },
      children: [image],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [
        new TextRun({ text: caption, italics: true, size: 18, color: '888888' }),
      ],
    }),
  ]
}

// ─── Text helpers ────────────────────────────────────────────────────────────
function heading1(text) {
  return new Paragraph({
    spacing: { before: 400, after: 160 },
    border: { bottom: { color: BRAND_GOLD, space: 1, style: BorderStyle.SINGLE, size: 6 } },
    children: [new TextRun({ text, bold: true, size: 32, color: BRAND_DARK, font: 'Segoe UI' })],
  })
}

function heading2(text) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, bold: true, size: 26, color: BRAND_BLUE, font: 'Segoe UI' })],
  })
}

function heading3(text) {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, bold: true, size: 22, color: '334455' })],
  })
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 80 },
    children: [new TextRun({ text, size: 22, color: '1a1a1a', ...opts })],
  })
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, color: '1a1a1a' })],
  })
}

function note(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: '💡 Tip: ', bold: true, size: 20, color: BRAND_GOLD }),
      new TextRun({ text, italics: true, size: 20, color: '555555' }),
    ],
  })
}

function warning(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: '⚠️  Paalala: ', bold: true, size: 20, color: 'cc0000' }),
      new TextRun({ text, italics: true, size: 20, color: '555555' }),
    ],
  })
}

function spacer() {
  return new Paragraph({ text: '', spacing: { before: 60, after: 60 } })
}

function hr() {
  return new Paragraph({
    text: '',
    border: { bottom: { color: BRAND_GOLD, space: 1, style: BorderStyle.SINGLE, size: 8 } },
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
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, size: 20, color: WHITE })],
        })],
      })
    ),
  })
  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          shading: { type: ShadingType.SOLID, color: ri % 2 === 0 ? WHITE : ROW_ALT, fill: ri % 2 === 0 ? WHITE : ROW_ALT },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [new Paragraph({
            children: [new TextRun({ text: cell, size: 20, color: '1a1a1a' })],
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
    new Paragraph({ text: '', spacing: { before: 800 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
      children: [new TextRun({ text: 'LigaControl', bold: true, size: 72, color: BRAND_GOLD, font: 'Segoe UI' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: 'Basketball Scoreboard System', size: 36, color: BRAND_BLUE, font: 'Segoe UI' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text: 'PAANO GAMITIN', bold: true, size: 40, color: '333333', font: 'Segoe UI' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80 },
      children: [new TextRun({ text: 'User Guide — Filipino', size: 24, color: '888888', italics: true })],
    }),
    spacer(), spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Para sa mga Scorekeeper, Game Operator, at Liga Admin', size: 22, color: '555555' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [new TextRun({ text: 'Bersyon 1.0  •  2026', size: 20, color: '999999' })],
    }),
    new Paragraph({ pageBreakBefore: true }),
  ]
}

// ─── TOC ─────────────────────────────────────────────────────────────────────
function makeTOC() {
  const items = [
    '1.   Login',
    '2.   Pumili ng Sport',
    '3.   Pumili ng Liga o Gumawa ng Bago',
    '4.   Mag-manage ng Teams at Roster',
    '5.   Simulan ang Laro',
    '6.   Control Panel — Mga Pangunahing Kontrol',
    '7.   Score at Stats ng Players',
    '8.   Game Clock at Shot Clock',
    '9.   Timeout',
    '10.  Fouls',
    '11.  Scoreboard Overlay / TV View (Para sa Broadcast)',
    '12.  Mobile Viewer (Para sa Manonood)',
    '13.  Tournament / Bracket',
    '14.  Box Score at Stats',
    '15.  Backup at Restore',
    '16.  Settings at Iba Pa',
    '17.  Mga Madalas na Tanong (FAQ)',
  ]
  return [
    heading1('📋  Talaan ng Nilalaman'),
    ...items.map(i => new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ text: i, size: 22, color: BRAND_BLUE })],
    })),
    new Paragraph({ pageBreakBefore: true }),
  ]
}

// ─── Sections ────────────────────────────────────────────────────────────────

function sec1() {
  return [
    heading1('1.   Login'),
    para('Kapag binuksan ang app, lalabas agad ang Login screen.'),
    spacer(),
    ...imgBlock('login.png', 487, 462, 'Larawan 1 — Login Screen'),
    spacer(),
    makeTable(
      ['Role', 'Magagawa'],
      [
        ['Admin', 'Lahat — mag-manage ng users, mag-delete ng liga, mag-access ng settings'],
        ['Scorekeeper', 'Mag-score, mag-manage ng game, tingnan ang stats'],
      ]
    ),
    spacer(),
    heading3('Paano mag-login:'),
    bullet('I-type ang iyong Username at Password.'),
    bullet('I-click ang Log In.'),
    bullet('Kung mali ang credentials, lalabas ang error message sa ibaba ng button.'),
    note('Una pang beses? Makipag-ugnayan sa Admin para makuha ang iyong account.'),
    hr(),
  ]
}

function sec2() {
  return [
    heading1('2.   Pumili ng Sport'),
    para('Pagkatapos mag-login, lalabas ang Sport Selector screen. Dito mo pipiliin kung anong sport ang ie-manage.'),
    spacer(),
    ...imgBlock('Select Sport.png', 1917, 1021, 'Larawan 2 — Sport Selector Screen'),
    spacer(),
    bullet('I-click ang Basketball (ang tanging Available ngayon).'),
    bullet('Ang ibang sports (Badminton, Volleyball, atbp.) ay "Coming Soon" pa.'),
    note('V17.10 — Basketball fully implemented. Others coming in future updates.'),
    hr(),
  ]
}

function sec3() {
  return [
    heading1('3.   Pumili ng Liga o Gumawa ng Bago'),
    para('Pagkatapos pumili ng sport, pumunta ka sa Liga Picker screen.'),
    heading3('Gumawa ng Bagong Liga'),
    bullet('I-type ang pangalan ng liga sa text box (hal. MCBL 2026).'),
    bullet('I-click ang + NEW LIGA.'),
    bullet('Papasok ka sa Liga Management screen para mag-dagdag ng teams.'),
    heading3('Mag-load ng Existing Liga'),
    bullet('Makikita mo ang listahan ng mga nakaraang liga.'),
    bullet('I-click ang pangalan ng liga para i-load ito.'),
    bullet('Mapupunta ka sa Matchup Picker para pumili ng laban.'),
    heading3('Trial Mode (Quick Game)'),
    bullet('I-click ang TRIAL MODE (Quick Game) para magsimula nang walang liga.'),
    bullet('Para sa practice o eksibisyon — hindi nase-save sa game history.'),
    heading3('Mag-delete ng Liga'),
    bullet('I-click ang ✕ na button sa tabi ng liga name.'),
    warning('Hindi na mababawi ang deleted na liga at lahat ng data nito.'),
    hr(),
  ]
}

function sec4() {
  return [
    heading1('4.   Mag-manage ng Teams at Roster'),
    heading3('Mag-dagdag ng Team'),
    bullet('I-type ang team name sa text box.'),
    bullet('Pindutin ang ADD TEAM. Makikita ang team sa listahan.'),
    heading3('Mag-edit ng Roster'),
    bullet('I-click ang team name para buksan ang Team Roster Modal.'),
    bullet('Idagdag ang players: Jersey Number, Pangalan, at optional na Photo.'),
    bullet('I-click ang SAVE pagkatapos.'),
    heading3('Staff at Schedule'),
    bullet('STAFF button — para sa coaches, managers, at iba pang staff.'),
    bullet('SCHEDULE button — para sa mga naka-schedule na laban.'),
    hr(),
  ]
}

function sec5() {
  return [
    heading1('5.   Simulan ang Laro'),
    bullet('Sa Matchup Picker, piliin ang Home Team (kaliwa) at Away Team (kanan).'),
    bullet('I-click ang START GAME.'),
    bullet('Mapupunta ka sa Control Panel.'),
    hr(),
  ]
}

function sec6() {
  return [
    heading1('6.   Control Panel — Mga Pangunahing Kontrol'),
    para('Ito ang pangunahing screen ng scoring. Lahat ng game actions ay ginagawa dito.'),
    spacer(),
    ...imgBlock('Control panel.png', 1917, 1077, 'Larawan 3 — Control Panel (Pangunahing Scoring Screen)'),
    spacer(),
    heading3('Layout ng Control Panel:'),
    bullet('Itaas — Team names (HOME / GUEST), scores, quarter indicator, game clock, shot clock'),
    bullet('Gitna — Mga pangunahing action buttons'),
    bullet('Kaliwa — Home team player roster at stat buttons'),
    bullet('Kanan — Away/Guest team player roster at stat buttons'),
    bullet('Ibaba — Timeout indicators, Team Foul display, score buttons (+1/+2/+3)'),
    spacer(),
    makeTable(
      ['Button', 'Ginagawa'],
      [
        ['START',       'Simulan ang game clock'],
        ['PAUSE / II',  'I-pause ang orasan'],
        ['BUZZER',      'I-trigger ang buzzer sound'],
        ['◄ POSS / POSS ►', 'I-toggle ang possession arrow (kung sino may hawak ng bola)'],
        ['SWITCH',      'I-switch ang panig ng home at away teams'],
        ['REPLAY',      'I-trigger ang replay indicator sa scoreboard'],
        ['RESET (Q)',   'I-reset ang kasalukuyang quarter'],
        ['Q1 (Quarter button)', 'Pumunta sa susunod na quarter'],
        ['SUB',         'I-record ang substitution ng player'],
        ['NEXT Q',      'Advance sa susunod na quarter (top bar)'],
        ['24 SEC / 14 SEC', 'I-reset ang shot clock sa 24 o 14 segundo'],
        ['SHOT: ON/OFF','I-toggle ang shot clock display'],
      ]
    ),
    hr(),
  ]
}

function sec7() {
  return [
    heading1('7.   Score at Stats ng Players'),
    heading3('Magdagdag ng Puntos o Stats'),
    bullet('Sa Player List (kaliwa para Home, kanan para Away), i-click ang pangalan ng player.'),
    bullet('Makikita ang stat buttons sa tabi ng player name:'),
    spacer(),
    makeTable(
      ['Button', 'Ibig Sabihin'],
      [
        ['+REB',  'Rebound'],
        ['+AST',  'Assist'],
        ['+FOUL', 'Personal foul'],
        ['+STL',  'Steal'],
        ['+BLK',  'Block'],
        ['+TO',   'Turnover'],
      ]
    ),
    spacer(),
    heading3('Para sa Points — Score Buttons sa Ibaba:'),
    bullet('+3, +2, +1 (kaliwa) — para sa Home team'),
    bullet('-1, +1, +2, +3 (kanan) — para sa Away/Guest team'),
    bullet('-1 — para i-minus ang score (correction)'),
    note('Lahat ng score events ay nilo-log sa game history para sa audit at box score.'),
    hr(),
  ]
}

function sec8() {
  return [
    heading1('8.   Game Clock at Shot Clock'),
    heading3('Game Clock'),
    bullet('START — simulan ang orasan.'),
    bullet('PAUSE (II button) — ihinto muna.'),
    bullet('Makikita ang oras sa clock display sa gitna (format: MM:SS).'),
    bullet('Kasama rin ang quarter indicator (Q1, Q2, Q3, Q4).'),
    heading3('Shot Clock'),
    bullet('Makikita ang shot clock sa ibaba ng game clock (default: 24 seconds).'),
    bullet('24 SEC button — i-reset sa 24 seconds.'),
    bullet('14 SEC button — i-reset sa 14 seconds (para sa offensive rebound).'),
    bullet('SHOT: ON/OFF — i-toggle ang visibility ng shot clock.'),
    bullet('Awtomatikong hihinto ang shot clock kapag na-pause ang game clock.'),
    hr(),
  ]
}

function sec9() {
  return [
    heading1('9.   Timeout'),
    bullet('Makikita ang TIMEOUT section sa kaliwa at kanan ng ibaba ng screen.'),
    bullet('Ang mga dots (●●●) ay kumakatawan sa remaining timeouts.'),
    bullet('I-click ang USE button para mag-call ng timeout para sa team.'),
    bullet('Lalabas ang "1st Half: 2/2" na indicator kung ilang timeouts ang natitira.'),
    bullet('Awtomatikong hihinto ang orasan kapag nag-call ng timeout.'),
    note('I-configure ang bilang at duration ng timeouts sa Settings tab.'),
    hr(),
  ]
}

function sec10() {
  return [
    heading1('10.  Fouls'),
    bullet('Makikita ang Team Foul display sa gitna-ibaba ng screen (LED-style red number).'),
    bullet('+FOUL H button — magdagdag ng foul sa Home team.'),
    bullet('-FOUL H button — mag-minus ng foul sa Home team (correction).'),
    bullet('+FOUL A / -FOUL A — para sa Away/Guest team.'),
    bullet('Lalabas ang visual indicator kapag umabot na sa bonus/double-bonus threshold.'),
    bullet('Nire-reset ang foul counter sa simula ng bawat half o quarter (depende sa settings).'),
    hr(),
  ]
}

function sec11() {
  return [
    heading1('11.  Scoreboard Overlay / TV View (Para sa Broadcast)'),
    para('Ang TV View ay isang full-screen scoreboard display na pwedeng ilagay sa pangalawang monitor o i-broadcast via OBS.'),
    spacer(),
    ...imgBlock('boxscore.png', 1917, 1077, 'Larawan 4 — TV/Broadcast Scoreboard View'),
    spacer(),
    heading3('Mga nakikita sa TV View:'),
    bullet('HOME at GUEST team names (asul at pula)'),
    bullet('Malaking score digits sa kaliwa at kanan'),
    bullet('Quarter indicator (Q1, Q2, atbp.) sa gitna-itaas'),
    bullet('Game clock (MM:SS) sa gitna'),
    bullet('Shot Clock sa gitna-ibaba'),
    bullet('Possession arrows (◄ ►) sa tabi ng shot clock'),
    bullet('F: (Fouls) at T: (Timeouts) sa ibaba ng bawat team'),
    spacer(),
    heading3('Para gamitin bilang OBS Browser Source:'),
    bullet('Pumunta sa Settings → Overlay Server.'),
    bullet('I-click ang START OVERLAY SERVER.'),
    bullet('Makikita ang URL (default: http://localhost:8080).'),
    bullet('Sa OBS: Mag-add ng Browser Source → i-paste ang URL → set 1920×1080.'),
    heading3('Para sa pangalawang monitor (TV button):'),
    bullet('I-click ang TV button sa kanang sulok ng tab bar ng Control Panel.'),
    bullet('Magbubukas ang full-screen scoreboard sa available na display.'),
    warning('Port 8080 ang default para sa overlay. Siguraduhing hindi ito ginagamit ng ibang app.'),
    hr(),
  ]
}

function sec12() {
  return [
    heading1('12.  Mobile Viewer (Para sa Manonood)'),
    para('Pwedeng tingnan ng mga manonood ang live score sa kanilang phone/tablet sa lokal na network.'),
    heading3('Paano i-setup:'),
    bullet('Pumunta sa Mobile Viewer section ng Settings.'),
    bullet('I-click ang START MOBILE VIEWER.'),
    bullet('Lalabas ang QR Code at URL (default: http://[ip-address]:8081).'),
    bullet('Ipakita ang QR code sa mga manonood para i-scan gamit ang kanilang phone camera.'),
    bullet('Makikita nila ang live scoreboard sa browser — awtomatikong nag-re-refresh.'),
    warning('Kailangan ng parehong Wi-Fi network ang computer at ang mga phone ng manonood.'),
    hr(),
  ]
}

function sec13() {
  return [
    heading1('13.  Tournament / Bracket'),
    heading3('Paano mag-setup:'),
    bullet('I-click ang TOURNAMENT tab sa tab bar ng Control Panel.'),
    bullet('Pumili ng format:'),
    bullet('Single Elimination — kalaban agad pag natalo', 1),
    bullet('Double Elimination — isa pang chance pagkatapos ng unang talo', 1),
    bullet('Round Robin — lahat laban sa lahat', 1),
    bullet('I-assign ang teams sa bracket.'),
    bullet('I-click ang isang match para i-load ito sa Control Panel at simulan ang laban.'),
    heading3('Bracket Viewer'),
    bullet('Real-time nag-a-update ang bracket diagram habang tumatakbo ang tournament.'),
    hr(),
  ]
}

function sec14() {
  return [
    heading1('14.  Box Score at Stats'),
    makeTable(
      ['Tab', 'Nilalaman'],
      [
        ['SCORE',    'Pangunahing scoring at control panel'],
        ['HISTORY',  'Listahan ng lahat ng nakaraang laro sa liga'],
        ['SEASON',   'Cumulative stats ng mga player sa buong liga'],
        ['LEADERS',  'Top scorers, rebounders, at assists leaders ng liga'],
        ['AUDIT',    'Complete history ng lahat ng scoring at config actions'],
        ['TOURNAMENT','Bracket at tournament management'],
      ]
    ),
    spacer(),
    bullet('Pwedeng i-export ang box score bilang Excel (.xlsx) o PDF.'),
    bullet('I-click ang tab name sa itaas ng Control Panel para lumipat ng view.'),
    hr(),
  ]
}

function sec15() {
  return [
    heading1('15.  Backup at Restore'),
    heading3('Mag-backup:'),
    bullet('Pumunta sa SETTINGS tab → Backup section.'),
    bullet('I-click ang CREATE BACKUP.'),
    bullet('Gagawa ng .zip file na may lahat ng liga data, game logs, at settings.'),
    bullet('Piliin ang folder kung saan ise-save.'),
    heading3('Mag-restore:'),
    bullet('I-click ang RESTORE FROM BACKUP.'),
    bullet('Pumili ng .zip backup file.'),
    bullet('Kumpirmahin ang restore.'),
    warning('Ang restore ay papalitan ang lahat ng kasalukuyang data. Mag-backup muna ng current data bago mag-restore.'),
    note('Mag-backup bago mag-major tournament para hindi mawala ang data.'),
    hr(),
  ]
}

function sec16() {
  return [
    heading1('16.  Settings at Iba Pa'),
    para('I-click ang SETTINGS tab sa tab bar para ma-access ang lahat ng configuration.'),
    spacer(),
    makeTable(
      ['Setting', 'Paliwanag'],
      [
        ['Sport Type',           'Pumili ng sport (Basketball, etc.)'],
        ['Period Configuration', 'Bilang ng quarters/periods at duration ng bawat isa'],
        ['Shot Clock',           'Duration ng shot clock (24s, 14s, custom)'],
        ['Overtime',             'I-configure ang overtime rules'],
        ['Team Fouls Limit',     'Kung ilang fouls bago mag-bonus'],
        ['Audio / Volume',       'Volume ng buzzer at iba pang sounds'],
        ['REST API',             'Enable/disable ang API para sa 3rd-party integrations (Port 3000)'],
        ['User Management',      '(Admin only) Mag-add/edit/delete ng user accounts'],
        ['Audit Log',            'Searchable history ng lahat ng actions'],
        ['Cloud Sync',           'I-sync ang data sa cloud (kailangan ng OAuth login)'],
        ['Language',             'Piliin ang display language'],
        ['Branding',             'Upload ng team logos at sponsor images (BRANDING tab)'],
      ]
    ),
    hr(),
  ]
}

function sec17() {
  return [
    heading1('17.  Mga Madalas na Tanong (FAQ)'),
    heading3('Q: Hindi nag-o-open ang app.'),
    para('A: I-check kung naka-install ng tama. Subukan i-run bilang Administrator. Tingnan kung may error sa terminal.'),
    heading3('Q: Mali ang score, paano i-undo?'),
    para('A: Gamitin ang -1 score button sa ibaba ng screen para i-correct ang score ng team. Para sa player stats, pumunta sa AUDIT tab para makita ang log.'),
    heading3('Q: Hindi gumagana ang Overlay sa OBS.'),
    para('A: Siguraduhing naka-start ang Overlay Server (Port 8080). I-test muna ang URL sa browser bago i-add sa OBS. I-check kung may firewall na nag-i-block.'),
    heading3('Q: Hindi makita ng phones ang Mobile Viewer.'),
    para('A: Kailangan ng parehong Wi-Fi network. I-type manually ang IP sa browser ng phone (hal. http://192.168.1.100:8081).'),
    heading3('Q: Nakalimutan ang password.'),
    para('A: Ang Admin lang ang pwede mag-reset ng passwords sa User Management panel sa SETTINGS tab.'),
    heading3('Q: Nawala ang data pagkatapos ng restart.'),
    para('A: Kung Trial Mode ang ginamit, hindi nase-save ang games. Gumawa ng liga at gamitin ang full liga flow para manatili ang data.'),
    heading3('Q: "Port already in use" error.'),
    para('A: May ibang app na gumagamit ng port 3000, 8080, o 8081. I-close ang mga ito o i-change ang port sa Settings.'),
    heading3('Q: Gusto mag-stream sa Facebook/YouTube.'),
    para('A: Kailangan ng FFmpeg. I-install ito at i-configure ang RTMP URL sa Live Streaming panel ng Settings.'),
    heading3('Q: Paano mag-advance ng quarter?'),
    para('A: I-click ang NEXT Q button sa itaas ng control panel, o i-click ang Q1 button sa gitna para pumunta sa susunod na quarter.'),
    hr(),
  ]
}

function quickStart() {
  return [
    heading1('🎮  Quick Start Cheat Sheet'),
    codeBlock('1.  Buksan ang app'),
    codeBlock('2.  Login (Username + Password → Log In)'),
    codeBlock('3.  Pumili ng Basketball sa Sport Selector'),
    codeBlock('4.  Gumawa / mag-load ng liga'),
    codeBlock('5.  Pumili ng Home at Away teams → START GAME'),
    codeBlock('6.  Pindutin ang START para simulan ang orasan'),
    codeBlock('7.  I-click ang +2 o +3 sa ibaba para magdagdag ng score'),
    codeBlock('8.  I-click ang player name → piliin ang stat (+REB, +AST, etc.)'),
    codeBlock('9.  BUZZER → NEXT Q → ulit para sa susunod na quarter'),
    codeBlock('10. Pagkatapos ng laro → i-save ang game log'),
    codeBlock('11. Tingnan ang Stats sa HISTORY / SEASON / LEADERS tabs'),
    spacer(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240 },
      children: [
        new TextRun({ text: 'LigaControl — Basketball Scoreboard System', size: 20, color: BRAND_GOLD, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Para sa mga tanong, makipag-ugnayan sa Admin.', size: 18, color: '888888', italics: true })],
    }),
  ]
}

// ─── Build Document ───────────────────────────────────────────────────────────
const doc = new Document({
  sections: [
    {
      properties: {
        page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { color: BRAND_DARK, space: 1, style: BorderStyle.SINGLE, size: 4 } },
              children: [
                new TextRun({ text: 'LigaControl', bold: true, size: 18, color: BRAND_GOLD }),
                new TextRun({ text: '  |  Basketball Scoreboard System — Paano Gamitin', size: 18, color: '888888' }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...makeCoverPage(),
        ...makeTOC(),
        ...sec1(),
        ...sec2(),
        ...sec3(),
        ...sec4(),
        ...sec5(),
        ...sec6(),
        ...sec7(),
        ...sec8(),
        ...sec9(),
        ...sec10(),
        ...sec11(),
        ...sec12(),
        ...sec13(),
        ...sec14(),
        ...sec15(),
        ...sec16(),
        ...sec17(),
        ...quickStart(),
      ],
    },
  ],
})

const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(OUT, buffer)
console.log(`✅  Saved: ${OUT}`)
