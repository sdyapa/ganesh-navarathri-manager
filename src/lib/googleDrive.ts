// Google Drive backup/restore using Google Identity Services (GIS) for browser-only OAuth —
// no server, no client secret, safe for a static GitHub Pages app. Uses the narrow
// `drive.file` scope, which only ever grants access to files this app itself created —
// never the user's whole Drive. `userinfo.email` is added alongside it purely so the app can
// display which Google account is connected — useful on a shared committee device where more
// than one person's Google account might get used — and grants no extra Drive access.
//
// The app fails gracefully (see isGoogleDriveConfigured) whenever VITE_GOOGLE_CLIENT_ID is
// unset, which is the default until the user follows the README's Google Cloud setup guide.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email'
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const APP_FOLDER_NAME = 'Ganesh Navarathri Manager Backups'

export function isGoogleDriveConfigured(): boolean {
  return typeof CLIENT_ID === 'string' && CLIENT_ID.trim().length > 0
}

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (resp: { access_token?: string; error?: string }) => void
          }) => TokenClient
          revoke: (token: string, done: () => void) => void
        }
      }
    }
  }
}

let scriptLoadPromise: Promise<void> | null = null

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptLoadPromise) return scriptLoadPromise
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Google Sign-In. Check your internet connection.'))
    document.head.appendChild(script)
  })
  return scriptLoadPromise
}

let cachedToken: { token: string; expiresAt: number } | null = null
let connectedEmail: string | undefined

async function fetchConnectedEmail(token: string): Promise<string | undefined> {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) return undefined
    const data = (await resp.json()) as { email?: string }
    return data.email
  } catch {
    // Non-fatal — the connection still works for backup/restore even if we can't show whose
    // account it is (e.g. offline right at this instant, or the userinfo endpoint hiccups).
    return undefined
  }
}

export async function connectGoogleDrive(): Promise<string> {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google Drive is not configured for this deployment. See Settings › Google Drive for setup instructions.')
  }
  await loadGisScript()
  const token = await new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID!,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error('Google sign-in was cancelled or failed.'))
          return
        }
        cachedToken = { token: resp.access_token, expiresAt: Date.now() + 55 * 60 * 1000 }
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken({ prompt: 'consent' })
  })
  connectedEmail = await fetchConnectedEmail(token)
  return token
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token
  return connectGoogleDrive()
}

export function disconnectGoogleDrive(): void {
  if (cachedToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(cachedToken.token, () => undefined)
  }
  cachedToken = null
  connectedEmail = undefined
}

export function isGoogleDriveConnected(): boolean {
  return !!cachedToken && cachedToken.expiresAt > Date.now()
}

/** The connected Google account's email, once known — undefined until fetchConnectedEmail
 *  resolves (or if it failed, or if not connected at all). Useful on a shared device so the
 *  committee can see whose account backups are going to. */
export function getConnectedAccountEmail(): string | undefined {
  return isGoogleDriveConnected() ? connectedEmail : undefined
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Google Drive request failed (${response.status}): ${body.slice(0, 200)}`)
  }
  return response
}

async function findOrCreateAppFolder(): Promise<string> {
  const query = encodeURIComponent(`name = '${APP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)
  const listResp = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`)
  const listData = (await listResp.json()) as { files: Array<{ id: string; name: string }> }
  if (listData.files.length > 0) return listData.files[0].id

  const createResp = await driveFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  const created = (await createResp.json()) as { id: string }
  return created.id
}

export interface DriveBackupFile {
  id: string
  name: string
  createdTime: string
  size?: string
}

export async function listDriveBackups(): Promise<DriveBackupFile[]> {
  const folderId = await findOrCreateAppFolder()
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const resp = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime,size)&orderBy=createdTime desc`,
  )
  const data = (await resp.json()) as { files: DriveBackupFile[] }
  return data.files
}

export async function uploadBackupToDrive(filename: string, jsonContent: string): Promise<void> {
  const folderId = await findOrCreateAppFolder()
  const boundary = `gnm-${Date.now()}`
  const metadata = { name: filename, parents: [folderId], mimeType: 'application/json' }
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    `${jsonContent}\r\n` +
    `--${boundary}--`

  await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
}

export async function downloadBackupFromDrive(fileId: string): Promise<unknown> {
  const resp = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)
  return resp.json()
}
