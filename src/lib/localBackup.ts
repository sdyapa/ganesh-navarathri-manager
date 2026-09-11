// File System Access API helpers for the "pick a folder, back up into it silently" local backup
// destination — desktop Chrome/Edge only (see isDirectoryPickerSupported). Every function here
// degrades to returning false/null rather than throwing, since a failed silent backup should
// never surface as an error the user has to deal with — see services/localBackupService.ts,
// which falls back to a plain Downloads-folder save whenever any of these fail.

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** Verifies (and if needed, re-requests) read-write permission on a previously granted handle.
 *  A browser can silently downgrade a handle's permission (e.g. after restarting) — attempting
 *  to write without checking first would throw instead of giving a chance to re-prompt. */
async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const existing = await handle.queryPermission({ mode: 'readwrite' })
    if (existing === 'granted') return true
    const requested = await handle.requestPermission({ mode: 'readwrite' })
    return requested === 'granted'
  } catch {
    return false
  }
}

/** Writes `content` as `filename` into `handle`. Never throws — permission revoked, the folder
 *  moved/deleted since it was picked, disk full, etc. all just return false. */
export async function writeBackupToDirectory(
  handle: FileSystemDirectoryHandle,
  filename: string,
  content: string,
): Promise<boolean> {
  try {
    if (!(await ensureWritePermission(handle))) return false
    const fileHandle = await handle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
    return true
  } catch {
    return false
  }
}

/** Opens the native folder picker and confirms write permission on the chosen folder. Returns
 *  the handle (for the caller to persist — this file stays free of db/ imports, matching the
 *  rest of lib/) and its display name, or null if the user cancelled, the browser doesn't
 *  support it, or permission was refused. */
export async function pickLocalBackupDirectory(): Promise<{ handle: FileSystemDirectoryHandle; name: string } | null> {
  if (!isDirectoryPickerSupported()) return null
  try {
    const handle = await window.showDirectoryPicker!({ id: 'gnm-local-backup', mode: 'readwrite' })
    const granted = await ensureWritePermission(handle)
    if (!granted) return null
    return { handle, name: handle.name }
  } catch {
    // Includes the user dismissing the picker (AbortError) — not an error worth surfacing.
    return null
  }
}
