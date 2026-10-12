# Basketball Scoreboard - Auto-Update System Guide

## 🎯 Overview

Ang Basketball Scoreboard app ay may built-in auto-update system. Kapag nag-release ka ng bagong version sa GitHub, automatic na makikita ito ng users at pwede nilang i-download at i-install with just a few clicks.

---

## 📋 Prerequisites

### 1. GitHub Repository Setup

Kailangan mo ng GitHub repository para sa project:

**Repository URL:** `https://github.com/florendojohnlloyd/basketball-scoreboard`

#### Steps to Create Repository:

1. **Go to GitHub:** https://github.com/new
2. **Repository name:** `basketball-scoreboard`
3. **Description:** "Basketball Scoreboard System with Automatic Updates"
4. **Visibility:** Choose **Public** or **Private** (both work)
5. **Click:** "Create repository"

### 2. Upload Your Code to GitHub

```bash
# Sa terminal, sa project folder:
cd "c:\Users\flore\OneDrive\Desktop\System\abe system\Scoreboard App\Scoreboard App"

# Initialize git (kung wala pa)
git init

# Add GitHub remote
git remote add origin https://github.com/florendojohnlloyd/basketball-scoreboard.git

# Add all files
git add .

# Commit
git commit -m "Initial commit - Basketball Scoreboard v1.0.0"

# Push to GitHub
git push -u origin main
```

---

## 🚀 How to Release a New Version

### Step 1: Update Version Number

Edit `package.json`:
```json
{
  "name": "liga-control",
  "version": "1.1.0",  // ← Change this (was 1.0.0)
  ...
}
```

### Step 2: Build the EXE

```bash
npm run build:win
```

Ang EXE file ay makikita sa: `dist/Basketball Scoreboard Setup 1.1.0.exe`

### Step 3: Create GitHub Release

#### Option A: Via GitHub Website (Easiest)

1. **Go to:** https://github.com/florendojohnlloyd/basketball-scoreboard/releases
2. **Click:** "Create a new release"
3. **Tag version:** `v1.1.0` (IMPORTANT: Start with "v")
4. **Release title:** `Version 1.1.0`
5. **Description:** Write what's new:
   ```
   ## What's New in v1.1.0
   
   - Fixed volleyball timeout display
   - Enlarged basketball team names
   - Improved UI responsiveness
   - Bug fixes and performance improvements
   ```
6. **Upload file:** Drag `Basketball Scoreboard Setup 1.1.0.exe` to the upload area
7. **Click:** "Publish release"

#### Option B: Via Command Line (Advanced)

```bash
# Install GitHub CLI (one-time only)
# Download from: https://cli.github.com/

# Login to GitHub
gh auth login

# Create release
gh release create v1.1.0 \
  --title "Version 1.1.0" \
  --notes "Bug fixes and improvements" \
  "dist/Basketball Scoreboard Setup 1.1.0.exe"
```

---

## 👥 User Experience

### When User Opens the App:

1. **App starts normally**
2. **After 5 seconds**, app checks GitHub for updates
3. **If new version found:**

```
┌─────────────────────────────────────┐
│  ℹ️ Update Available                │
│                                     │
│  A new version (1.1.0) is          │
│  available!                         │
│                                     │
│  Current version: 1.0.0             │
│  New version: 1.1.0                 │
│                                     │
│  Would you like to download and     │
│  install it now?                    │
│                                     │
│  [Download & Install]  [Later]      │
└─────────────────────────────────────┘
```

4. **User clicks "Download & Install"**
   - Progress bar shows download status
   - Download happens in background

5. **When download completes:**

```
┌─────────────────────────────────────┐
│  ℹ️ Update Ready                    │
│                                     │
│  Update downloaded successfully!    │
│                                     │
│  Version 1.1.0 has been            │
│  downloaded and is ready to         │
│  install.                           │
│                                     │
│  The app will restart to complete   │
│  the installation.                  │
│                                     │
│  [Restart Now]  [Restart Later]     │
└─────────────────────────────────────┘
```

6. **User clicks "Restart Now"**
   - App closes
   - Installer runs automatically
   - App opens with new version

---

## 🔧 Version Numbering Guide

Use **Semantic Versioning** (MAJOR.MINOR.PATCH):

- **MAJOR** (1.x.x): Breaking changes, major features
  - Example: `1.0.0` → `2.0.0`
  
- **MINOR** (x.1.x): New features, non-breaking changes
  - Example: `1.0.0` → `1.1.0`
  
- **PATCH** (x.x.1): Bug fixes, small improvements
  - Example: `1.0.0` → `1.0.1`

### Examples:

```
1.0.0  → Initial release
1.0.1  → Bug fix (timeout display)
1.1.0  → New feature (auto-updates)
1.1.1  → Bug fix (team name sizing)
2.0.0  → Major rewrite (new UI)
```

---

## 📊 Monitoring Updates

### Check Download Statistics

1. Go to: https://github.com/florendojohnlloyd/basketball-scoreboard/releases
2. Each release shows:
   - Total downloads
   - Download count per file
   - Release date

### View Update Log

Check `%APPDATA%/Basketball Scoreboard/logs/main.log` for update activity:

```
[2026-10-07 19:00:00] Checking for updates...
[2026-10-07 19:00:02] Update available: 1.1.0
[2026-10-07 19:00:05] Downloading update...
[2026-10-07 19:00:30] Update downloaded: 1.1.0
```

---

## 🐛 Troubleshooting

### Users Not Seeing Update Notification

**Check:**
1. ✅ Is the user using a packaged build (not `npm run dev`)?
2. ✅ Is there internet connection?
3. ✅ Is the GitHub release published (not draft)?
4. ✅ Does the release tag start with "v"? (e.g., `v1.1.0`)

### Update Download Fails

**Solutions:**
- Check internet connection
- Make sure EXE file is attached to GitHub release
- Try again later (GitHub may be temporarily down)

### App Shows "Update Available" But User Already Updated

**Cause:** Version number in `package.json` doesn't match GitHub release tag

**Fix:** Ensure version numbers match:
- `package.json`: `"version": "1.1.0"`
- GitHub tag: `v1.1.0`

---

## 🎓 Quick Reference

### Release Checklist

- [ ] Update version in `package.json`
- [ ] Build EXE: `npm run build:win`
- [ ] Create GitHub release with tag `v{version}`
- [ ] Upload EXE file to release
- [ ] Write release notes
- [ ] Publish release
- [ ] Test: Open old version and check for update notification

### Important URLs

- **Repository:** https://github.com/florendojohnlloyd/basketball-scoreboard
- **Releases:** https://github.com/florendojohnlloyd/basketball-scoreboard/releases
- **Create Release:** https://github.com/florendojohnlloyd/basketball-scoreboard/releases/new

---

## 📞 Support

For questions or issues with the auto-update system:
1. Check this guide
2. Review logs in `%APPDATA%/Basketball Scoreboard/logs/`
3. Open issue on GitHub

---

**Happy Updating! 🚀**
