// Fetches a backup JSON file directly from a public GitHub URL, as an alternative to picking a
// local file — this repo keeps a running archive of backups under backups/<year>/ (see
// backups/README.md), so pointing at that file directly (e.g. from a phone, where downloading
// then re-uploading a file is more friction) is a natural second import path. Only works for
// PUBLIC repos/files — no auth token is ever sent, matching this app's "no backend, no secrets"
// design (see README §7's identical reasoning for Google Drive's narrow scope).

/** Accepts either a normal GitHub "blob" URL (what you get from browsing the repo, or the
 *  address bar) or an already-raw raw.githubusercontent.com URL, and returns the raw-content
 *  URL to actually fetch. Rejects anything that isn't recognizably a GitHub file URL, rather
 *  than silently trying to fetch an arbitrary site — the same "fail loud, not vague" pattern
 *  this app's backup import already follows for a malformed file. */
export function toGitHubRawUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.hostname === 'raw.githubusercontent.com') {
    return url.toString()
  }

  if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
    // /<owner>/<repo>/blob/<ref>/<path...>  ->  raw.githubusercontent.com/<owner>/<repo>/<ref>/<path...>
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/)
    if (!match) return null
    const [, owner, repo, ref, path] = match
    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`
  }

  return null
}

/** Best-effort guess at this deployment's own owner/repo, from the URL it's being served at — a
 *  GitHub Pages project page is always served from `<owner>.github.io/<repo>/...`, so both can
 *  be read straight off `window.location` with zero configuration. Returns null for local dev
 *  (localhost) or a user/org root page, where there's nothing sensible to guess — the Browse UI
 *  falls back to letting the user type both fields in by hand in that case. */
export function detectOwnRepo(): { owner: string; repo: string } | null {
  const host = window.location.hostname
  if (!host.endsWith('.github.io')) return null
  const owner = host.slice(0, -'.github.io'.length)
  const repo = window.location.pathname.split('/').filter(Boolean)[0]
  if (!owner || !repo) return null
  return { owner, repo }
}

export interface GitHubBackupFile {
  /** Path within the repo, e.g. "backups/2026/ganesh-navarathri-2026-backup-2026-09-11-1743.json". */
  path: string
  /** Direct raw-content URL — already the right shape to fetch with no further conversion. */
  downloadUrl: string
  size: number
}

interface GitHubContentsEntry {
  name: string
  path: string
  type: 'file' | 'dir' | 'symlink' | 'submodule'
  size: number
  download_url: string | null
}

/** Recursively lists every .json file under `basePath` (default "backups", matching this
 *  repo's own convention — see backups/README.md) using GitHub's public Contents API. Works
 *  for any public repo with no auth token; GitHub returns CORS headers on this endpoint for
 *  public data, so it's callable directly from the browser. Unauthenticated requests are
 *  rate-limited to 60/hour per IP by GitHub — plenty for occasional personal use, but not
 *  something to poll. */
export async function listGitHubBackupFiles(
  owner: string,
  repo: string,
  branch: string,
  basePath = 'backups',
): Promise<GitHubBackupFile[]> {
  const results: GitHubBackupFile[] = []

  async function walk(path: string): Promise<void> {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) {
      if (response.status === 404) throw new Error(`No "${path}" folder found in ${owner}/${repo} on branch "${branch}".`)
      if (response.status === 403) throw new Error('GitHub API rate limit reached (60 requests/hour when not signed in) — please try again later.')
      throw new Error(`GitHub request failed (${response.status}).`)
    }
    const entries = (await response.json()) as GitHubContentsEntry[] | GitHubContentsEntry
    for (const entry of Array.isArray(entries) ? entries : [entries]) {
      if (entry.type === 'dir') {
        await walk(entry.path)
      } else if (entry.type === 'file' && entry.name.toLowerCase().endsWith('.json') && entry.download_url) {
        results.push({ path: entry.path, downloadUrl: entry.download_url, size: entry.size })
      }
    }
  }

  await walk(basePath)
  return results.sort((a, b) => b.path.localeCompare(a.path)) // newest year/filename first, alphabetically
}

export interface GitHubFetchResult {
  ok: true
  data: unknown
}
export interface GitHubFetchError {
  ok: false
  error: string
}

/** Fetches and JSON-parses a backup file from a public GitHub URL. Returns a result object
 *  rather than throwing, matching inspectBackupFile's own "never throw, describe the problem"
 *  contract — the caller feeds `data` straight into that same function afterward. */
export async function fetchBackupFromGitHub(rawInput: string): Promise<GitHubFetchResult | GitHubFetchError> {
  const rawUrl = toGitHubRawUrl(rawInput)
  if (!rawUrl) {
    return {
      ok: false,
      error:
        'That doesn\'t look like a GitHub file link. Paste a link to the file itself — either the normal github.com "blob" URL, or a raw.githubusercontent.com URL.',
    }
  }

  let response: Response
  try {
    response = await fetch(rawUrl)
  } catch {
    return { ok: false, error: 'Could not reach GitHub. Check your internet connection and try again.' }
  }

  if (!response.ok) {
    if (response.status === 404) {
      return {
        ok: false,
        error: 'GitHub returned "not found" for that link. Double check the URL — a private repo, or a typo in the path/branch, will also cause this.',
      }
    }
    return { ok: false, error: `GitHub request failed (${response.status}). Please try again.` }
  }

  try {
    const data = await response.json()
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'That file is not valid JSON, so it could not be read as a backup.' }
  }
}
