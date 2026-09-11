import { db } from '@/db/db'

const RECORD_ID = 'directory'

export async function saveLocalBackupDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await db.localBackupHandle.put({ id: RECORD_ID, handle })
}

export async function getLocalBackupDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const record = await db.localBackupHandle.get(RECORD_ID)
  return record?.handle
}

export async function clearLocalBackupDirectoryHandle(): Promise<void> {
  await db.localBackupHandle.delete(RECORD_ID)
}
