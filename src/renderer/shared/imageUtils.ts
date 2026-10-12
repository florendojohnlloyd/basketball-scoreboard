/**
 * imageUtils.ts — Utility functions for handling image paths, protocols, and file reading.
 */

/**
 * Returns a valid URL string for rendering in HTML <img> src attributes.
 * Supports Data URLs, http/https, blob, local-file protocol, and fallback raw file paths.
 */
export function getImageUrl(path: string | null | undefined): string {
  if (!path || typeof path !== 'string' || path.trim() === '') {
    return ''
  }

  const trimmed = path.trim()

  // Already a valid browser URL or Data URI
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed
  }

  // Already has local-file:// or file:// protocol
  if (trimmed.startsWith('local-file:///')) {
    return trimmed
  }

  // Clean leading file:/// or file://
  const cleanPath = trimmed.replace(/^(file:\/\/\/?|local-file:\/\/\/?)/, '')
  return `local-file:///${cleanPath.replace(/\\/g, '/')}`
}

/**
 * Asynchronously reads a browser File object as a base64 Data URL.
 * Guarantees compatibility across Electron contexts, standard web, and remote views.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to convert file to data URL.'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('File reading error.'))
    reader.readAsDataURL(file)
  })
}
