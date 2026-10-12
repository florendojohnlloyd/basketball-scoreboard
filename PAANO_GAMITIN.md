# LigaControl — Paano Gamitin (User Guide)

> Para sa mga scorekeeper, game operator, at liga admin.

---

## 📋 Talaan ng Nilalaman

1. [Pagbukas ng App](#1-pagbukas-ng-app)
2. [Login](#2-login)
3. [Pumili ng Liga o Gumawa ng Bago](#3-pumili-ng-liga-o-gumawa-ng-bago)
4. [Mag-manage ng Teams at Roster](#4-mag-manage-ng-teams-at-roster)
5. [Simulan ang Laro](#5-simulan-ang-laro)
6. [Control Panel — Mga Pangunahing Kontrol](#6-control-panel--mga-pangunahing-kontrol)
7. [Score at Stats ng Players](#7-score-at-stats-ng-players)
8. [Game Clock at Shot Clock](#8-game-clock-at-shot-clock)
9. [Timeout](#9-timeout)
10. [Fouls](#10-fouls)
11. [Scoreboard Overlay (Para sa Broadcast/OBS)](#11-scoreboard-overlay-para-sa-broadcastobs)
12. [Mobile Viewer (Para sa Manonood)](#12-mobile-viewer-para-sa-manonood)
13. [Tournament / Bracket](#13-tournament--bracket)
14. [Box Score at Stats](#14-box-score-at-stats)
15. [Backup at Restore](#15-backup-at-restore)
16. [Settings at Iba Pa](#16-settings-at-iba-pa)
17. [Mga Madalas na Tanong (FAQ)](#17-mga-madalas-na-tanong-faq)

---

## 1. Pagbukas ng App

1. I-double-click ang **LigaControl** shortcut sa desktop (o `Basketball Scoreboard Setup.exe` kung hindi pa naka-install).
2. Hintayin ang app na mag-load. Lalabas ang login screen.

> **Tip:** Kailangan ng app ng lokal na network kung gusto mong gamitin ang Mobile Viewer o Overlay. Hindi kailangan ng internet para sa basic scoring.

---

## 2. Login

Dalawang klase ng account:

| Role | Magagawa |
|------|----------|
| **Admin** | Lahat — mag-manage ng users, mag-delete ng liga, mag-access ng settings |
| **Scorekeeper** | Mag-score, mag-manage ng game, tingnan ang stats |

**Paano mag-login:**
1. I-type ang iyong **Username** at **Password**.
2. I-click ang **LOGIN**.
3. Kung mali ang credentials, lalabas ang error message.

> Una pang beses? Makipag-ugnayan sa Admin para makuha ang iyong account. Ang default dev credentials ay nasa `dev/dev acc.txt`.

---

## 3. Pumili ng Liga o Gumawa ng Bago

Pagkatapos mag-login, pumunta ka sa **Liga Picker** screen.

### Gumawa ng Bagong Liga
1. I-type ang pangalan ng liga sa text box (hal. `MCBL 2026`).
2. I-click ang **+ NEW LIGA**.
3. Papasok ka sa **Liga Management** screen para mag-dagdag ng teams.

### Mag-load ng Existing Liga
1. Makikita mo ang listahan ng mga nakaraang liga sa ibaba.
2. I-click ang pangalan ng liga para i-load ito.
3. Mapupunta ka sa **Matchup Picker** para pumili ng laban.

### Trial Mode (Quick Game)
- I-click ang **TRIAL MODE (Quick Game)** para magsimula ng laro nang walang liga.
- Magagamit para sa practice o eksibisyon — hindi nase-save sa game history.

### Mag-delete ng Liga
- I-click ang **✕** na button sa tabi ng liga name.
- Kumpirmahin sa pop-up. **Hindi na mababawi ito.**

---

## 4. Mag-manage ng Teams at Roster

Kapag nasa **Liga Management** screen na:

### Mag-dagdag ng Team
1. I-type ang team name.
2. Pindutin ang **ADD TEAM**.
3. Makikita ang team sa listahan.

### Mag-edit ng Roster
1. I-click ang team name o ang roster button nito.
2. Lalabas ang **Team Roster Modal**.
3. Dito mo maidadagdag ang players kasama ang:
   - **Jersey Number**
   - **Pangalan**
   - **Photo** (optional — i-click ang photo slot para mag-upload)
4. I-click ang **SAVE** pagkatapos.

### Mag-manage ng Staff
- I-click ang **STAFF** button sa liga management para idagdag ang coaches, managers, atbp.

### Schedule Management
- I-click ang **SCHEDULE** button para tingnan o mag-edit ng mga naka-schedule na laban.

---

## 5. Simulan ang Laro

Kapag nag-load ng liga:

1. Makikita mo ang **Matchup Picker** — listahan ng lahat ng teams sa liga.
2. Piliin ang **Home Team** (kaliwa) at **Away Team** (kanan).
3. I-click ang **START GAME**.
4. Mapupunta ka sa **Control Panel**.

---

## 6. Control Panel — Mga Pangunahing Kontrol

Ito ang pangunahing screen ng scoring. Narito ang layout nito:

```
[ HOME TEAM ]  ←  SCORE DISPLAY  →  [ AWAY TEAM ]
              [ PERIOD ] [ CLOCK ]

   [ START ] [ HORN ] [ PAUSE ] [ POSS ] [ SWITCH ] [ REPLAY ] [ SUB ]

[ Home Players ]                              [ Away Players ]
   +PTS  +REB  +AST                             +PTS  +REB  +AST
   +FOUL +STL  +BLK  +TO                        +FOUL +STL  +BLK  +TO

        [ TIMEOUT ] [ TEAM FOULS ] [ UNDO SCORE ] [ RESET ]
```

### Pangunahing Buttons

| Button | Ginagawa |
|--------|----------|
| **START** | Simulan ang game clock |
| **PAUSE** | I-pause ang orasan |
| **HORN** | I-trigger ang buzzer sound |
| **POSS** | I-toggle ang possession arrow (kung sino may hawak ng bola) |
| **SWITCH** | I-switch ang home at away teams (magpapalit ng panig) |
| **REPLAY** | I-trigger ang replay indicator sa scoreboard |
| **SUB** | I-record ang substitution ng player |
| **UNDO SCORE** | I-undo ang pinakabagong score change |
| **RESET** | I-reset ang laro (mag-co-confirm muna) |

---

## 7. Score at Stats ng Players

### Magdagdag ng Puntos
1. Sa **Player List** (kaliwa para Home, kanan para Away), i-click ang pangalan ng player.
2. Lalabas ang stat buttons:
   - **+1, +2, +3** — para sa points
   - **+REB** — rebound
   - **+AST** — assist
   - **+FOUL** — personal foul
   - **+STL** — steal
   - **+BLK** — block
   - **+TO** — turnover
3. I-click ang naaangkop na button.
4. Agad na mag-a-update ang scoreboard.

### Mag-undo ng Score
- I-click ang **UNDO SCORE** button sa ibaba ng control panel.
- Ibabalik ang huling score change.

> Ang lahat ng score events ay nilo-log sa game history para sa audit at box score.

---

## 8. Game Clock at Shot Clock

### Game Clock
- **START** — simulan ang orasan
- **PAUSE** — ihinto muna
- Makikita ang oras sa malaking display sa itaas ng screen

### Shot Clock
- Hiwalay na kontrol sa **Shot Clock Control** panel.
- I-click ang **RESET** para i-reset sa 24 seconds (o sa configured na oras).
- Awtomatikong hihinto kapag na-pause ang game clock.

### Mag-set ng Oras Manually
- Mag-click sa clock display para i-edit ang oras direkta.
- Mag-type ng bagong oras at pindutin ang Enter.

---

## 9. Timeout

### Mag-call ng Timeout
1. I-click ang **TIMEOUT** button para sa Home o Away team.
2. Awtomatikong hihinto ang orasan.
3. Bababawasan ang timeout counter ng team.

### Timeout Settings
- Pumunta sa **Settings** tab para i-configure ang:
  - Bilang ng timeouts per period
  - Timeout duration (seconds)

---

## 10. Fouls

- Ang **Team Fouls** counter ay awtomatikong nag-a-update tuwing may +FOUL na nire-record.
- Kapag umabot sa **team foul limit** (default: 5 fouls), lalabas ang visual indicator para sa bonus/double-bonus.
- Ang foul counter ay nire-reset sa simula ng bawat period.

---

## 11. Scoreboard Overlay (Para sa Broadcast/OBS)

Ang overlay ay isang browser page na pwedeng i-add bilang **Browser Source** sa OBS o kahit anong streaming software.

### Paano gamitin:
1. Pumunta sa **Settings** tab sa control panel.
2. Hanapin ang **Overlay Server** section.
3. I-click ang **START OVERLAY SERVER**.
4. Makikita mo ang URL (default: `http://localhost:8080`).
5. Sa OBS:
   - Mag-add ng **Browser Source**.
   - I-paste ang URL.
   - I-set ang width/height (recommended: 1920×1080).
6. Mag-a-auto-update ang overlay sa tuwing may score change.

> **Port:** 8080 ang default. Siguraduhing hindi ito ginagamit ng ibang app.

---

## 12. Mobile Viewer (Para sa Manonood)

Pwedeng tingnan ng mga manonood ang live score sa kanilang phone/tablet sa lokal na network.

### Paano i-setup:
1. Pumunta sa **Mobile Viewer** section ng settings.
2. I-click ang **START MOBILE VIEWER**.
3. Lalabas ang **QR Code** at URL (default: `http://[ip-address]:8081`).
4. Ipakita ang QR code sa mga manonood para i-scan gamit ang camera ng kanilang phone.
5. Makikita nila ang live scoreboard sa kanilang browser — awtomatikong nag-re-refresh.

> Kailangan ng parehong Wi-Fi network ang devices para gumagana ito.

---

## 13. Tournament / Bracket

### Paano mag-setup ng Tournament:
1. I-click ang **TOURNAMENT** tab sa control panel.
2. Pumili ng format:
   - **Single Elimination** — kalaban agad pag natalo
   - **Double Elimination** — isa pang chance pagkatapos ng unang talo
   - **Round Robin** — lahat laban sa lahat
3. I-assign ang teams sa bracket.
4. I-click ang match para simulan ito at i-load sa control panel.

### Bracket Viewer
- Makikita ang bracket diagram na real-time nag-a-update habang tumatakbo ang tournament.

---

## 14. Box Score at Stats

### Box Score
- I-click ang **BOX SCORE** tab para makita ang per-player, per-period stats.
- Pwedeng i-export bilang Excel o PDF.

### Season Stats / Leaderboards
- **SEASON** tab — cumulative stats ng mga player sa buong liga.
- **LEADERS** tab — top scorers, rebounders, assists leaders ng liga.

### Game History
- **HISTORY** tab — listahan ng lahat ng nakaraang laro sa liga.
- I-click ang isang game para makita ang detalye nito.

---

## 15. Backup at Restore

### Mag-backup:
1. Pumunta sa **Settings** → **Backup** section.
2. I-click ang **CREATE BACKUP**.
3. Gagawa ito ng `.zip` file na may lahat ng liga data, game logs, at settings.
4. Piliin ang folder kung saan ise-save.

### Mag-restore:
1. I-click ang **RESTORE FROM BACKUP**.
2. Pumili ng `.zip` backup file.
3. Kumpirmahin — **papalitan nito ang kasalukuyang data**.

> Presko mag-backup bago mag-major tournament para hindi mawala ang data.

---

## 16. Settings at Iba Pa

Makikita ang Settings sa pamamagitan ng **SETTINGS** tab o button.

| Setting | Paliwanag |
|---------|-----------|
| **Sport Type** | Pumili ng sport (Basketball, etc.) |
| **Period Configuration** | Bilang ng periods, duration |
| **Shot Clock** | I-set ang shot clock duration (24s, 14s, etc.) |
| **Overtime** | I-configure ang OT rules |
| **Team Fouls Limit** | Kung ilang fouls bago mag-bonus |
| **Audio / Volume** | Volume ng buzzer at sounds |
| **REST API** | I-enable/disable ang API para sa third-party integrations (Port 3000) |
| **User Management** | (Admin only) Mag-add/edit ng accounts |
| **Audit Log** | Tingnan ang history ng lahat ng actions |
| **Cloud Sync** | I-sync ang data sa cloud (kailangan ng OAuth login) |
| **Language** | Piliin ang display language |

---

## 17. Mga Madalas na Tanong (FAQ)

**Q: Hindi nag-o-open ang app.**
> A: I-check kung naka-install ang app properly. Subukan i-run bilang Administrator. Tingnan kung may error message sa terminal.

**Q: Mali ang score, paano i-undo?**
> A: I-click ang **UNDO SCORE** button sa ibaba ng control panel. Ise-undo ang pinakabagong score event.

**Q: Hindi gumagana ang Overlay sa OBS.**
> A: Siguraduhing naka-start ang Overlay Server (Port 8080). I-check ang URL sa browser muna bago i-add sa OBS. Tignan kung may firewall na nag-i-block.

**Q: Hindi makita ng phones ang Mobile Viewer.**
> A: Kailangan ng parehong Wi-Fi network. I-check ang IP address ng computer at subukan i-type manually sa browser ng phone (hal. `http://192.168.1.100:8081`).

**Q: Nakalimutan ang password.**
> A: Ang Admin lang ang pwede mag-reset ng passwords sa User Management panel.

**Q: Nawala ang data pagkatapos ng restart.**
> A: Kung Trial Mode ang ginamit, hindi nase-save ang games. Para manatili ang data, kailangan ng liga. Gumawa ng liga at gamitin ang ligacontrol flow.

**Q: Lumalabas ang "Port already in use" error.**
> A: May ibang app na gumagamit ng port 3000, 8080, o 8081. I-close ang mga ito o i-change ang port sa Settings.

**Q: Gusto ko i-stream sa Facebook/YouTube.**
> A: Kailangan ng **FFmpeg** para sa RTMP streaming. I-install ito at i-configure ang RTMP URL sa Live Streaming panel ng Settings. Tingnan ang README para sa detalye ng FFmpeg installation.

---

## 🎮 Quick Start Cheat Sheet

```
1. Buksan ang app
2. Login
3. Gumawa / mag-load ng liga
4. Pumili ng Home at Away teams
5. Pindutin ang START GAME
6. Pindutin ang START para simulan ang orasan
7. I-click ang player → piliin ang stat (+2, +3, +REB, atbp.)
8. PAUSE → HORN → end of period → next period
9. Pagkatapos ng laro → i-save ang game log
10. Tingnan ang Box Score at Stats sa mga tabs
```

---

*LigaControl — Basketball Scoreboard System | Para sa mga tanong, makipag-ugnayan sa Admin.*
