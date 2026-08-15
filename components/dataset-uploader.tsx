'use client'

import { useCallback, useRef, useState } from 'react'
import Papa from 'papaparse'
import { CloudUpload, LoaderCircle, CheckCircle2, AlertTriangle } from 'lucide-react'

const BATCH_SIZE = 1000

type Status = 'idle' | 'uploading' | 'done' | 'error'

type Progress = {
  inserted: number
  skipped: number
  bytes: number
  total: number
}

function slugifySource(fileName: string) {
  return fileName
    .replace(/\.csv$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'upload'
}

async function postBatch(source: string, rows: { text: string; label: unknown }[]) {
  const res = await fetch('/api/datasets/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, rows }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Upload failed.')
  return data as { inserted: number; skipped: number }
}

export function DatasetUploader({ onComplete }: { onComplete?: () => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<Progress>({ inserted: 0, skipped: 0, bytes: 0, total: 0 })
  const [message, setMessage] = useState<string>('')
  const [source, setSource] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      const src = source.trim() || slugifySource(file.name)
      setStatus('uploading')
      setMessage(`Streaming ${file.name} → source "${src}"`)
      setProgress({ inserted: 0, skipped: 0, bytes: 0, total: file.size })

      let buffer: { text: string; label: unknown }[] = []
      let inserted = 0
      let skipped = 0
      let failed = false

      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        chunkSize: 1024 * 512,
        chunk: async (results, parser) => {
          if (failed) return
          for (const row of results.data) {
            const text = (row.text ?? '').trim()
            if (!text) {
              skipped++
              continue
            }
            buffer.push({ text, label: row.label })
          }

          if (buffer.length >= BATCH_SIZE) {
            parser.pause()
            try {
              while (buffer.length >= BATCH_SIZE) {
                const batch = buffer.slice(0, BATCH_SIZE)
                buffer = buffer.slice(BATCH_SIZE)
                const r = await postBatch(src, batch)
                inserted += r.inserted
                skipped += r.skipped
              }
              setProgress({
                inserted,
                skipped,
                bytes: results.meta.cursor,
                total: file.size,
              })
              parser.resume()
            } catch (err) {
              failed = true
              setStatus('error')
              setMessage(err instanceof Error ? err.message : 'Upload failed.')
              parser.abort()
            }
          }
        },
        complete: async () => {
          if (failed) return
          try {
            while (buffer.length > 0) {
              const batch = buffer.slice(0, BATCH_SIZE)
              buffer = buffer.slice(BATCH_SIZE)
              const r = await postBatch(src, batch)
              inserted += r.inserted
              skipped += r.skipped
            }
            setProgress({ inserted, skipped, bytes: file.size, total: file.size })
            setStatus('done')
            setMessage(`Imported ${inserted.toLocaleString()} rows into source "${src}".`)
            onComplete?.()
          } catch (err) {
            setStatus('error')
            setMessage(err instanceof Error ? err.message : 'Upload failed.')
          }
        },
        error: (err) => {
          setStatus('error')
          setMessage(err.message)
        },
      })
    },
    [source, onComplete],
  )

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.bytes / progress.total) * 100)) : 0
  const busy = status === 'uploading'

  return (
    <section className="panel" aria-labelledby="upload-heading">
      <p className="eyebrow">Import</p>
      <h2 id="upload-heading" className="mt-2 text-lg font-semibold">
        Upload a labeled CSV
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Streams large files (any size) directly into <span className="font-mono">training_examples</span>. Expects{' '}
        <span className="font-mono">text,label</span> columns.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="mb-1.5 block font-medium text-muted-foreground">Source name (optional)</span>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="auto from filename"
            disabled={busy}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <CloudUpload className="size-4" aria-hidden="true" />
          )}
          {busy ? 'Uploading…' : 'Choose CSV'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onSelect}
          className="sr-only"
        />
      </div>

      {status !== 'idle' && (
        <div className="mt-4">
          {busy && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          <p
            className={`mt-2 flex items-center gap-2 text-sm ${
              status === 'error'
                ? 'text-destructive'
                : status === 'done'
                  ? 'text-primary'
                  : 'text-muted-foreground'
            }`}
            role={status === 'error' ? 'alert' : 'status'}
          >
            {status === 'error' && <AlertTriangle className="size-4" aria-hidden="true" />}
            {status === 'done' && <CheckCircle2 className="size-4" aria-hidden="true" />}
            {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            {message}
          </p>
          {(busy || status === 'done') && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {progress.inserted.toLocaleString()} inserted · {progress.skipped.toLocaleString()} skipped
              {busy && ` · ${pct}%`}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
