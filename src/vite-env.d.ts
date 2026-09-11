/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_BASE_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// File System Access API surface not yet in this project's bundled lib.dom.d.ts (TypeScript
// 5.5's DOM lib ships FileSystemDirectoryHandle/FileSystemFileHandle but not the entry points
// that create them, or the permission methods needed before writing to a previously granted
// handle). Minimal surface only — just what src/lib/localBackup.ts actually calls.
type FileSystemPermissionMode = 'read' | 'readwrite'

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface Window {
  showDirectoryPicker?(options?: { id?: string; mode?: FileSystemPermissionMode }): Promise<FileSystemDirectoryHandle>
}
