import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { ensureAppInitialized } from '@/db/init'
import type { YearProfile } from '@/types'

const STORAGE_KEY = 'gnm.currentYearProfileId'

interface YearContextValue {
  years: YearProfile[]
  currentYear: YearProfile | undefined
  currentYearId: string | undefined
  setCurrentYearId: (id: string) => void
  initializing: boolean
}

const YearContext = createContext<YearContextValue | null>(null)

export function YearProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true)
  const [currentYearId, setCurrentYearIdState] = useState<string | undefined>(undefined)

  const years = useLiveQuery(() => db.yearProfiles.toArray(), [], undefined)
  const sortedYears = years ? [...years].sort((a, b) => b.year - a.year) : undefined

  useEffect(() => {
    let cancelled = false
    ensureAppInitialized().then((profiles) => {
      if (cancelled) return
      const stored = localStorage.getItem(STORAGE_KEY)
      const validStored = stored && profiles.some((p) => p.id === stored) ? stored : undefined
      const fallback = [...profiles].sort((a, b) => b.year - a.year)[0]?.id
      setCurrentYearIdState(validStored ?? fallback)
      setInitializing(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sortedYears || sortedYears.length === 0) return
    if (currentYearId && sortedYears.some((y) => y.id === currentYearId)) return
    // Current selection was deleted (or none chosen yet) — fall back to the most recent year.
    setCurrentYearIdState(sortedYears[0].id)
  }, [sortedYears, currentYearId])

  const setCurrentYearId = (id: string) => {
    setCurrentYearIdState(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  const currentYear = sortedYears?.find((y) => y.id === currentYearId)

  return (
    <YearContext.Provider
      value={{ years: sortedYears ?? [], currentYear, currentYearId, setCurrentYearId, initializing }}
    >
      {children}
    </YearContext.Provider>
  )
}

export function useYearContext(): YearContextValue {
  const ctx = useContext(YearContext)
  if (!ctx) throw new Error('useYearContext must be used within YearProvider')
  return ctx
}
