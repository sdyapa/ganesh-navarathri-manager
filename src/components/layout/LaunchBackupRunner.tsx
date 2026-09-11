import { useEffect, useRef } from 'react'
import { runLaunchBackup } from '@/services/localBackupService'

/** Renders nothing — fires the silent on-launch local backup exactly once per app load. The
 *  ranRef guard exists because React 18 StrictMode double-invokes mount effects in development;
 *  without it a dev session would write two backup files per launch. */
export function LaunchBackupRunner() {
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    runLaunchBackup()
  }, [])

  return null
}
