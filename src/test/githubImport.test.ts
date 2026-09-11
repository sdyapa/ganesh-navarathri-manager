import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectOwnRepo, fetchBackupFromGitHub, listGitHubBackupFiles, toGitHubRawUrl } from '@/lib/githubImport'

describe('toGitHubRawUrl', () => {
  it('converts a normal github.com blob URL into its raw.githubusercontent.com equivalent', () => {
    expect(toGitHubRawUrl('https://github.com/sdyapa/ganesh-navarathri-manager/blob/master/backups/2025/foo.json')).toBe(
      'https://raw.githubusercontent.com/sdyapa/ganesh-navarathri-manager/master/backups/2025/foo.json',
    )
  })

  it('passes an already-raw URL through unchanged', () => {
    const raw = 'https://raw.githubusercontent.com/sdyapa/ganesh-navarathri-manager/master/backups/2025/foo.json'
    expect(toGitHubRawUrl(raw)).toBe(raw)
  })

  it('rejects a non-GitHub URL rather than silently trying to fetch it', () => {
    expect(toGitHubRawUrl('https://example.com/foo.json')).toBeNull()
  })

  it('rejects a github.com URL that is not a file blob link (e.g. a repo root or PR link)', () => {
    expect(toGitHubRawUrl('https://github.com/sdyapa/ganesh-navarathri-manager')).toBeNull()
    expect(toGitHubRawUrl('https://github.com/sdyapa/ganesh-navarathri-manager/pull/1')).toBeNull()
  })

  it('rejects garbage input without throwing', () => {
    expect(toGitHubRawUrl('not a url at all')).toBeNull()
    expect(toGitHubRawUrl('')).toBeNull()
  })
})

describe('fetchBackupFromGitHub', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('fetches and JSON-parses a valid backup URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ appName: 'Ganesh Navarathri Manager' }),
    }) as unknown as typeof fetch

    const result = await fetchBackupFromGitHub('https://raw.githubusercontent.com/sdyapa/ganesh-navarathri-manager/master/backups/2025/foo.json')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual({ appName: 'Ganesh Navarathri Manager' })
  })

  it('returns a descriptive error for a URL that is not recognizably GitHub, without calling fetch', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch
    const result = await fetchBackupFromGitHub('https://example.com/foo.json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/doesn't look like a GitHub file link/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('surfaces a friendly message on a 404 (e.g. private repo or typo)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
    const result = await fetchBackupFromGitHub('https://raw.githubusercontent.com/sdyapa/x/master/y.json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not found/)
  })

  it('surfaces a friendly message when the fetched content is not valid JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    }) as unknown as typeof fetch
    const result = await fetchBackupFromGitHub('https://raw.githubusercontent.com/sdyapa/x/master/y.json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not valid JSON/)
  })

  it('surfaces a friendly message when the network request itself fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch
    const result = await fetchBackupFromGitHub('https://raw.githubusercontent.com/sdyapa/x/master/y.json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Could not reach GitHub/)
  })
})

describe('listGitHubBackupFiles', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('recursively walks year subfolders and returns only .json files, newest path first', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/contents/backups?')) {
        return {
          ok: true,
          json: async () => [
            { name: '2025', path: 'backups/2025', type: 'dir', size: 0, download_url: null },
            { name: '2026', path: 'backups/2026', type: 'dir', size: 0, download_url: null },
            { name: 'README.md', path: 'backups/README.md', type: 'file', size: 500, download_url: 'https://raw.example/README.md' },
          ],
        }
      }
      if (url.includes('/contents/backups%2F2025?') || url.includes('/contents/backups/2025?')) {
        return {
          ok: true,
          json: async () => [
            { name: 'foo.json', path: 'backups/2025/foo.json', type: 'file', size: 1000, download_url: 'https://raw.example/2025/foo.json' },
          ],
        }
      }
      if (url.includes('/contents/backups%2F2026?') || url.includes('/contents/backups/2026?')) {
        return {
          ok: true,
          json: async () => [
            { name: 'bar.json', path: 'backups/2026/bar.json', type: 'file', size: 2000, download_url: 'https://raw.example/2026/bar.json' },
          ],
        }
      }
      throw new Error(`unexpected URL in test: ${url}`)
    }) as unknown as typeof fetch

    const files = await listGitHubBackupFiles('sdyapa', 'ganesh-navarathri-manager', 'master')
    expect(files.map((f) => f.path)).toEqual(['backups/2026/bar.json', 'backups/2025/foo.json'])
    expect(files.every((f) => f.downloadUrl.startsWith('https://raw.example/'))).toBe(true)
  })

  it('throws a descriptive error when the backups folder does not exist (404)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
    await expect(listGitHubBackupFiles('sdyapa', 'nonexistent-repo', 'master')).rejects.toThrow(/No "backups" folder/)
  })

  it('throws a descriptive error on GitHub API rate limiting (403)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch
    await expect(listGitHubBackupFiles('sdyapa', 'ganesh-navarathri-manager', 'master')).rejects.toThrow(/rate limit/)
  })
})

describe('detectOwnRepo', () => {
  // This suite runs under vitest's 'node' test environment (see vite.config.ts — no test
  // renders a component, so jsdom is deliberately skipped), which has no global `window` at
  // all. Stubbing a minimal one for the duration of these tests only is simplest — detectOwnRepo
  // itself only ever runs in a real browser at runtime, so this is purely a test-time shim.
  const originalWindow = (global as { window?: unknown }).window

  afterEach(() => {
    (global as { window?: unknown }).window = originalWindow
  })

  it('parses owner/repo from a GitHub Pages project-page URL', () => {
    (global as { window?: unknown }).window = { location: { hostname: 'sdyapa.github.io', pathname: '/ganesh-navarathri-manager/' } }
    expect(detectOwnRepo()).toEqual({ owner: 'sdyapa', repo: 'ganesh-navarathri-manager' })
  })

  it('returns null for local dev (not a github.io host)', () => {
    (global as { window?: unknown }).window = { location: { hostname: 'localhost', pathname: '/' } }
    expect(detectOwnRepo()).toBeNull()
  })
})
