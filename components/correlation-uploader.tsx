'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, CloudUpload, FileUp, LoaderCircle, RotateCcw } from 'lucide-react'

type Status = 'idle' | 'reading' | 'error'

export function CorrelationUploader({
  active,
  onSelected,
  onReset,
}: {
  active: boolean
  onSelected: (csvText: string, label: string) => void
  onReset: () => void
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handlePick(file: File | undefined) {
    if (!file) return
    setStatus('reading')
    setMessage('')
    try {
      const text = await file.text()
      if (!text.trim()) throw new Error('That file looks empty.')
      setFileName(file.name)
      setStatus('idle')
      onSelected(text, file.name)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Could not read that file.')
    }
  }

  function reset() {
    if (inputRef.current) inputRef.current.value = ''
    setFileName('')
    setStatus('idle')
    setMessage('')
    onReset()
  }

  return (
    <section className="panel" aria-labelledby="correlation-upload-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Import</p>
          <h3 id="correlation-upload-heading" className="mt-2 text-lg font-semibold">
            Cluster your own cases
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            Upload a case CSV to run DBSCAN on your own records instead of the bundled sample. Radius and min-points
            controls above apply to whichever dataset is active.
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

      <div className="mt-4 rounded-xl border border-dashed border-border p-4 sm:max-w-md">
        <p className="text-sm font-medium">Cases CSV</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">case_id, date, text, location, district, lat, lon</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === 'reading'}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-50"
        >
          {status === 'reading' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FileUp className="size-4" aria-hidden="true" />}
          {fileName || 'Choose file'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={status === 'reading'}
          onChange={(event) => handlePick(event.target.files?.[0])}
          className="sr-only"
        />
      </div>

      {active && status === 'idle' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-primary" role="status">
          <CloudUpload className="size-4" aria-hidden="true" />
          Viewing clusters from {fileName}. Adjust radius or min points above to re-cluster it.
        </p>
      )}
      {status === 'error' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertTriangle className="size-4" aria-hidden="true" />
          {message}
        </p>
      )}
    </section>
  )
}
