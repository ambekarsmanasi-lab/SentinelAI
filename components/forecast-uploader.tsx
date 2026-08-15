'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CloudUpload, FileUp, LoaderCircle, RotateCcw } from 'lucide-react'
import type { Coordinate, RouteForecast, StateForecast } from '@/lib/forecast'

type DashboardData = {
  periods: number
  states: StateForecast[]
  routes: RouteForecast[]
  coordinates: Coordinate[]
  updatedAt: string
}

type Status = 'idle' | 'uploading' | 'done' | 'error'

async function readFile(file: File | undefined): Promise<string | undefined> {
  if (!file) return undefined
  return file.text()
}

export function ForecastUploader({
  periods,
  active,
  onAnalyzed,
  onReset,
}: {
  periods: number
  active: boolean
  onAnalyzed: (data: DashboardData, label: string) => void
  onReset: () => void
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [seizuresName, setSeizuresName] = useState('')
  const [routesName, setRoutesName] = useState('')
  const seizuresRef = useRef<HTMLInputElement>(null)
  const routesRef = useRef<HTMLInputElement>(null)

  const busy = status === 'uploading'

  async function analyze() {
    const seizuresFile = seizuresRef.current?.files?.[0]
    const routesFile = routesRef.current?.files?.[0]
    if (!seizuresFile && !routesFile) {
      setStatus('error')
      setMessage('Select at least one CSV file to analyze.')
      return
    }

    setStatus('uploading')
    setMessage('Running ordinary least squares projection on uploaded data…')
    try {
      const [seizuresCsv, routesCsv] = await Promise.all([readFile(seizuresFile), readFile(routesFile)])
      const response = await fetch('/api/forecast/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periods, seizuresCsv, routesCsv }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Upload failed.')

      const parts = [seizuresFile?.name, routesFile?.name].filter(Boolean) as string[]
      setStatus('done')
      setMessage(`Analyzed ${data.states.length} state series and ${data.routes.length} corridors from your files.`)
      onAnalyzed(data as DashboardData, parts.join(' + '))
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Upload failed.')
    }
  }

  function reset() {
    if (seizuresRef.current) seizuresRef.current.value = ''
    if (routesRef.current) routesRef.current.value = ''
    setSeizuresName('')
    setRoutesName('')
    setStatus('idle')
    setMessage('')
    onReset()
  }

  return (
    <section className="panel" aria-labelledby="forecast-upload-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Import</p>
          <h3 id="forecast-upload-heading" className="mt-2 text-lg font-semibold">
            Analyze your own data
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            Upload seizure and/or corridor CSVs to run the six-month projection on your files instead of the bundled
            source records. Falls back to bundled data for any file you leave empty.
          </p>
        </div>
        {active && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset to source data
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FilePicker
          inputRef={seizuresRef}
          disabled={busy}
          name={seizuresName}
          onPick={(name) => setSeizuresName(name)}
          label="Seizures CSV"
          hint="date, state, drug_type, seizure_kg"
        />
        <FilePicker
          inputRef={routesRef}
          disabled={busy}
          name={routesName}
          onPick={(name) => setRoutesName(name)}
          label="Routes CSV"
          hint="date, origin, destination, via, drug_type, volume_kg"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={analyze}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CloudUpload className="size-4" aria-hidden="true" />}
          {busy ? 'Analyzing…' : 'Run forecast on files'}
        </button>
      </div>

      {status !== 'idle' && (
        <p
          className={`mt-3 flex items-center gap-2 text-sm ${
            status === 'error' ? 'text-destructive' : status === 'done' ? 'text-primary' : 'text-muted-foreground'
          }`}
          role={status === 'error' ? 'alert' : 'status'}
        >
          {status === 'error' && <AlertTriangle className="size-4" aria-hidden="true" />}
          {status === 'done' && <CheckCircle2 className="size-4" aria-hidden="true" />}
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {message}
        </p>
      )}
    </section>
  )
}

function FilePicker({
  inputRef,
  disabled,
  name,
  onPick,
  label,
  hint,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  disabled: boolean
  name: string
  onPick: (name: string) => void
  label: string
  hint: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{hint}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-50"
      >
        <FileUp className="size-4" aria-hidden="true" />
        {name || 'Choose file'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        disabled={disabled}
        onChange={(event) => onPick(event.target.files?.[0]?.name ?? '')}
        className="sr-only"
      />
    </div>
  )
}
