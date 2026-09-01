# LigaControl - Basketball Scoreboard System

A modern desktop application for managing basketball scoreboards, games, and team statistics. Built with Electron, React, and TypeScript.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Scripts](#scripts)
- [Testing](#testing)
- [Building & Packaging](#building--packaging)
- [Project Architecture](#project-architecture)
- [Contributing](#contributing)

## 🎯 Overview

LigaControl is a comprehensive basketball scoreboard management system designed to provide real-time game management, team roster management, analytics, and broadcast-ready overlays. The application consists of:

- **Control Panel**: Main application for managing games, teams, and statistics
- **Scoreboard**: Display-only overlay application for broadcasting scores
- **Backend Services**: Express API server with database management

## ✨ Features

- **Game Management**: Create, manage, and track basketball games in real-time
- **Team & Roster Management**: Manage teams, players, and staff with photos
- **Live Scoring**: Update scores, fouls, and game statistics in real-time
- **Bracket System**: Support for tournament brackets with multiple formats
- **Analytics**: Track player performance and advanced metrics
- **Overlay Broadcasting**: Generate broadcast-ready scoreboard overlays
- **Backup & Sync**: Offline sync and backup management
- **Export**: Export game data, statistics, and reports
- **QR Codes & Media**: Generate QR codes and handle media files
- **Audit Logging**: Complete audit trail of all actions

### Extended Features (Tasks 40–90)

- **Role-Based Access Control (RBAC)**: Admin / Scorekeeper accounts with bcrypt-hashed credentials and per-action authorization
- **REST API**: Read live game state over HTTP with API-key authentication and rate limiting (Swagger docs included)
- **Mobile Viewer**: Serve a live, auto-refreshing scoreboard page to phones/tablets on the local network via QR code
- **OBS Browser-Source Overlay**: HTTP + WebSocket overlay page for broadcast, with optional RTMP streaming (screen capture pushed to a streaming endpoint via ffmpeg)
- **Backup & Restore**: One-click `.zip` backups (with `manifest.json`) and full restore
- **Cloud & Offline Sync**: Queue changes offline and replay once connectivity returns; OAuth-based cloud sync
- **Box Scores & Analytics**: Per-period box scores, attendance tracking, and advanced metrics
- **Audit Log Viewer**: Browse a searchable trail of every scoring and configuration action

### Required Ports

The extended services bind to the following local ports. Ensure they are free (or reconfigure in the app settings):

| Service        | Default Port | Notes                                              |
|----------------|--------------|----------------------------------------------------|
| REST API       | `3000`       | Configurable (1024–65535); disabled by default     |
| Overlay Server | `8080`       | HTTP + WebSocket browser source for OBS            |
| Mobile Viewer  | `8081`       | HTTP + WebSocket live scoreboard for phones/tablets|

### OAuth URL Scheme Registration

Cloud sync uses an OAuth callback delivered through a custom URL scheme, `ligacontrol://`.
The app registers itself as the default handler for this scheme at startup
(`app.setAsDefaultProtocolClient('ligacontrol')`).

- **Windows / Linux**: the callback arrives as a command-line argument on a second
  launch and is forwarded to the running instance via the `second-instance` event.
- **macOS**: the callback is delivered through the `open-url` event.

Because scheme registration relies on the installed application, OAuth callbacks work
reliably only in a packaged/installed build. In development the scheme may not be
registered with the OS.

### FFmpeg Requirement (RTMP Streaming)

The RTMP streaming feature (pushing the overlay/screen capture to a streaming service)
requires an `ffmpeg` executable. The app locates ffmpeg in this order:

1. The `FFMPEG_PATH` environment variable, if set.
2. A binary bundled with the installed app at `resources/ffmpeg/ffmpeg.exe`
   (packaged automatically when present via `extraResources`).
3. An `ffmpeg` executable found on the system `PATH`.

**Installing ffmpeg (Windows):**

- Download a static build from [ffmpeg.org](https://ffmpeg.org/download.html) (or install
  via a package manager such as `winget install Gyan.FFmpeg` or `choco install ffmpeg`).
- Ensure `ffmpeg.exe` is on your `PATH`, or set `FFMPEG_PATH` to its full path, or drop it
  into the app's `resources/ffmpeg/` folder before packaging.

ffmpeg is only needed for RTMP streaming. All other features work without it.

## 🛠 Tech Stack

### Core
- **Electron** 30.x - Desktop application framework
- **Vite** 5.x - Build tool and development server
- **React** 18.x - UI framework
- **TypeScript** 5.x - Type-safe JavaScript

### Database & Storage
- **Better-sqlite3** - High-performance SQL database
- **Zustand** - State management
- **Electron-store** - Persistent configuration storage

### Backend Services
- **Express** 5.x - API server
- **WebSocket** - Real-time communication
- **Swagger-UI** - API documentation

### Utilities & Libraries
- **ExcelJS** - Excel file generation
- **jsPDF** - PDF generation
- **QRCode** - QR code generation
- **Fluent-FFmpeg** - Video processing
- **Archiver** - File compression and backup
- **Bcrypt** - Password hashing
- **UUID** - Unique ID generation

### Testing & Development
- **Vitest** - Unit and integration testing
- **Playwright** - E2E testing
- **React Testing Library** - Component testing
- **Fast-check** - Property-based testing

## 📁 Project Structure

```
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts          # Application entry point
│   │   ├── windowManager.ts  # Window creation and management
│   │   ├── ipcRouter.ts      # IPC message routing
│   │   ├── gameStore.ts      # Game state management
│   │   ├── ligaStore.ts      # Liga/League management
│   │   ├── overlayServer.ts  # WebSocket overlay server
│   │   ├── analytics.ts      # Analytics tracking
│   │   ├── backupService.ts  # Backup and restore
│   │   ├── exportService.ts  # Data export functionality
│   │   ├── bracketEngine.ts  # Tournament bracket logic
│   │   ├── clockEngine.ts    # Game clock management
│   │   └── __tests__/        # Main process unit tests
│   │
│   ├── preload/              # Electron preload script
│   │   └── index.ts         # Safe IPC bridge
│   │
│   ├── renderer/             # React frontend applications
│   │   ├── controlPanel/    # Main control application
│   │   │   ├── App.tsx
│   │   │   ├── components/  # React components
│   │   │   └── __tests__/   # Component tests
│   │   │
│   │   ├── scoreboard/      # Overlay display application
│   │   │   ├── App.tsx
│   │   │   └── components/
│   │   │
│   │   └── shared/          # Shared utilities and types
│   │       ├── types.ts     # TypeScript type definitions
│   │       ├── validation.ts
│   │       └── clockUtils.ts
│   │
│   └── shared/              # Shared code (main and renderer)
│       └── types.ts         # Shared type definitions
│
├── e2e/                      # End-to-end tests
│   └── scoreboard.spec.ts
│
├── assets/                   # Application assets
│   ├── audio/              # Audio files
│   ├── icon.ico            # Application icon
│   └── ...
│
├── resources/              # Static resources
│   └── overlay/           # Overlay HTML resources
│
├── electron.vite.config.ts # Electron Vite configuration
├── tsconfig.json          # TypeScript configuration
├── vitest.config.ts       # Vitest configuration
├── playwright.config.ts   # Playwright configuration
└── package.json          # Project dependencies

```

## 📦 Prerequisites

### Development Setup
- **Node.js** 18+ (LTS recommended)
- **npm** 9+ or **yarn** 4+
- **Python** 3.x (required for building native modules like better-sqlite3)
- **Visual C++ Build Tools** (Windows) or Xcode Command Line Tools (macOS)
- **FFmpeg** (optional) — only required for RTMP streaming; see [FFmpeg Requirement](#ffmpeg-requirement-rtmp-streaming)

> **Native modules**: `better-sqlite3` (and `bcrypt`) ship as native modules and are
> rebuilt against the bundled Electron version automatically by the `postinstall` script
> (`electron-builder install-app-deps`, which runs `@electron/rebuild`). If you switch
> Electron versions, re-run `npm install` (or `npm run rebuild` /
> `npx electron-rebuild -f -w better-sqlite3`) to rebuild the binding. Building native
> modules requires **Python 3.x** and platform C/C++ build tools to be installed.

### Runtime System Requirements (To Run the Application)

**Minimum Specs:**
- **OS**: Windows 10 or later (64-bit)
- **CPU**: Intel Core i3 / AMD Ryzen 3 (dual-core @ 1.8GHz minimum)
- **RAM**: 4 GB
- **Storage**: 500 MB - 1 GB free disk space
- **Display**: 1024x768 minimum (1920x1080 recommended for scoreboard display)
- **Network**: Stable internet connection for overlay sync (optional for offline mode)

**Recommended Specs:**
- **OS**: Windows 10/11 (64-bit)
- **CPU**: Intel Core i5 / AMD Ryzen 5 or better
- **RAM**: 8 GB or more
- **Storage**: SSD with 1+ GB free space
- **Display**: 1920x1080 or higher (dual-monitor setup recommended for control panel + scoreboard)
- **GPU**: Intel UHD / NVIDIA GTX 1050 or equivalent (for smooth overlay rendering)

## 🚀 Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd "Scoreboard App"
```

### 2. Install dependencies

```bash
npm install
```

This will install all project dependencies including Electron, development tools, and production libraries.

### 3. Verify installation

```bash
npm run dev
```

This should start the development server and open the Control Panel application.

## 💻 Development

### Start development server

```bash
npm run dev
```

This launches:
- Electron main process with hot reload
- React development server for control panel
- React development server for scoreboard

### Development workflow

1. **Edit source files** in `src/` - Changes trigger hot reload
2. **Console output** appears in terminal and DevTools
3. **Test changes** using the control panel or scoreboard overlay
4. **Check tests** with `npm run test:watch`

### Available development commands

```bash
npm run dev           # Start development with hot reload
npm run preview       # Preview production build
npm run build         # Build for production
```

## 📜 Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build application for production |
| `npm run preview` | Preview production build locally |
| `npm run test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build:win` | Build for Windows |
| `npm run package` | Package as Windows installer (NSIS) |
| `npm run package:dir` | Create package directory without installer |
| `npm run rebuild` | Rebuild `better-sqlite3` native binding for the current Electron version |

## 🧪 Testing

### Run all tests

```bash
npm run test
```

### Run tests in watch mode

```bash
npm run test:watch
```

### Test structure

Tests are organized alongside source files:
- **Unit tests**: `*.test.ts` for logic and services
- **Component tests**: `*.test.tsx` for React components
- **Integration tests**: `*.integration.test.ts` for feature flows
- **E2E tests**: `/e2e/` for full application scenarios

### Key test files

- `src/main/__tests__/gameStore.test.ts` - Game state management
- `src/main/__tests__/bracketEngine.test.ts` - Tournament bracket logic
- `src/main/__tests__/clockEngine.test.ts` - Game clock functionality
- `e2e/scoreboard.spec.ts` - End-to-end application tests

## 🔨 Building & Packaging

### Build for development

```bash
npm run build
```

Output: `out/` directory with compiled code

### Build and create Windows installer

```bash
npm run build:win
```

Output: `dist/` directory with NSIS installer

### Create portable package

```bash
npm run package:dir
```

This creates an unpacked application directory without building an installer.

### Build output

- **Main process**: `out/main/index.js`
- **Renderer bundles**: `out/renderer/controlPanel/`, `out/renderer/scoreboard/`
- **Installer**: `dist/Basketball Scoreboard Setup.exe`

## 🏗 Project Architecture

### Main Process (Electron)

The main process handles:
- **Window Management** (`windowManager.ts`) - Creation and lifecycle of control panel and scoreboard windows
- **IPC Routing** (`ipcRouter.ts`) - Communication between main and renderer processes
- **Game State** (`gameStore.ts`) - Central game data management
- **Liga Management** (`ligaStore.ts`) - League/tournament data
- **Overlay Server** (`overlayServer.ts`) - WebSocket server for real-time overlay updates
- **Services**:
  - `backupService.ts` - Data backup and restore
  - `exportService.ts` - Export to Excel/PDF/etc
  - `bracketEngine.ts` - Tournament bracket algorithms
  - `clockEngine.ts` - Game timer management
  - `offlineSyncService.ts` - Offline synchronization
  - `analytics.ts` - Analytics tracking

### Renderer Process (React)

**Control Panel** (`src/renderer/controlPanel/`):
- Main UI for managing games and teams
- Admin dashboard
- Team/player management
- Real-time score updates
- Analytics and reporting

**Scoreboard** (`src/renderer/scoreboard/`):
- Display-only broadcast interface
- Real-time score visualization
- Customizable overlays
- TV layout management

### Shared Code

- **Types** (`src/shared/types.ts`) - TypeScript interfaces and type definitions
- **Utils** (`src/renderer/shared/`) - Shared utilities like clock formatting

## 🔐 Security

- **Preload Script**: Safe IPC bridge between main and renderer processes
- **RBAC**: Role-based access control via `roleStore.ts`
- **Password Hashing**: Bcrypt for secure password storage
- **Audit Trail**: Complete audit logging of all actions (`auditStore.ts`)

## 📝 Configuration

### Application Configuration

Persistent configuration stored via Electron-store:
- User preferences
- Window positions and sizes
- League/team data

### Database

SQLite database managed by better-sqlite3:
- Game records
- Player statistics
- Audit logs
- Cached data

### Environment

Configuration via config files:
- `tsconfig.json` - TypeScript compilation
- `electron.vite.config.ts` - Build configuration
- `vitest.config.ts` - Test configuration

## 🐛 Troubleshooting

### Common Issues

**Issue**: Module not found errors
- **Solution**: Run `npm install` and delete `node_modules/` then reinstall

**Issue**: Native module compilation fails (better-sqlite3)
- **Solution**: Ensure Python and C++ build tools are installed
- Windows: Install Visual C++ Build Tools
- macOS: Install Xcode Command Line Tools
- Rebuild the binding for the current Electron version: `npm run rebuild` (or `npx electron-rebuild -f -w better-sqlite3`)

**Issue**: `better-sqlite3` fails to load in the packaged app (`NODE_MODULE_VERSION` mismatch)
- **Solution**: The native binding must match the packaged Electron's ABI. The `postinstall`
  script (`electron-builder install-app-deps`) rebuilds it automatically; if you see this
  after packaging, re-run `npm install` and rebuild before `npm run build:win`. The module
  is unpacked from the asar archive via the `asarUnpack` build setting so the `.node` binary
  is loadable at runtime.

**Issue**: RTMP streaming fails to start (`Cannot find ffmpeg`)
- **Solution**: Install ffmpeg and ensure it is on your `PATH`, set `FFMPEG_PATH`, or place
  `ffmpeg.exe` in `resources/ffmpeg/`. See [FFmpeg Requirement](#ffmpeg-requirement-rtmp-streaming).

**Issue**: Port already in use (overlay server)
- **Solution**: Check for other running instances or change port in config

**Issue**: DevTools not opening
- **Solution**: Ensure development dependencies are installed: `npm install`

## 📚 Further Reading

- [Electron Documentation](https://www.electronjs.org/docs)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)

## 📄 License

UNLICENSED - All rights reserved

## 👥 Support

For issues, feature requests, or questions, please contact the LigaControl team.

---

**Last Updated**: 2026-08-27
