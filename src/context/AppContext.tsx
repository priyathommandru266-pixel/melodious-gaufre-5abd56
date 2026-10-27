/**
 * Global app state: which mode we are in (live AWS / demo / not configured),
 * the backend's advertised capabilities, and the conversion job list.
 *
 * - live:    VITE_API_BASE_URL is set and demo mode is off. All data comes from the API.
 * - demo:    clearly-labelled sample data + local, in-browser TXT conversion only.
 * - offline: no backend configured and demo mode off. Nothing is shown as processed.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { CLIENT_MAX_UPLOAD_BYTES, isBackendConfigured } from '@/lib/config'
import { CONVERSION_CATALOG, LOCAL_DEMO_CONVERSIONS, optionsFromCapabilities } from '@/lib/conversions'
import { getSampleJobs } from '@/lib/demo'
import type { Capabilities, ConversionOption, Job } from '@/lib/types'

export type AppMode = 'live' | 'demo' | 'offline'
type LoadState = 'idle' | 'loading' | 'ready' | 'error'

interface AppState {
  mode: AppMode
  backendConfigured: boolean
  demoEnabled: boolean
  setDemoEnabled: (v: boolean) => void

  capabilities: Capabilities | null
  capabilitiesState: LoadState
  capabilitiesError: string | null
  /** Conversions the current mode can genuinely perform. */
  conversionOptions: ConversionOption[]
  maxUploadBytes: number

  jobs: Job[]
  jobsState: LoadState
  jobsError: string | null
  hasMoreJobs: boolean
  lastLoadedAt: Date | null
  refresh: () => Promise<void>
  loadMoreJobs: () => Promise<void>
  upsertJob: (job: Job) => void
  addLocalDemoJob: (job: Job, output: Blob) => void
  getLocalDemoOutput: (jobId: string) => Blob | undefined
}

const AppContext = createContext<AppState | null>(null)
const DEMO_PREF_KEY = 'fcdb:demo-mode' // UI preference only — never job data

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [demoEnabled, setDemoState] = useState(false)
  const mode: AppMode = demoEnabled ? 'demo' : isBackendConfigured ? 'live' : 'offline'

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [capabilitiesState, setCapState] = useState<LoadState>('idle')
  const [capabilitiesError, setCapError] = useState<string | null>(null)

  const [liveJobs, setLiveJobs] = useState<Job[]>([])
  const [localDemoJobs, setLocalDemoJobs] = useState<Job[]>([])
  const [sampleJobs, setSampleJobs] = useState<Job[]>([])
  const [jobsState, setJobsState] = useState<LoadState>('idle')
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [nextToken, setNextToken] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  const demoOutputs = useRef(new Map<string, Blob>())

  useEffect(() => {
    if (localStorage.getItem(DEMO_PREF_KEY) === 'on') setDemoState(true)
  }, [])

  const setDemoEnabled = useCallback((v: boolean) => {
    setDemoState(v)
    localStorage.setItem(DEMO_PREF_KEY, v ? 'on' : 'off')
  }, [])

  const loadCapabilities = useCallback(async () => {
    if (!isBackendConfigured) return
    setCapState('loading')
    setCapError(null)
    try {
      setCapabilities(await api.getCapabilities())
      setCapState('ready')
    } catch (e) {
      setCapabilities(null)
      setCapError(e instanceof ApiError ? e.message : 'Failed to load backend capabilities.')
      setCapState('error')
    }
  }, [])

  const loadJobs = useCallback(async () => {
    if (mode === 'demo') {
      setSampleJobs(getSampleJobs())
      setJobsState('ready')
      setJobsError(null)
      setLastLoadedAt(new Date())
      return
    }
    if (mode === 'offline') {
      setJobsState('idle')
      return
    }
    setJobsState('loading')
    setJobsError(null)
    try {
      const res = await api.listJobs()
      setLiveJobs(res.items)
      setNextToken(res.nextToken)
      setJobsState('ready')
      setLastLoadedAt(new Date())
    } catch (e) {
      setJobsError(e instanceof ApiError ? e.message : 'Failed to load conversion history.')
      setJobsState('error')
    }
  }, [mode])

  const loadMoreJobs = useCallback(async () => {
    if (mode !== 'live' || !nextToken) return
    try {
      const res = await api.listJobs(nextToken)
      setLiveJobs((js) => {
        const seen = new Set(js.map((j) => j.jobId))
        return [...js, ...res.items.filter((j) => !seen.has(j.jobId))]
      })
      setNextToken(res.nextToken)
    } catch (e) {
      setJobsError(e instanceof ApiError ? e.message : 'Failed to load more jobs.')
    }
  }, [mode, nextToken])

  useEffect(() => {
    if (mode === 'live') loadCapabilities()
    loadJobs()
  }, [mode, loadCapabilities, loadJobs])

  const refresh = useCallback(async () => {
    await Promise.all([mode === 'live' ? loadCapabilities() : Promise.resolve(), loadJobs()])
  }, [mode, loadCapabilities, loadJobs])

  const upsertJob = useCallback((job: Job) => {
    setLiveJobs((js) => [job, ...js.filter((j) => j.jobId !== job.jobId)])
  }, [])

  const addLocalDemoJob = useCallback((job: Job, output: Blob) => {
    demoOutputs.current.set(job.jobId, output)
    setLocalDemoJobs((js) => [job, ...js])
  }, [])

  const getLocalDemoOutput = useCallback((id: string) => demoOutputs.current.get(id), [])

  const conversionOptions = useMemo<ConversionOption[]>(() => {
    if (mode === 'live') return optionsFromCapabilities(capabilities)
    if (mode === 'demo') return LOCAL_DEMO_CONVERSIONS.map((id) => CONVERSION_CATALOG[id])
    return []
  }, [mode, capabilities])

  const maxUploadBytes = useMemo(() => {
    const server = mode === 'live' ? capabilities?.maxUploadBytes : undefined
    return server ? Math.min(server, CLIENT_MAX_UPLOAD_BYTES) : CLIENT_MAX_UPLOAD_BYTES
  }, [mode, capabilities])

  const jobs =
    mode === 'live' ? liveJobs : mode === 'demo' ? [...localDemoJobs, ...sampleJobs] : []

  const value: AppState = {
    mode,
    backendConfigured: isBackendConfigured,
    demoEnabled,
    setDemoEnabled,
    capabilities,
    capabilitiesState,
    capabilitiesError,
    conversionOptions,
    maxUploadBytes,
    jobs,
    jobsState,
    jobsError,
    hasMoreJobs: mode === 'live' && !!nextToken,
    lastLoadedAt,
    refresh,
    loadMoreJobs,
    upsertJob,
    addLocalDemoJob,
    getLocalDemoOutput,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
