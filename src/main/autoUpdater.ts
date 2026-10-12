/**
 * Auto-Updater Module
 * 
 * Handles automatic updates from GitHub Releases.
 * Checks for new versions on app startup and shows notification to users.
 */

import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, dialog } from 'electron'
import log from 'electron-log'

// Configure logging
log.transports.file.level = 'info'
autoUpdater.logger = log

// Disable auto-download - we want to ask the user first
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let mainWindow: BrowserWindow | null = null

/**
 * Initialize the auto-updater
 * Call this after the app is ready and main window is created
 */
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  // Check for updates when app starts
  if (!app.isPackaged) {
    log.info('Auto-updater disabled in development mode')
    return
  }

  // Check for updates 5 seconds after app starts
  setTimeout(() => {
    checkForUpdates()
  }, 5000)

  // Setup event listeners
  setupEventListeners()
}

/**
 * Manually trigger update check
 */
export function checkForUpdates(): void {
  if (!app.isPackaged) {
    log.info('Cannot check for updates in development mode')
    return
  }

  log.info('Checking for updates...')
  autoUpdater.checkForUpdates().catch((error) => {
    log.error('Error checking for updates:', error)
  })
}

/**
 * Setup event listeners for auto-updater
 */
function setupEventListeners(): void {
  // When update is available
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version)
    
    if (!mainWindow) return

    // Show dialog to user
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail: `Current version: ${app.getVersion()}\nNew version: ${info.version}\n\nWould you like to download and install it now?`,
      buttons: ['Download & Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then((result) => {
      if (result.response === 0) {
        // User clicked "Download & Install"
        autoUpdater.downloadUpdate()
        
        // Show downloading message
        if (mainWindow) {
          mainWindow.webContents.send('update-status', { 
            status: 'downloading',
            message: 'Downloading update...'
          })
        }
      }
    })
  })

  // When no update is available
  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available. Current version is the latest:', info.version)
  })

  // Download progress
  autoUpdater.on('download-progress', (progressInfo) => {
    const message = `Downloaded ${Math.round(progressInfo.percent)}%`
    log.info(message)
    
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        status: 'downloading',
        message,
        percent: Math.round(progressInfo.percent)
      })
    }
  })

  // Download completed
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version)
    
    if (!mainWindow) return

    // Show dialog to restart
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded successfully!',
      detail: `Version ${info.version} has been downloaded and is ready to install.\n\nThe app will restart to complete the installation.`,
      buttons: ['Restart Now', 'Restart Later'],
      defaultId: 0,
      cancelId: 1,
    }).then((result) => {
      if (result.response === 0) {
        // User clicked "Restart Now"
        setImmediate(() => autoUpdater.quitAndInstall())
      }
    })
  })

  // Error handling
  autoUpdater.on('error', (error) => {
    log.error('Auto-updater error:', error)
    
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        status: 'error',
        message: 'Update check failed. Please try again later.'
      })
    }
  })
}
